"""Recover the client's own creature-name to outfit mapping from ``staticdata.dat``.

The appearance catalog stores outfits without names, which is why the first pass at
naming them compared pixels against wiki artwork. That turned out to be unnecessary:
``staticdata.dat`` is an unadvertised protobuf holding the roster the client uses for
the Bestiary and for creature lookups, and it carries both the name and the outfit.

Wire layout (all length-delimited at the top level):
    1 = creature entry (repeated)

Creature entry:
    1 = race id      2 = name (utf8)      3 = look

Look:
    1 = outfit id (the appearance the client draws; NOT the race id)
    2 = default colours (head, body, legs, feet)

Race id and outfit id coincide only for the oldest creatures, so the two must not be
confused: race 513 ("acid blob") draws outfit 314.

Usage:
    python scripts/parse-client-creature-names.py
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

DEFAULT_ASSETS = Path(r"C:\Users\admin\AppData\Local\Tibia\packages\Tibia\assets")
DEFAULT_OUTPUT = Path("storage/knowledge/client-creature-names.json")


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
            raise ValueError(f"unsupported wire type {wire}")


def collect(buf: bytes) -> dict[int, list]:
    grouped: dict[int, list] = {}
    for field, payload in walk(buf):
        grouped.setdefault(field, []).append(payload)
    return grouped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    source = next(arguments.assets.glob("staticdata-*.dat"), None)
    if source is None:
        raise SystemExit(f"no staticdata-*.dat under {arguments.assets}")

    creatures: list[dict] = []
    for field, payload in walk(source.read_bytes()):
        if field != 1 or not isinstance(payload, bytes):
            continue
        entry = collect(payload)
        if 1 not in entry or 2 not in entry:
            continue
        look = collect(entry[3][0]) if 3 in entry and isinstance(entry[3][0], bytes) else {}
        outfit_id = look.get(1, [None])[0]
        colours = []
        if isinstance(look.get(2, [None])[0], bytes):
            colours = [value for _field, value in walk(look[2][0]) if isinstance(value, int)]
        creatures.append({
            "raceId": entry[1][0],
            "name": entry[2][0].decode("utf8", "replace"),
            "outfitId": outfit_id if isinstance(outfit_id, int) else None,
            "defaultColours": colours,
        })

    # Several creatures legitimately share one outfit - recoloured variants differ only
    # by the colours the server sends - so the mapping is one outfit to many names.
    by_outfit: dict[int, list[str]] = {}
    for creature in creatures:
        if creature["outfitId"] is not None:
            by_outfit.setdefault(creature["outfitId"], []).append(creature["name"])

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps({
        "version": 1,
        "source": source.name,
        "count": len(creatures),
        "creatures": creatures,
        "namesByOutfit": {str(key): value for key, value in sorted(by_outfit.items())},
    }, ensure_ascii=False, indent=2), encoding="utf8")

    shared = sum(1 for names in by_outfit.values() if len(names) > 1)
    sizes = Counter(len(names) for names in by_outfit.values())
    print(f"[creature-names] creatures={len(creatures)} outfits={len(by_outfit)} "
          f"shared by more than one name={shared}")
    print(f"[creature-names] names per outfit: {dict(sorted(sizes.items()))}")
    print(f"[creature-names] -> {arguments.output}")


if __name__ == "__main__":
    main()
