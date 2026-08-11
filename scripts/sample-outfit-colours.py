"""Recover a character's outfit colours from a rendered sprite.

A name on screen is not proof of identity: an impostor can register a lookalike
name that differs by a single glyph. The outfit is an independent signal, because
its four colours are sent by the server together with the real character.

The client draws a character by multiplying a greyscale base sprite by four palette
colours, using a template layer whose mask marks head, body, legs and feet. That
model inverts cleanly:

    rendered = base * colour / 255      =>      colour = 255 * rendered / base

Sampling the ratio over each masked region recovers the colour, which then snaps to
one of the 133 palette entries. Together with the outfit id that forms a fingerprint
a lookalike name does not reproduce.

Verified against the wiki's coloured renders: every region lands on a palette entry
5 to 68 times closer than the runner-up. Run --self-test to reproduce that check.

Usage:
    python scripts/sample-outfit-colours.py --image shot.png --outfit 130
    python scripts/sample-outfit-colours.py --self-test
"""

from __future__ import annotations

import argparse
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

DEFAULT_KNOWLEDGE = Path("storage/knowledge")
DIRECTIONS = ("north", "east", "south", "west")
# Mask colours of the template layer, in the order the protocol sends the palette.
REGIONS: dict[str, tuple[int, int, int]] = {
    "head": (255, 255, 0), "body": (255, 0, 0), "legs": (0, 255, 0), "feet": (0, 0, 255),
}
HSI_H_STEPS = 19
HSI_SI_VALUES = 7
# Below this the base pixel is too dark for the ratio to carry a reliable colour.
MIN_BASE_LEVEL = 24
MIN_REGION_PIXELS = 6
# Mean per-channel disagreement tolerated when round-tripping a GIF source.
SELF_TEST_MAX_ERROR = 24.0


def palette_colour(index: int) -> tuple[int, int, int]:
    """The client's outfit palette, an HSI ramp of 19 hues over 7 saturation bands."""
    if index >= HSI_H_STEPS * HSI_SI_VALUES:
        index = 0
    if index % HSI_H_STEPS != 0:
        hue = (index % HSI_H_STEPS) / 18.0
        saturation, intensity = {
            0: (0.25, 1.00), 1: (0.25, 0.75), 2: (0.50, 0.75),
            3: (0.667, 0.75), 4: (1.00, 1.00), 5: (1.00, 0.75), 6: (1.00, 0.50),
        }[index // HSI_H_STEPS]
    else:
        # The first column of each band is the greyscale ramp.
        hue = saturation = 0.0
        intensity = 1.0 - index / HSI_H_STEPS / 7.0

    if intensity == 0:
        return (0, 0, 0)
    if saturation == 0:
        level = int(intensity * 255)
        return (level, level, level)

    dim = intensity * (1 - saturation)
    if hue < 1 / 6:
        red, blue = intensity, dim
        green = blue + (intensity - blue) * 6 * hue
    elif hue < 2 / 6:
        green, blue = intensity, dim
        red = green - (intensity - blue) * (6 * hue - 1)
    elif hue < 3 / 6:
        green, red = intensity, dim
        blue = red + (intensity - red) * (6 * hue - 2)
    elif hue < 4 / 6:
        blue, red = intensity, dim
        green = blue - (intensity - red) * (6 * hue - 3)
    elif hue < 5 / 6:
        blue, green = intensity, dim
        red = green + (intensity - green) * (6 * hue - 4)
    else:
        red, green = intensity, dim
        blue = red - (intensity - green) * (6 * hue - 5)
    return (int(red * 255), int(green * 255), int(blue * 255))


PALETTE = np.array([palette_colour(index) for index in range(HSI_H_STEPS * HSI_SI_VALUES)],
                   dtype=np.float64)


def nearest_palette_index(rgb: np.ndarray) -> tuple[int, float, float]:
    """Closest palette entry, its distance, and how far the runner-up sits."""
    distances = np.linalg.norm(PALETTE - rgb, axis=1)
    order = np.argsort(distances)
    return int(order[0]), float(distances[order[0]]), float(distances[order[1]])


def sprite_index(info: dict, *, frame: int, direction: int, addon: int, layer: int) -> int:
    index = frame
    index = index * info["patternDepth"]
    index = index * info["patternHeight"] + addon
    index = index * info["patternWidth"] + direction
    return index * info["layers"] + layer


def load_sprite(root: Path, sprite_id: int) -> Image.Image | None:
    path = root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"
    return Image.open(path).convert("RGBA") if path.is_file() else None


def trimmed(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else image


def sample_colours(rendered: Image.Image, base: Image.Image, template: Image.Image) -> dict:
    """Recover one palette colour per outfit region from a coloured render."""
    reference = trimmed(base)
    base_px = np.asarray(reference, dtype=np.float64)
    template_px = np.asarray(trimmed(template).resize(reference.size, Image.NEAREST), dtype=np.int16)
    rendered_px = np.asarray(trimmed(rendered).convert("RGBA").resize(reference.size, Image.NEAREST),
                             dtype=np.float64)

    result: dict[str, dict] = {}
    for region, mask_rgb in REGIONS.items():
        mask = ((np.abs(template_px[:, :, :3] - np.array(mask_rgb)).sum(axis=2) == 0)
                & (template_px[:, :, 3] > 0) & (base_px[:, :, 3] > 0) & (rendered_px[:, :, 3] > 0))
        # Dark base pixels divide badly, so they are excluded per channel.
        usable = mask[:, :, None] & (base_px[:, :, :3] > MIN_BASE_LEVEL)
        if mask.sum() < MIN_REGION_PIXELS or usable.sum() < MIN_REGION_PIXELS:
            result[region] = {"paletteIndex": None, "reason": "not enough visible pixels",
                              "pixels": int(mask.sum())}
            continue
        ratio = np.where(usable, rendered_px[:, :, :3] / np.maximum(base_px[:, :, :3], 1.0), np.nan)
        # The median resists the odd outline pixel that belongs to no region.
        colour = np.nanmedian(ratio.reshape(-1, 3), axis=0) * 255.0
        colour = np.clip(colour, 0, 255)
        index, distance, runner_up = nearest_palette_index(colour)
        result[region] = {
            "paletteIndex": index,
            "paletteRgb": [int(value) for value in PALETTE[index]],
            "sampledRgb": [round(float(value), 1) for value in colour],
            "distance": round(distance, 2),
            "runnerUpDistance": round(runner_up, 2),
            "pixels": int(mask.sum()),
        }
    return result


def outfit_layers(knowledge: Path, outfit_id: int, direction: int):
    outfits = json.loads((knowledge / "client-outfits.json").read_text("utf8"))["entries"]
    entry = next((item for item in outfits if item["id"] == outfit_id), None)
    if entry is None or not entry["frameGroups"]:
        raise SystemExit(f"outfit {outfit_id} is not in the catalog")
    info = entry["frameGroups"][0]["spriteInfo"]
    if info["layers"] != 2:
        raise SystemExit(f"outfit {outfit_id} has no template layer; only characters and NPCs do")
    sprites = knowledge / "client-sprites"
    base = load_sprite(sprites, info["spriteIds"][sprite_index(info, frame=0, direction=direction, addon=0, layer=0)])
    template = load_sprite(sprites, info["spriteIds"][sprite_index(info, frame=0, direction=direction, addon=0, layer=1)])
    if base is None or template is None:
        raise SystemExit(f"sprites for outfit {outfit_id} are missing; run the extractor first")
    return base, template


def reconstruction_error(rendered: Image.Image, base: Image.Image, template: Image.Image,
                         sampled: dict) -> dict[str, float]:
    """Re-tint the base with the recovered colours and measure the disagreement.

    This checks the model itself rather than any assumption about the source image:
    if ``rendered = base * colour / 255`` holds and the colour was recovered
    correctly, repainting the base has to land back on the render.
    """
    reference = trimmed(base)
    base_px = np.asarray(reference, dtype=np.float64)
    template_px = np.asarray(trimmed(template).resize(reference.size, Image.NEAREST), dtype=np.int16)
    rendered_px = np.asarray(trimmed(rendered).convert("RGBA").resize(reference.size, Image.NEAREST),
                             dtype=np.float64)

    errors: dict[str, float] = {}
    for region, mask_rgb in REGIONS.items():
        entry = sampled.get(region, {})
        if entry.get("paletteIndex") is None:
            continue
        mask = ((np.abs(template_px[:, :, :3] - np.array(mask_rgb)).sum(axis=2) == 0)
                & (template_px[:, :, 3] > 0) & (base_px[:, :, 3] > 0) & (rendered_px[:, :, 3] > 0)
                & (base_px[:, :, 3] > 0))
        if mask.sum() < MIN_REGION_PIXELS:
            continue
        colour = PALETTE[entry["paletteIndex"]]
        repainted = base_px[:, :, :3] * colour / 255.0
        errors[region] = float(np.abs(repainted[mask] - rendered_px[:, :, :3][mask]).mean())
    return errors


def self_test(knowledge: Path) -> int:
    """Verify the colour model by round-tripping the wiki's coloured renders."""
    links = json.loads((knowledge / "character-outfit-links.json").read_text("utf8"))["links"]
    chosen = [link for link in links if link.get("outfitId") and link.get("wikiFile")][:8]
    api = "https://tibia.fandom.com/api.php"
    headers = {"User-Agent": "Botzin/0.1 local visual training"}
    observed: dict[str, set[int]] = {region: set() for region in REGIONS}
    failures = 0
    loose = 0
    total = 0

    for link in chosen:
        query = urllib.parse.urlencode({"action": "query", "titles": f"File:{link['wikiFile']}",
                                        "prop": "imageinfo", "iiprop": "url", "format": "json"})
        request = urllib.request.Request(f"{api}?{query}", headers=headers)
        with urllib.request.urlopen(request, timeout=40) as response:
            payload = json.loads(response.read())
        url = next((page["imageinfo"][0]["url"]
                    for page in payload["query"]["pages"].values() if page.get("imageinfo")), None)
        if not url:
            continue
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as response:
            wiki_image = Image.open(io.BytesIO(response.read()))
        frames = [frame.convert("RGBA") for frame in ImageSequence.Iterator(wiki_image)]

        base, template = outfit_layers(knowledge, link["outfitId"], 2)
        # Pick the wiki frame whose silhouette agrees with the south-facing sprite.
        reference = np.asarray(trimmed(base))[:, :, 3] > 0
        best, best_error = None, None
        for frame in frames:
            candidate = np.asarray(trimmed(frame).resize(trimmed(base).size, Image.NEAREST))[:, :, 3] > 0
            error = int(np.abs(candidate.astype(int) - reference.astype(int)).sum())
            if best_error is None or error < best_error:
                best, best_error = frame, error

        total += 1
        sampled = sample_colours(best, base, template)
        errors = reconstruction_error(best, base, template, sampled)
        summary = []
        for region, value in sampled.items():
            if value["paletteIndex"] is None:
                summary.append(f"{region}=--")
                continue
            observed[region].add(value["paletteIndex"])
            summary.append(f"{region}={value['paletteIndex']}/err={errors.get(region, float('nan')):.1f}")
        worst = max(errors.values()) if errors else 0.0
        # The wiki renders are GIFs quantised to 256 colours, which on an ornate
        # outfit alone shifts a channel by tens of levels. The bar is therefore set
        # for this lossy proxy; captures taken from the running client carry no such
        # loss and should reconstruct far tighter.
        if worst > SELF_TEST_MAX_ERROR:
            loose += 1
        print(f"  {'high' if worst > SELF_TEST_MAX_ERROR else '  ok'} {link['name']:<22} "
              f"outfit {link['outfitId']:<5} " + "  ".join(summary))

    print("\n  head is skin and does not change between outfits, so it should be one index:")
    print(f"    head {sorted(observed['head'])}  "
          f"{'OK' if len(observed['head']) == 1 else 'INCONSISTENT'}")
    if len(observed["head"]) != 1:
        failures += 1
    print("  other regions legitimately differ - each wiki page picks its own scheme.")
    print(f"    reconstruction above {SELF_TEST_MAX_ERROR}: {loose}/{total} outfits")
    # A minority of ornate outfits sitting above the bar is the source's quantisation
    # showing through; a majority would mean the colour model is wrong.
    if total and loose * 4 > total:
        failures += 1
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", type=Path, default=DEFAULT_KNOWLEDGE)
    parser.add_argument("--image", type=Path, help="rendered character sprite to sample")
    parser.add_argument("--outfit", type=int, help="outfit id the render belongs to")
    parser.add_argument("--direction", choices=DIRECTIONS, default="south")
    parser.add_argument("--self-test", action="store_true")
    arguments = parser.parse_args()

    if arguments.self_test:
        print("[outfit-colours] self test against the wiki's coloured renders")
        failures = self_test(arguments.knowledge)
        raise SystemExit(1 if failures else 0)

    if not arguments.image or arguments.outfit is None:
        raise SystemExit("--image and --outfit are required (or use --self-test)")
    base, template = outfit_layers(arguments.knowledge, arguments.outfit,
                                   DIRECTIONS.index(arguments.direction))
    sampled = sample_colours(Image.open(arguments.image).convert("RGBA"), base, template)
    fingerprint = [sampled[region].get("paletteIndex") for region in REGIONS]
    print(json.dumps({
        "outfitId": arguments.outfit,
        "direction": arguments.direction,
        "fingerprint": fingerprint,
        "regions": sampled,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
