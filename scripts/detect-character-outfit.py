"""Locate a character in a screen capture and read its outfit fingerprint.

A screen capture has no alpha channel: the character is already composited over the
map, so the silhouette matching used on raw sprites does not apply. There is also a
circularity - identifying the outfit needs the colours, and reading the colours needs
the outfit.

Both fall out of solving them together. For a candidate outfit, direction and offset,
the four region colours have a closed form, because the client's compositing is
linear per region:

    rendered = base * colour / 255   =>   colour = 255 * median(rendered / base)

Fitting the colours then reconstructing the sprite gives a residual over the base's
opaque pixels. The candidate that explains the pixels wins, and its fitted colours
are the fingerprint. Background pixels never enter the fit: the base sprite's own
alpha decides which pixels belong to the character.

Search runs coarse to fine - every outfit at the box origin, then sub-pixel offsets
for the best few - because a full offset sweep over 394 outfits is wasted work.

Usage:
    python scripts/detect-character-outfit.py --image shot.png --box 120,80,64,64
    python scripts/detect-character-outfit.py --self-test
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_KNOWLEDGE = Path("storage/knowledge")
DIRECTIONS = ("north", "east", "south", "west")
REGIONS: dict[str, tuple[int, int, int]] = {
    "head": (255, 255, 0), "body": (255, 0, 0), "legs": (0, 255, 0), "feet": (0, 0, 255),
}
MIN_BASE_LEVEL = 24
MIN_REGION_PIXELS = 6
OFFSET_RADIUS = 4
COARSE_KEEP = 24
# A correct fit reconstructs the sprite almost exactly (residual well under 1 on a
# clean composite). Anything far above that is not the outfit on screen, and saying
# so beats reporting a confident wrong identity.
MAX_RESIDUAL = 8.0

HSI_H_STEPS = 19
HSI_SI_VALUES = 7


def palette_colour(index: int) -> tuple[int, int, int]:
    if index >= HSI_H_STEPS * HSI_SI_VALUES:
        index = 0
    if index % HSI_H_STEPS != 0:
        hue = (index % HSI_H_STEPS) / 18.0
        saturation, intensity = {
            0: (0.25, 1.00), 1: (0.25, 0.75), 2: (0.50, 0.75),
            3: (0.667, 0.75), 4: (1.00, 1.00), 5: (1.00, 0.75), 6: (1.00, 0.50),
        }[index // HSI_H_STEPS]
    else:
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


def sprite_index(info: dict, *, frame: int, direction: int, addon: int, layer: int) -> int:
    index = frame
    index = index * info["patternDepth"]
    index = index * info["patternHeight"] + addon
    index = index * info["patternWidth"] + direction
    return index * info["layers"] + layer


class OutfitBank:
    """Base and template sprites of every colourisable outfit, per facing."""

    def __init__(self, knowledge: Path, limit: int | None = None) -> None:
        entries = json.loads((knowledge / "client-outfits.json").read_text("utf8"))["entries"]
        sprites = knowledge / "client-sprites"
        self.items: list[dict] = []
        for entry in entries:
            groups = entry["frameGroups"]
            if not groups or groups[0]["spriteInfo"]["layers"] != 2:
                continue
            info = groups[0]["spriteInfo"]
            for direction in range(min(info["patternWidth"], len(DIRECTIONS))):
                base = self._load(sprites, info, direction, 0)
                template = self._load(sprites, info, direction, 1)
                if base is None or template is None:
                    continue
                masks = self._masks(base, template)
                if not masks:
                    continue
                self.items.append({
                    "outfitId": entry["id"], "direction": direction,
                    "base": np.asarray(base, dtype=np.float64), "masks": masks,
                })
            if limit and len({item["outfitId"] for item in self.items}) >= limit:
                break

    @staticmethod
    def _load(root: Path, info: dict, direction: int, layer: int) -> Image.Image | None:
        index = sprite_index(info, frame=0, direction=direction, addon=0, layer=layer)
        if index >= len(info["spriteIds"]):
            return None
        sprite_id = info["spriteIds"][index]
        path = root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"
        return Image.open(path).convert("RGBA") if path.is_file() else None

    @staticmethod
    def _masks(base: Image.Image, template: Image.Image) -> dict[str, np.ndarray]:
        base_px = np.asarray(base, dtype=np.int16)
        template_px = np.asarray(template.resize(base.size, Image.NEAREST), dtype=np.int16)
        opaque = (base_px[:, :, 3] > 0) & (template_px[:, :, 3] > 0)
        masks: dict[str, np.ndarray] = {}
        for region, rgb in REGIONS.items():
            mask = (np.abs(template_px[:, :, :3] - np.array(rgb)).sum(axis=2) == 0) & opaque
            if mask.sum() >= MIN_REGION_PIXELS:
                masks[region] = mask
        return masks


def fit_candidate(window: np.ndarray, item: dict) -> tuple[float, dict]:
    """Fit region colours to this window and score how well they explain it."""
    base = item["base"]
    if window.shape[:2] != base.shape[:2]:
        return float("inf"), {}
    rendered = window[:, :, :3].astype(np.float64)
    base_rgb = base[:, :, :3]

    fitted: dict[str, dict] = {}
    residuals: list[np.ndarray] = []
    for region, mask in item["masks"].items():
        usable = mask[:, :, None] & (base_rgb > MIN_BASE_LEVEL)
        if usable.sum() < MIN_REGION_PIXELS:
            continue
        ratio = np.where(usable, rendered / np.maximum(base_rgb, 1.0), np.nan)
        colour = np.nanmedian(ratio.reshape(-1, 3), axis=0) * 255.0
        if not np.all(np.isfinite(colour)):
            continue
        colour = np.clip(colour, 0, 255)
        distances = np.linalg.norm(PALETTE - colour, axis=1)
        order = np.argsort(distances)
        snapped = PALETTE[order[0]]
        # Score against the snapped palette colour, not the free-floating fit: the
        # client can only have used a palette entry, so a fit that lands between
        # entries is evidence the candidate is wrong.
        repainted = base_rgb * snapped / 255.0
        residuals.append(np.abs(repainted[mask] - rendered[mask]).ravel())
        fitted[region] = {
            "paletteIndex": int(order[0]),
            "paletteRgb": [int(value) for value in snapped],
            "sampledRgb": [round(float(value), 1) for value in colour],
            "snapDistance": round(float(distances[order[0]]), 2),
            "pixels": int(mask.sum()),
        }
    if not residuals:
        return float("inf"), {}
    return float(np.concatenate(residuals).mean()), fitted


def search(image: Image.Image, box: tuple[int, int, int, int], bank: OutfitBank,
           radius: int = OFFSET_RADIUS, keep: int = COARSE_KEEP) -> list[dict]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    left, top, width, height = box

    def window_at(dx: int, dy: int, shape: tuple[int, int]) -> np.ndarray | None:
        y0, x0 = top + dy, left + dx
        y1, x1 = y0 + shape[0], x0 + shape[1]
        if y0 < 0 or x0 < 0 or y1 > rgb.shape[0] or x1 > rgb.shape[1]:
            return None
        return rgb[y0:y1, x0:x1]

    # The detector's box is not pixel-aligned, so scoring the coarse pass at a single
    # offset would prune the true candidate before it ever gets refined. Sampling a
    # sparse offset grid keeps the pruning decision offset-robust.
    coarse_offsets = [(dx, dy)
                      for dy in range(-radius, radius + 1, max(1, radius // 2))
                      for dx in range(-radius, radius + 1, max(1, radius // 2))]
    coarse: list[tuple[float, dict]] = []
    for item in bank.items:
        best_score = float("inf")
        for dx, dy in coarse_offsets:
            window = window_at(dx, dy, item["base"].shape[:2])
            if window is None:
                continue
            score, _fit = fit_candidate(window, item)
            best_score = min(best_score, score)
        coarse.append((best_score, item))
    coarse.sort(key=lambda pair: pair[0])

    results: list[dict] = []
    for _score, item in coarse[:keep]:
        best = None
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                window = window_at(dx, dy, item["base"].shape[:2])
                if window is None:
                    continue
                score, fitted = fit_candidate(window, item)
                if fitted and (best is None or score < best["residual"]):
                    best = {"outfitId": item["outfitId"],
                            "direction": DIRECTIONS[item["direction"]],
                            "offset": [dx, dy], "residual": score, "regions": fitted}
        if best:
            results.append(best)
    results.sort(key=lambda entry: entry["residual"])
    for entry in results:
        entry["accepted"] = entry["residual"] <= MAX_RESIDUAL
    return results


def crop_character(image: Image.Image, box: tuple[int, int, int, int], match: dict,
                   bank: OutfitBank) -> Image.Image:
    """Cut the character out using the matched sprite's own alpha as the stencil."""
    item = next(entry for entry in bank.items
                if entry["outfitId"] == match["outfitId"]
                and DIRECTIONS[entry["direction"]] == match["direction"])
    height, width = item["base"].shape[:2]
    dx, dy = match["offset"]
    left, top = box[0] + dx, box[1] + dy
    window = image.convert("RGBA").crop((left, top, left + width, top + height))
    stencil = Image.fromarray((item["base"][:, :, 3] > 0).astype(np.uint8) * 255, "L")
    cut = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cut.paste(window, (0, 0), stencil)
    return cut


def synthesise(bank: OutfitBank, item: dict, colours: dict[str, int],
               rng: random.Random) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Composite a known outfit over noise, the way the client draws it over the map."""
    base = item["base"]
    height, width = base.shape[:2]
    rendered = np.zeros((height, width, 3), dtype=np.float64)
    for region, mask in item["masks"].items():
        colour = PALETTE[colours[region]]
        rendered[mask] = base[:, :, :3][mask] * colour / 255.0
    alpha = base[:, :, 3] > 0

    pad = 24
    canvas = np.array([[[rng.randint(0, 255) for _ in range(3)]
                        for _ in range(width + 2 * pad)] for _ in range(height + 2 * pad)],
                      dtype=np.uint8)
    region = canvas[pad:pad + height, pad:pad + width]
    region[alpha] = np.clip(rendered[alpha], 0, 255).astype(np.uint8)
    return Image.fromarray(canvas, "RGB"), (pad, pad, width, height)


def self_test(knowledge: Path, samples: int, limit: int, keep: int = COARSE_KEEP) -> int:
    bank = OutfitBank(knowledge, limit=limit)
    print(f"  bank: {len(bank.items)} sprites from "
          f"{len({item['outfitId'] for item in bank.items})} outfits")
    rng = random.Random(20260808)
    failures = 0
    for attempt in range(samples):
        item = rng.choice(bank.items)
        truth = {region: rng.randrange(len(PALETTE)) for region in item["masks"]}
        image, box = synthesise(bank, item, truth, rng)
        # The detector's box is never pixel-perfect, so shift it the way a real one would.
        jitter = (rng.randint(-3, 3), rng.randint(-3, 3))
        shifted = (box[0] + jitter[0], box[1] + jitter[1], box[2], box[3])
        results = search(image, shifted, bank, keep=keep)
        if not results:
            failures += 1
            print(f"  {attempt}: no candidate for outfit {item['outfitId']}")
            continue
        best = results[0]
        outfit_ok = best["outfitId"] == item["outfitId"] and \
            best["direction"] == DIRECTIONS[item["direction"]]
        colours_ok = all(best["regions"].get(region, {}).get("paletteIndex") == index
                         for region, index in truth.items())
        correct = outfit_ok and colours_ok
        if not correct:
            failures += 1
        # Reporting a wrong outfit confidently is the damaging failure; refusing is not.
        status = "ok  " if correct else ("FAIL" if best["accepted"] else "reject")
        got = {region: value["paletteIndex"] for region, value in best["regions"].items()}
        print(f"  {status} truth outfit={item['outfitId']} dir={DIRECTIONS[item['direction']]} "
              f"colours={truth}")
        print(f"       got   outfit={best['outfitId']} dir={best['direction']} "
              f"colours={got} residual={best['residual']:.2f} offset={best['offset']}")
    print(f"\n  failures: {failures}/{samples}")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", type=Path, default=DEFAULT_KNOWLEDGE)
    parser.add_argument("--image", type=Path)
    parser.add_argument("--box", help="left,top,width,height of the detector box")
    parser.add_argument("--crop", type=Path, help="write the cut-out character here")
    parser.add_argument("--top", type=int, default=3)
    parser.add_argument("--limit", type=int, default=0, help="only load N outfits")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--samples", type=int, default=6)
    parser.add_argument("--coarse-keep", type=int, default=COARSE_KEEP,
                        help="candidates carried from the coarse pass into offset refinement; "
                             "raise it when a box is badly aligned, at a linear cost in time")
    arguments = parser.parse_args()

    if arguments.self_test:
        print("[character-detect] self test on synthetic composites")
        raise SystemExit(1 if self_test(arguments.knowledge, arguments.samples,
                                        arguments.limit or 60, arguments.coarse_keep) else 0)

    if not arguments.image or not arguments.box:
        raise SystemExit("--image and --box are required (or use --self-test)")
    left, top, width, height = (int(value) for value in arguments.box.split(","))
    bank = OutfitBank(arguments.knowledge, limit=arguments.limit or None)
    image = Image.open(arguments.image)
    results = search(image, (left, top, width, height), bank, keep=arguments.coarse_keep)
    if not results:
        raise SystemExit("no outfit explained the pixels in that box")
    if arguments.crop:
        crop_character(image, (left, top, width, height), results[0], bank).save(arguments.crop)
    print(json.dumps({
        "box": [left, top, width, height],
        "best": results[0],
        "runnersUp": results[1:arguments.top],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
