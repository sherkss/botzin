"""Name the client's player-character outfits and expose their colour templates.

Player outfits are stored twice: a greyscale base layer and a template layer whose
four mask colours mark head, body, legs and feet. The client tints the base through
that mask with four palette indices sent by the server, which is what makes two
characters wearing the same outfit look different.

That matters beyond cosmetics. A character's on-screen name can be impersonated by
swapping a letter for a lookalike, so the name alone is not proof of identity. The
outfit is a second, independent signal: looktype plus the four colours forms a
fingerprint that a lookalike name does not reproduce. This script provides the
lookup side of that check - which outfit is which, and where its template lives.

Names come from the wiki, since the client ships outfits unnamed. Matching is done on
the silhouette because the client's copy is uncoloured; shape alone is decisive here
(Hunter and Mage match at distance 0).

Usage:
    python scripts/link-character-outfits.py
"""

from __future__ import annotations

import argparse
import io
import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

WIKI_API = "https://tibia.fandom.com/api.php"
USER_AGENT = "Botzin/0.1 local visual training"
DEFAULT_KNOWLEDGE = Path("storage/knowledge")
SIGNATURE_EDGE = 24
DIRECTIONS = ("north", "east", "south", "west")
# Mask colours of the template layer, in the order the protocol sends the palette.
TEMPLATE_REGIONS = {"head": (255, 255, 0), "body": (255, 0, 0),
                    "legs": (0, 255, 0), "feet": (0, 0, 255)}


def wiki(**params) -> dict:
    params.setdefault("format", "json")
    url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.loads(response.read())


def wiki_file(title: str) -> Image.Image | None:
    payload = wiki(action="query", titles=f"File:{title}", prop="imageinfo", iiprop="url")
    for page in payload.get("query", {}).get("pages", {}).values():
        info = page.get("imageinfo")
        if not info:
            continue
        request = urllib.request.Request(info[0]["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=40) as response:
            return Image.open(io.BytesIO(response.read()))
    return None


def outfit_names() -> list[str]:
    """Page titles in Category:Outfits are '<Name> Outfits'."""
    names: list[str] = []
    cursor = None
    while True:
        params = dict(action="query", list="categorymembers", cmtitle="Category:Outfits",
                      cmlimit=500, cmtype="page")
        if cursor:
            params["cmcontinue"] = cursor
        payload = wiki(**params)
        for member in payload.get("query", {}).get("categorymembers", []):
            title = member["title"]
            if title.endswith(" Outfits"):
                names.append(title[: -len(" Outfits")])
        cursor = payload.get("continue", {}).get("cmcontinue")
        if not cursor:
            return sorted(set(names))


def silhouette(image: Image.Image) -> np.ndarray | None:
    alpha = image.convert("RGBA").getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return None
    cropped = alpha.crop(box).resize((SIGNATURE_EDGE, SIGNATURE_EDGE), Image.NEAREST)
    return np.asarray(cropped, dtype=np.float32).reshape(-1) / 255.0


def sprite_index(info: dict, *, frame: int, direction: int, addon: int, layer: int) -> int:
    index = frame
    index = index * info["patternDepth"]
    index = index * info["patternHeight"] + addon
    index = index * info["patternWidth"] + direction
    return index * info["layers"] + layer


def load_sprite(root: Path, sprite_id: int) -> Image.Image | None:
    path = root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"
    return Image.open(path).convert("RGBA") if path.is_file() else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", type=Path, default=DEFAULT_KNOWLEDGE)
    parser.add_argument("--accept", type=float, default=3.0)
    parser.add_argument("--margin", type=float, default=1.5)
    parser.add_argument("--exact", type=float, default=0.5,
                        help="distance at or below which a match needs no margin")
    parser.add_argument("--workers", type=int, default=4)
    arguments = parser.parse_args()

    knowledge = arguments.knowledge
    sprites_root = knowledge / "client-sprites"
    outfits = json.loads((knowledge / "client-outfits.json").read_text("utf8"))["entries"]
    by_id = {entry["id"]: entry for entry in outfits}

    # Only colourisable outfits can belong to a character; monsters are a separate pool.
    bank, owners = [], []
    for entry in outfits:
        groups = entry["frameGroups"]
        if not groups or groups[0]["spriteInfo"]["layers"] != 2:
            continue
        for group in groups:
            info = group["spriteInfo"]
            for frame in range(info["frames"]):
                for direction in range(info["patternWidth"]):
                    index = sprite_index(info, frame=frame, direction=direction, addon=0, layer=0)
                    if index >= len(info["spriteIds"]):
                        continue
                    image = load_sprite(sprites_root, info["spriteIds"][index])
                    if image is None:
                        continue
                    vector = silhouette(image)
                    if vector is not None:
                        bank.append(vector)
                        owners.append(entry["id"])
    bank_array = np.stack(bank)
    owners_array = np.asarray(owners)
    bank_norms = (bank_array ** 2).sum(axis=1)

    names = outfit_names()
    print(f"[character-outfits] wiki outfits={len(names)} bank={len(bank_array)} sprites "
          f"from {len(set(owners))} colourisable outfits")

    def resolve(name: str) -> dict:
        record: dict = {"name": name}
        image = None
        for variant in (f"Outfit {name} Male.gif", f"Outfit {name} Female.gif"):
            try:
                image = wiki_file(variant)
            except Exception as error:  # noqa: BLE001 - reported per outfit
                return {**record, "outfitId": None, "reason": f"wiki fetch failed: {error}"}
            if image is not None:
                record["wikiFile"] = variant
                break
        if image is None:
            return {**record, "outfitId": None, "reason": "no wiki image"}

        queries = [vector for frame in ImageSequence.Iterator(image)
                   if (vector := silhouette(frame.convert("RGBA"))) is not None]
        if not queries:
            return {**record, "outfitId": None, "reason": "empty wiki image"}
        query = np.stack(queries)
        squared = (bank_norms[None, :] + (query ** 2).sum(axis=1)[:, None]
                   - 2.0 * (query @ bank_array.T))
        # Best over the wiki's frames, then the best sprite of each outfit.
        per_sprite = np.sqrt(np.maximum(squared, 0.0)).min(axis=0)
        scores: dict[int, float] = {}
        for position, distance in enumerate(per_sprite):
            outfit_id = int(owners_array[position])
            if outfit_id not in scores or distance < scores[outfit_id]:
                scores[outfit_id] = float(distance)
        ranked = sorted(scores.items(), key=lambda item: item[1])
        best_id, best_distance = ranked[0]
        tied = [outfit_id for outfit_id, distance in ranked if distance <= best_distance + 1e-6]
        rest = [distance for _id, distance in ranked if distance > best_distance + 1e-6]
        margin = (rest[0] - best_distance) if rest else float("inf")
        # A pixel-identical silhouette settles the match on its own; requiring it to
        # also lead the runner-up would reject correct matches (Mage sits at 0 with
        # the next outfit only 1.0 away).
        decisive = best_distance <= arguments.exact
        if best_distance > arguments.accept or (not decisive and margin < arguments.margin):
            return {**record, "outfitId": None, "reason": "no confident outfit",
                    "bestOutfitId": best_id, "distance": round(best_distance, 4),
                    "margin": round(margin, 4) if np.isfinite(margin) else None}

        info = by_id[best_id]["frameGroups"][0]["spriteInfo"]
        templates = {}
        for direction, label in enumerate(DIRECTIONS):
            if direction >= info["patternWidth"]:
                continue
            index = sprite_index(info, frame=0, direction=direction, addon=0, layer=1)
            if index < len(info["spriteIds"]):
                templates[label] = info["spriteIds"][index]
        return {**record, "outfitId": best_id, "candidates": tied,
                "ambiguous": len(tied) > 1,
                "distance": round(best_distance, 4),
                "margin": round(margin, 4) if np.isfinite(margin) else None,
                "addons": info["patternHeight"], "mountable": info["patternDepth"] > 1,
                "templateSpriteByDirection": templates}

    with ThreadPoolExecutor(max_workers=arguments.workers) as pool:
        links = list(pool.map(resolve, names))

    linked = [link for link in links if link.get("outfitId")]
    claimed: dict[int, list[str]] = {}
    for link in linked:
        claimed.setdefault(link["outfitId"], []).append(link["name"])
    duplicates = {key: value for key, value in claimed.items() if len(value) > 1}

    output = knowledge / "character-outfit-links.json"
    output.write_text(json.dumps({
        "version": 1,
        "signatureEdge": SIGNATURE_EDGE,
        "templateRegions": TEMPLATE_REGIONS,
        "linked": len(linked),
        "unresolved": len(links) - len(linked),
        "duplicateOutfits": duplicates,
        "links": links,
    }, ensure_ascii=False, indent=2), encoding="utf8")

    exact = sum(1 for link in linked if link["distance"] <= arguments.exact)
    print(f"[character-outfits] linked={len(linked)}/{len(links)} exact={exact} "
          f"ambiguous={sum(1 for link in linked if link['ambiguous'])}")
    if duplicates:
        print(f"[character-outfits] {len(duplicates)} outfits claimed by more than one name:")
        for outfit_id, who in list(duplicates.items())[:8]:
            print(f"    outfit {outfit_id}: {who}")
    for link in links:
        if not link.get("outfitId"):
            print(f"    unresolved {link['name']}: {link.get('reason')}")
    print(f"[character-outfits] -> {output}")


if __name__ == "__main__":
    main()
