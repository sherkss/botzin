"""Package client effect and missile sprites into training asset directories.

``parse-appearances.py`` maps each effect/missile to the sprite ids that draw it, and
``extract-client-sprites.py`` writes those sprites as PNGs. This joins the two into the
same ``<id>/manifest.json`` + ``frames/`` layout the creature and item assets already
use, so the detector trainer can consume them without a special case.

Every sprite id of an entry is an alternative appearance of the same thing: animation
frames for effects, flight directions for missiles. Both are packed as frames, because
the detector learns one class per entry, not one per direction.

The sprites remain CipSoft property: the output lands under ``storage/`` (git ignored)
and is meant for local model training only, never redistribution.

Usage:
    python scripts/pack-client-effects.py
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sprites", default="storage/knowledge/client-sprites")
    parser.add_argument("--effects", default="storage/knowledge/client-effects.json")
    parser.add_argument("--missiles", default="storage/knowledge/client-missiles.json")
    parser.add_argument("--effect-output", default="storage/knowledge/effect-assets")
    parser.add_argument("--missile-output", default="storage/knowledge/missile-assets")
    parser.add_argument("--force", action="store_true", help="repack entries that already exist")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sprites_root = Path(args.sprites).resolve()
    if not sprites_root.is_dir():
        raise RuntimeError(f"Sprite directory was not found: {sprites_root}. Run extract-client-sprites.py first.")

    for catalog_path, output_path, kind in (
        (Path(args.effects), Path(args.effect_output), "effect"),
        (Path(args.missiles), Path(args.missile_output), "missile"),
    ):
        pack_catalog(catalog_path.resolve(), output_path.resolve(), sprites_root, kind, args.force)


def pack_catalog(catalog_path: Path, output_root: Path, sprites_root: Path, kind: str, force: bool) -> None:
    if not catalog_path.is_file():
        raise RuntimeError(f"Appearance catalog was not found: {catalog_path}. Run parse-appearances.py first.")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    entries = catalog.get("entries", [])
    output_root.mkdir(parents=True, exist_ok=True)

    packed = 0
    skipped = 0
    missing = 0
    for entry in entries:
        entry_id = int(entry["id"])
        target = output_root / f"{entry_id:04d}"
        if target.is_dir() and not force:
            skipped += 1
            continue

        sprite_ids = collect_sprite_ids(entry)
        frames, absent = copy_frames(sprite_ids, sprites_root, target, force)
        missing += absent
        if not frames:
            # An entry whose sprites are all blank or absent cannot be labelled.
            shutil.rmtree(target, ignore_errors=True)
            continue

        width, height = frame_size(target / frames[0])
        manifest = {
            "version": 1,
            "id": entry_id,
            "kind": kind,
            "source": "tibia-client",
            "spriteIds": sprite_ids,
            "width": width,
            "height": height,
            "frameCount": len(frames),
            "usage": "local-visual-training",
            "files": frames,
        }
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        packed += 1

    print(
        f"[pack-{kind}] packed={packed} skipped_existing={skipped} "
        f"missing_sprites={missing} output={output_root}"
    )


def collect_sprite_ids(entry: dict) -> list[int]:
    sprite_ids: list[int] = []
    for group in entry.get("frameGroups", []):
        for sprite_id in group.get("spriteInfo", {}).get("spriteIds", []):
            if sprite_id not in sprite_ids:
                sprite_ids.append(int(sprite_id))
    return sprite_ids


def copy_frames(sprite_ids: list[int], sprites_root: Path, target: Path, force: bool) -> tuple[list[str], int]:
    frames_directory = target / "frames"
    if force:
        shutil.rmtree(target, ignore_errors=True)
    frames_directory.mkdir(parents=True, exist_ok=True)

    frames: list[str] = []
    missing = 0
    for sprite_id in sprite_ids:
        source = sprite_path(sprites_root, sprite_id)
        if not source.is_file():
            missing += 1
            continue
        if is_blank(source):
            continue
        filename = f"{len(frames) + 1:03d}.png"
        shutil.copyfile(source, frames_directory / filename)
        frames.append(f"frames/{filename}")
    return frames, missing


def sprite_path(sprites_root: Path, sprite_id: int) -> Path:
    return sprites_root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"


def is_blank(path: Path) -> bool:
    with Image.open(path) as source:
        return not source.convert("RGBA").getchannel("A").getbbox()


def frame_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as source:
        return source.width, source.height


if __name__ == "__main__":
    main()
