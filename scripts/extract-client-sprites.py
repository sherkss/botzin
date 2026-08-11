"""Extract raw sprites from an official Tibia client asset package.

The client ships its artwork as LZMA-compressed BMP spritesheets indexed by
``catalog-content.json``. This script decodes those sheets and writes one PNG per
sprite id, which is the pixel-exact source the visual training pipeline needs.

The sprites remain CipSoft property: the output lands under ``storage/`` (git
ignored) and is meant for local model training only, never redistribution.

Usage:
    python scripts/extract-client-sprites.py --assets <client>/packages/Tibia/assets
"""

from __future__ import annotations

import argparse
import json
import lzma
import struct
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_ASSETS = Path(r"C:\Users\admin\AppData\Local\Tibia\packages\Tibia\assets")
DEFAULT_OUTPUT = Path("storage/knowledge/client-sprites")

CIP_CONSTANT = bytes.fromhex("700afa8024")
SHEET_EDGE = 384
# catalog spritetype -> (sprite width, sprite height)
SPRITE_SIZES = {0: (32, 32), 1: (32, 64), 2: (64, 32), 3: (64, 64)}
# Sprites are sharded into subdirectories because a flat folder with ~300k files
# makes NTFS enumeration painfully slow.
SHARD_SIZE = 1000


@dataclass(frozen=True)
class SheetTask:
    file: str
    spritetype: int
    firstspriteid: int
    lastspriteid: int


def decompress_sheet(raw: bytes) -> bytes:
    """Decode CipSoft's LZMA container into the underlying BMP bytes.

    Layout: variable 0x00 padding, a 5-byte constant, a 7-bit varint holding the
    remaining byte count, then a standard LZMA1 property block. The 8 bytes after
    the properties store the *compressed* length rather than the uncompressed one,
    so the stream has to be fed to a raw decoder instead of the alone-format one.
    """
    offset = 0
    while raw[offset] == 0:
        offset += 1
    if raw[offset:offset + 5] != CIP_CONSTANT:
        raise ValueError(f"unexpected container signature {raw[offset:offset + 5].hex(' ')}")
    offset += 5

    remaining = shift = 0
    while True:
        byte = raw[offset]
        offset += 1
        remaining |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            break
    if remaining != len(raw) - offset:
        raise ValueError(f"declared {remaining} bytes, found {len(raw) - offset}")

    properties = raw[offset]
    lc = properties % 9
    lp = (properties // 9) % 5
    pb = properties // 45
    dict_size = struct.unpack("<I", raw[offset + 1:offset + 5])[0]
    decoder = lzma.LZMADecompressor(
        lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "lc": lc, "lp": lp, "pb": pb, "dict_size": dict_size}],
    )
    return decoder.decompress(raw[offset + 13:])


def read_bmp_rgba(bmp: bytes) -> np.ndarray:
    """Turn a 32bpp BMP into a top-down RGBA array."""
    pixel_offset = struct.unpack("<I", bmp[10:14])[0]
    width, height = struct.unpack("<ii", bmp[18:26])
    depth = struct.unpack("<H", bmp[28:30])[0]
    if depth != 32:
        raise ValueError(f"expected 32bpp, found {depth}")
    pixels = np.frombuffer(bmp, dtype=np.uint8, count=abs(height) * width * 4, offset=pixel_offset)
    pixels = pixels.reshape(abs(height), width, 4)
    # A positive height means the rows are stored bottom-up, and the channels are BGRA.
    if height > 0:
        pixels = pixels[::-1]
    return pixels[:, :, [2, 1, 0, 3]]


def extract_sheet(assets: Path, output: Path, task: SheetTask) -> tuple[int, int]:
    sprite_width, sprite_height = SPRITE_SIZES[task.spritetype]
    sheet = read_bmp_rgba(decompress_sheet((assets / task.file).read_bytes()))
    if sheet.shape[:2] != (SHEET_EDGE, SHEET_EDGE):
        raise ValueError(f"{task.file}: unexpected sheet size {sheet.shape[:2]}")

    columns = SHEET_EDGE // sprite_width
    written = empty = 0
    for index in range(task.lastspriteid - task.firstspriteid + 1):
        row, column = divmod(index, columns)
        top = row * sprite_height
        left = column * sprite_width
        sprite = sheet[top:top + sprite_height, left:left + sprite_width]
        # Sheets are padded with blank cells; storing them would bloat the output
        # and teach the detector nothing.
        if not sprite[:, :, 3].any():
            empty += 1
            continue
        sprite_id = task.firstspriteid + index
        directory = output / f"{sprite_id // SHARD_SIZE:04d}"
        directory.mkdir(parents=True, exist_ok=True)
        Image.fromarray(sprite, "RGBA").save(directory / f"{sprite_id}.png", optimize=True)
        written += 1
    return written, empty


def worker(payload: tuple[str, str, dict]) -> tuple[str, int, int, str | None]:
    assets, output, entry = payload
    task = SheetTask(**entry)
    try:
        written, empty = extract_sheet(Path(assets), Path(output), task)
    except Exception as error:  # noqa: BLE001 - reported per sheet, never fatal
        return task.file, 0, 0, f"{type(error).__name__}: {error}"
    return task.file, written, empty, None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="stop after N sheets (smoke test)")
    parser.add_argument("--spritetype", type=int, action="append", choices=sorted(SPRITE_SIZES))
    arguments = parser.parse_args()

    catalog = json.loads((arguments.assets / "catalog-content.json").read_text("utf8"))
    entries = [entry for entry in catalog if entry.get("type") == "sprite"]
    if arguments.spritetype:
        entries = [entry for entry in entries if entry["spritetype"] in arguments.spritetype]
    if arguments.limit:
        entries = entries[:arguments.limit]

    arguments.output.mkdir(parents=True, exist_ok=True)
    payloads = [
        (
            str(arguments.assets),
            str(arguments.output),
            {key: entry[key] for key in ("file", "spritetype", "firstspriteid", "lastspriteid")},
        )
        for entry in entries
    ]

    written = empty = failed = 0
    index: dict[str, dict] = {}
    with ProcessPoolExecutor(max_workers=arguments.workers) as pool:
        for done, (file, sheet_written, sheet_empty, error) in enumerate(pool.map(worker, payloads), start=1):
            if error:
                failed += 1
                print(f"[sprites] FAIL {file}: {error}", flush=True)
                continue
            written += sheet_written
            empty += sheet_empty
            if done % 250 == 0 or done == len(payloads):
                print(f"[sprites] sheets={done}/{len(payloads)} written={written} empty={empty} failed={failed}", flush=True)

    for entry in entries:
        index[entry["file"]] = {
            "spritetype": entry["spritetype"],
            "size": SPRITE_SIZES[entry["spritetype"]],
            "firstspriteid": entry["firstspriteid"],
            "lastspriteid": entry["lastspriteid"],
        }
    manifest = {
        "version": 1,
        "source": "tibia-client",
        "assets": str(arguments.assets),
        "shardSize": SHARD_SIZE,
        "sprites": written,
        "sheets": index,
    }
    (arguments.output / "manifest.json").write_text(json.dumps(manifest), encoding="utf8")
    print(f"[sprites] done sprites={written} skipped_empty={empty} failed_sheets={failed} output={arguments.output}")


if __name__ == "__main__":
    main()
