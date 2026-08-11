"""Parse the Tibia client's ``appearances.dat`` into JSON.

The client stores its appearance catalog as a schema-less protobuf blob. Rather
than vendoring CipSoft's ``.proto``, this reads the wire format directly and maps
only the fields the visual pipeline needs. Field numbers were derived by walking
the wire format and validated by rendering the referenced sprites.

Wire layout (top level, all length-delimited):
    1 = object    2 = outfit    3 = effect    4 = missile    5 = special meta

Appearance:  1 = id, 2 = frame_group (repeated), 3 = flags, 4 = name, 5 = description
FrameGroup:  1 = fixed_frame_group, 2 = id, 3 = sprite_info
SpriteInfo:  1 = pattern_width, 2 = pattern_height, 3 = pattern_depth,
             4 = layers, 5 = sprite_id (repeated), 6 = animation,
             8 = is_opaque, 9 = bounding_box_per_direction

Usage:
    python scripts/parse-appearances.py --assets <client>/packages/Tibia/assets
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

DEFAULT_ASSETS = Path(r"C:\Users\admin\AppData\Local\Tibia\packages\Tibia\assets")
DEFAULT_OUTPUT = Path("storage/knowledge")

TOP_LEVEL = {1: "objects", 2: "outfits", 3: "effects", 4: "missiles"}
# Tibia renders creature facings in this order inside the pattern-width axis.
DIRECTIONS = ("north", "east", "south", "west")


def read_varint(buf: bytes, index: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        byte = buf[index]
        index += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return value, index


def walk(buf: bytes):
    """Yield (field_number, payload) pairs for one protobuf nesting level."""
    index = 0
    while index < len(buf):
        key, index = read_varint(buf, index)
        field, wire = key >> 3, key & 7
        if wire == 0:
            value, index = read_varint(buf, index)
            yield field, value
        elif wire == 2:
            length, index = read_varint(buf, index)
            yield field, buf[index:index + length]
            index += length
        elif wire == 5:
            yield field, buf[index:index + 4]
            index += 4
        elif wire == 1:
            yield field, buf[index:index + 8]
            index += 8
        else:
            raise ValueError(f"unsupported wire type {wire} at offset {index}")


def collect(buf: bytes) -> dict[int, list]:
    grouped: dict[int, list] = {}
    for field, payload in walk(buf):
        grouped.setdefault(field, []).append(payload)
    return grouped


def parse_sprite_info(raw: bytes) -> dict:
    info = collect(raw)
    pattern_width = info.get(1, [1])[0]
    pattern_height = info.get(2, [1])[0]
    pattern_depth = info.get(3, [1])[0]
    layers = info.get(4, [1])[0]
    sprite_ids = info.get(5, [])
    cells = max(1, pattern_width * pattern_height * pattern_depth * layers)
    boxes = []
    for box_raw in info.get(9, []):
        box = collect(box_raw)
        boxes.append({
            "x": box.get(1, [0])[0], "y": box.get(2, [0])[0],
            "width": box.get(3, [0])[0], "height": box.get(4, [0])[0],
        })
    return {
        "patternWidth": pattern_width,
        "patternHeight": pattern_height,
        "patternDepth": pattern_depth,
        "layers": layers,
        "frames": len(sprite_ids) // cells,
        "spriteIds": sprite_ids,
        "animated": 6 in info,
        "boundingBoxPerDirection": boxes,
    }


def sprite_at(info: dict, *, frame: int = 0, direction: int = 0, addon: int = 0,
              mount: int = 0, layer: int = 0) -> int | None:
    """Resolve one cell of a sprite_info grid to its sprite id."""
    index = frame
    index = index * info["patternDepth"] + mount
    index = index * info["patternHeight"] + addon
    index = index * info["patternWidth"] + direction
    index = index * info["layers"] + layer
    ids = info["spriteIds"]
    return ids[index] if 0 <= index < len(ids) else None


def parse_appearance(raw: bytes) -> dict:
    appearance = collect(raw)
    groups = []
    for group_raw in appearance.get(2, []):
        frame_group = collect(group_raw)
        if 3 not in frame_group:
            continue
        groups.append({
            "fixedFrameGroup": frame_group.get(1, [None])[0],
            "id": frame_group.get(2, [None])[0],
            "spriteInfo": parse_sprite_info(frame_group[3][0]),
        })
    parsed: dict = {"id": appearance[1][0], "frameGroups": groups}
    if 4 in appearance:
        parsed["name"] = appearance[4][0].decode("utf8", "replace")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    source = next(arguments.assets.glob("appearances-*.dat"), None)
    if source is None:
        raise SystemExit(f"no appearances-*.dat under {arguments.assets}")
    data = source.read_bytes()

    buckets: dict[str, list[dict]] = {name: [] for name in TOP_LEVEL.values()}
    for field, payload in walk(data):
        name = TOP_LEVEL.get(field)
        if name is not None:
            buckets[name].append(parse_appearance(payload))

    arguments.output.mkdir(parents=True, exist_ok=True)
    for name, entries in buckets.items():
        # Creature facings are what the detector matches against, so pre-resolve the
        # idle sprite per direction instead of making every consumer redo the maths.
        if name == "outfits":
            for entry in entries:
                if not entry["frameGroups"]:
                    continue
                info = entry["frameGroups"][0]["spriteInfo"]
                entry["idleByDirection"] = {
                    label: sprite_at(info, direction=index)
                    for index, label in enumerate(DIRECTIONS)
                    if index < info["patternWidth"]
                }
        target = arguments.output / f"client-{name}.json"
        target.write_text(json.dumps({
            "version": 1,
            "source": source.name,
            "kind": name,
            "count": len(entries),
            "entries": entries,
        }), encoding="utf8")
        named = sum(1 for entry in entries if "name" in entry)
        print(f"[appearances] {name}: {len(entries)} entries, {named} named -> {target}")


if __name__ == "__main__":
    main()
