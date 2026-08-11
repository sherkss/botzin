"""Extract the spell icon atlases from the Tibia client's Qt resource bundle.

The client keeps its interface artwork in ``bin/graphics_resources.rcc``, a Qt
resource archive. Spell icons live there as horizontal atlases - one row, one icon
per cell - rather than as individual files.

The atlases carry no spell names: the client resolves an icon by index, and the
index comes from the server. Naming them is a separate step; see
scripts/link-spell-icons.py.

Usage:
    python scripts/extract-client-spell-icons.py --client <client>/packages/Tibia
"""

from __future__ import annotations

import argparse
import json
import struct
import zlib
from pathlib import Path

from PIL import Image

DEFAULT_CLIENT = Path(r"C:\Users\admin\AppData\Local\Tibia\packages\Tibia")
DEFAULT_OUTPUT = Path("storage/knowledge/client-spell-icons")

# Qt resource nodes are a fixed 22 bytes from format version 2 onwards.
NODE_SIZE = 22
DIRECTORY_FLAG = 0x02
ZLIB_FLAG = 0x01
ZSTD_FLAG = 0x04

# resource path -> cell edge in pixels
ATLASES = {
    "/animations/images/spells/spell-icons-32x32.png": 32,
    "/animations/images/spells/spell-icons-20x20.png": 20,
    "/animations/images/spells/spellgroup-icons-20x20.png": 20,
}


class QtResource:
    def __init__(self, blob: bytes) -> None:
        if blob[:4] != b"qres":
            raise ValueError("not a Qt resource archive")
        self.blob = blob
        self.version, self.tree, self.data, self.names = struct.unpack_from(">IIII", blob, 4)
        if self.version < 2:
            raise ValueError(f"unsupported resource version {self.version}")

    def _name(self, offset: int) -> str:
        length = struct.unpack_from(">H", self.blob, self.names + offset)[0]
        # Two bytes of length and four of hash precede the UTF-16 name.
        start = self.names + offset + 6
        return self.blob[start:start + length * 2].decode("utf-16-be")

    def _payload(self, offset: int, flags: int) -> bytes:
        size = struct.unpack_from(">I", self.blob, self.data + offset)[0]
        start = self.data + offset + 4
        payload = self.blob[start:start + size]
        if flags & ZLIB_FLAG:
            # Qt prefixes the stream with the uncompressed length.
            return zlib.decompress(payload[4:])
        if flags & ZSTD_FLAG:
            raise ValueError("zstd-compressed resources are not supported")
        return payload

    def files(self) -> dict[str, bytes]:
        found: dict[str, bytes] = {}

        def walk(index: int, prefix: str) -> None:
            base = self.tree + index * NODE_SIZE
            name_offset, flags = struct.unpack_from(">IH", self.blob, base)
            name = self._name(name_offset)
            path = f"{prefix}/{name}" if name else prefix
            if flags & DIRECTORY_FLAG:
                count, first = struct.unpack_from(">II", self.blob, base + 6)
                for child in range(count):
                    walk(first + child, path)
                return
            data_offset = struct.unpack_from(">HHI", self.blob, base + 6)[2]
            found[path] = self._payload(data_offset, flags)

        walk(0, "")
        return found


def slice_atlas(image: Image.Image, edge: int, directory: Path) -> int:
    if image.height != edge:
        raise ValueError(f"atlas is {image.height}px tall, expected {edge}")
    if image.width % edge:
        raise ValueError(f"atlas width {image.width} is not a multiple of {edge}")
    directory.mkdir(parents=True, exist_ok=True)
    count = image.width // edge
    for index in range(count):
        cell = image.crop((index * edge, 0, (index + 1) * edge, edge))
        cell.save(directory / f"{index:03d}.png", optimize=True)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, default=DEFAULT_CLIENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    source = arguments.client / "bin" / "graphics_resources.rcc"
    if not source.is_file():
        raise SystemExit(f"resource archive not found: {source}")
    resource = QtResource(source.read_bytes())
    files = resource.files()

    manifest: dict[str, dict] = {}
    for path, edge in ATLASES.items():
        if path not in files:
            print(f"[spell-icons] missing from this client build: {path}")
            continue
        temporary = arguments.output / "_atlas"
        temporary.mkdir(parents=True, exist_ok=True)
        atlas_path = temporary / Path(path).name
        atlas_path.write_bytes(files[path])
        # The atlases are stored without alpha; the icons are opaque squares.
        image = Image.open(atlas_path).convert("RGBA")
        name = Path(path).stem
        count = slice_atlas(image, edge, arguments.output / name)
        manifest[name] = {"source": path, "edge": edge, "count": count}
        print(f"[spell-icons] {name}: {count} icons of {edge}x{edge}")

    if not manifest:
        raise SystemExit("no spell atlas was found in this client build")
    arguments.output.mkdir(parents=True, exist_ok=True)
    (arguments.output / "manifest.json").write_text(json.dumps({
        "version": 1,
        "source": str(source),
        "resourceFiles": len(files),
        "atlases": manifest,
    }, ensure_ascii=False, indent=2), encoding="utf8")
    print(f"[spell-icons] manifest -> {arguments.output / 'manifest.json'}")


if __name__ == "__main__":
    main()
