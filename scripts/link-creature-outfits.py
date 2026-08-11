"""Attach creature names to client outfit ids by matching sprite pixels.

``appearances.dat`` knows how to draw outfit 35 but not that it is called "Demon":
creature names live on the server and never reach the client. The wiki-sourced
assets under ``creature-assets`` have the opposite problem - they carry the name
and only the south-facing animation.

This bridges the two by matching wiki frames against client sprites, which works
because both come from the same artwork: most creatures match at distance 0.

The payoff is the four facings and full walk cycle per named creature, which the
wiki set does not provide and the second-stage classifier needs.

Usage:
    python scripts/link-creature-outfits.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_KNOWLEDGE = Path("storage/knowledge")
DIRECTIONS = ("north", "east", "south", "west")
# Wiki creature GIFs always show the south facing, so only that column can match.
SOUTH = 2
SIGNATURE_EDGE = 24


def signature(image: Image.Image) -> np.ndarray | None:
    box = image.getchannel("A").getbbox()
    if box is None:
        return None
    cropped = image.crop(box).resize((SIGNATURE_EDGE, SIGNATURE_EDGE), Image.NEAREST)
    array = np.asarray(cropped, dtype=np.float32) / 255.0
    # Premultiplying keeps transparent padding from counting as colour agreement.
    array[:, :, :3] *= array[:, :, 3:4]
    return array.reshape(-1)


def silhouette(image: Image.Image) -> np.ndarray | None:
    """Alpha-only signature, used where colour cannot be trusted.

    Outfits with two layers are colourised at runtime from server-sent values, so
    the client ships an uncoloured base that never matches the wiki's coloured
    render. The shape is unaffected, so it still identifies the outfit.
    """
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return None
    cropped = alpha.crop(box).resize((SIGNATURE_EDGE, SIGNATURE_EDGE), Image.NEAREST)
    return np.asarray(cropped, dtype=np.float32).reshape(-1) / 255.0


def sprite_index(sprite_info: dict, *, frame: int, direction: int) -> int:
    index = frame
    index = index * sprite_info["patternDepth"]
    index = index * sprite_info["patternHeight"]
    index = index * sprite_info["patternWidth"] + direction
    return index * sprite_info["layers"]


def load_sprite(sprites_root: Path, sprite_id: int) -> Image.Image | None:
    path = sprites_root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"
    if not path.is_file():
        return None
    return Image.open(path).convert("RGBA")


class Bank:
    """South-facing sprite signatures, grouped contiguously per outfit."""

    def __init__(self, colour: np.ndarray, shape: np.ndarray, owners: np.ndarray) -> None:
        self.colour = colour
        self.shape = shape
        self.owners = owners
        # Contiguous owner runs let one reduceat collapse sprite distances into outfit ones.
        self.starts = np.flatnonzero(np.r_[True, owners[1:] != owners[:-1]])
        self.outfit_ids = owners[self.starts]
        self.norms = {"colour": (colour ** 2).sum(axis=1), "shape": (shape ** 2).sum(axis=1)}

    def distances(self, query: np.ndarray, space: str) -> np.ndarray:
        """Mean over query frames of the closest sprite distance, per outfit."""
        bank = self.colour if space == "colour" else self.shape
        # ||a-b||^2 expanded so the heavy part is a single BLAS matmul.
        squared = (self.norms[space][None, :] + (query ** 2).sum(axis=1)[:, None]
                   - 2.0 * (query @ bank.T))
        return np.minimum.reduceat(np.sqrt(np.maximum(squared, 0.0)), self.starts, axis=1).mean(axis=0)


def build_bank(outfits: list[dict], sprites_root: Path) -> Bank:
    colours: list[np.ndarray] = []
    shapes: list[np.ndarray] = []
    owners: list[int] = []
    for entry in outfits:
        for group in entry["frameGroups"]:
            info = group["spriteInfo"]
            if info["patternWidth"] <= SOUTH:
                continue
            ids = info["spriteIds"]
            for frame in range(info["frames"]):
                index = sprite_index(info, frame=frame, direction=SOUTH)
                if index >= len(ids):
                    continue
                image = load_sprite(sprites_root, ids[index])
                if image is None:
                    continue
                colour = signature(image)
                shape = silhouette(image)
                if colour is None or shape is None:
                    continue
                colours.append(colour)
                shapes.append(shape)
                owners.append(entry["id"])
    order = np.argsort(np.asarray(owners), kind="stable")
    return Bank(np.stack(colours)[order], np.stack(shapes)[order], np.asarray(owners)[order])


def pick(scores: np.ndarray, outfit_ids: np.ndarray, accept: float, margin_floor: float):
    """Best outfit plus every outfit tied with it, or None when it is not decisive."""
    best = int(np.argmin(scores))
    distance = float(scores[best])
    tied = np.flatnonzero(scores <= distance + 1e-6)
    others = scores[scores > distance + 1e-6]
    margin = float(others.min() - distance) if others.size else float("inf")
    if distance > accept or margin < margin_floor:
        return None, distance, margin, int(outfit_ids[best])
    return [int(outfit_ids[i]) for i in tied], distance, margin, int(outfit_ids[best])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", type=Path, default=DEFAULT_KNOWLEDGE)
    parser.add_argument("--exact", type=float, default=0.5, help="distance counting as a pixel-exact match")
    parser.add_argument("--accept", type=float, default=4.0, help="largest distance still reported as a link")
    parser.add_argument("--margin", type=float, default=1.0, help="minimum lead over the runner-up outfit")
    parser.add_argument("--shape-accept", type=float, default=2.0,
                        help="largest silhouette distance accepted on the colour-blind pass")
    parser.add_argument("--shape-margin", type=float, default=0.75,
                        help="minimum silhouette lead over the runner-up outfit")
    arguments = parser.parse_args()

    knowledge = arguments.knowledge
    sprites_root = knowledge / "client-sprites"
    outfits = json.loads((knowledge / "client-outfits.json").read_text("utf8"))["entries"]
    outfits = [entry for entry in outfits if entry["frameGroups"]]

    bank = build_bank(outfits, sprites_root)
    by_id = {entry["id"]: entry for entry in outfits}
    print(f"[link] outfits={len(outfits)} south sprites={len(bank.colour)} "
          f"distinct outfits in bank={len(bank.outfit_ids)}")

    links: list[dict] = []
    unmatched: list[dict] = []
    for manifest_path in sorted((knowledge / "creature-assets").glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text("utf8"))
        colour_queries, shape_queries = [], []
        for relative in manifest.get("files", []):
            frame_path = manifest_path.parent / relative
            if not frame_path.is_file():
                continue
            frame = Image.open(frame_path).convert("RGBA")
            colour, shape = signature(frame), silhouette(frame)
            if colour is not None and shape is not None:
                colour_queries.append(colour)
                shape_queries.append(shape)
        record = {"race": manifest["race"], "name": manifest["name"], "catalogId": manifest.get("catalogId")}
        if not colour_queries:
            unmatched.append({**record, "reason": "no usable frames"})
            continue

        # Colour first: it is the strongest evidence and settles most creatures outright.
        scores = bank.distances(np.stack(colour_queries), "colour")
        candidates, best_distance, margin, fallback = pick(
            scores, bank.outfit_ids, arguments.accept, arguments.margin)
        space = "colour"
        if candidates is None:
            # Colourisable outfits are stored uncoloured, so only the shape can agree.
            scores = bank.distances(np.stack(shape_queries), "shape")
            candidates, best_distance, margin, fallback = pick(
                scores, bank.outfit_ids, arguments.shape_accept, arguments.shape_margin)
            space = "silhouette"

        if candidates is None:
            unmatched.append({
                **record,
                "reason": "no confident outfit",
                "bestOutfitId": fallback,
                "distance": round(best_distance, 4),
                "margin": round(margin, 4) if np.isfinite(margin) else None,
            })
            continue

        chosen = min(candidates)
        entry = by_id[chosen]
        walk = max(entry["frameGroups"], key=lambda group: group["spriteInfo"]["frames"])
        info = walk["spriteInfo"]
        sprites_by_direction = {}
        for direction, label in enumerate(DIRECTIONS):
            if direction >= info["patternWidth"]:
                continue
            ids = [
                info["spriteIds"][sprite_index(info, frame=frame, direction=direction)]
                for frame in range(info["frames"])
                if sprite_index(info, frame=frame, direction=direction) < len(info["spriteIds"])
            ]
            sprites_by_direction[label] = ids
        links.append({
            **record,
            "outfitId": chosen,
            "outfitCandidates": candidates,
            "ambiguous": len(candidates) > 1,
            "distance": round(best_distance, 4),
            "margin": round(margin, 4) if np.isfinite(margin) else None,
            "matchedOn": space,
            "confidence": ("exact" if best_distance <= arguments.exact else "high")
                          if space == "colour" else "silhouette",
            "layers": info["layers"],
            "frames": info["frames"],
            "spritesByDirection": sprites_by_direction,
        })

    # Several named creatures legitimately share one outfit: recoloured variants
    # (the four cursed books, the phantoms) differ only by server-sent colours, which
    # the client never stores. Recording the overlap keeps that ceiling visible to
    # whoever trains on this instead of looking like a clean one-to-one mapping.
    sharing: dict[int, list[str]] = {}
    for link in links:
        sharing.setdefault(link["outfitId"], []).append(link["race"])
    for link in links:
        peers = [race for race in sharing[link["outfitId"]] if race != link["race"]]
        link["sharesOutfitWith"] = peers
        link["visuallyDistinct"] = not peers

    output = knowledge / "creature-outfit-links.json"
    output.write_text(json.dumps({
        "version": 1,
        "signatureEdge": SIGNATURE_EDGE,
        "direction": "south",
        "linked": len(links),
        "unmatched": len(unmatched),
        "links": links,
        "unmatchedCreatures": unmatched,
    }, ensure_ascii=False), encoding="utf8")

    exact = sum(1 for link in links if link["confidence"] == "exact")
    shape_matched = sum(1 for link in links if link["matchedOn"] == "silhouette")
    ambiguous = sum(1 for link in links if link["ambiguous"])
    distinct = sum(1 for link in links if link["visuallyDistinct"])
    total = len(links) + len(unmatched)
    print(f"[link] creatures={total} linked={len(links)} (exact={exact}, "
          f"silhouette={shape_matched}, ambiguous={ambiguous}) unmatched={len(unmatched)}")
    print(f"[link] visually distinct={distinct} sharing artwork with another creature="
          f"{len(links) - distinct} outfits used={len(sharing)} -> {output}")


if __name__ == "__main__":
    main()
