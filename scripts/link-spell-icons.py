"""Give every catalogued spell an icon taken from the Tibia client.

The client's spell atlases are indexed, not named - the icon number comes from the
server - so the names have to be recovered from outside. Two routes are used,
because the wiki holds a different kind of image for each spell type:

* instant spells - the wiki's ``File:<Name>.gif`` is the spell icon itself, drawn
  inside a 3px decorative frame. Cropping that frame makes it match the client
  atlas almost exactly, which yields the icon index.
* rune spells - the wiki shows the conjured rune *item*, not a spell icon. Those
  resolve far more reliably through the client's own named object catalog, with no
  image comparison at all.

Usage:
    python scripts/link-spell-icons.py
"""

from __future__ import annotations

import argparse
import io
import json
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

WIKI_API = "https://tibia.fandom.com/api.php"
USER_AGENT = "Botzin/0.1 local visual training"
DEFAULT_CATALOG = Path("src/learning/tibia-spell-catalog.generated.ts")
DEFAULT_KNOWLEDGE = Path("storage/knowledge")
# The wiki frames spell icons in a 3px border; the art inside is the client's 32x32.
WIKI_BORDER = 3
ICON_EDGE = 32


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def load_catalog(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf8")
    body = text[text.index("["):text.rindex("] as const") + 1]
    return json.loads(body)


def signature(image: Image.Image) -> np.ndarray:
    """Flat RGB vector over an opaque 32x32 icon."""
    opaque = Image.new("RGBA", image.size, (0, 0, 0, 255))
    opaque.alpha_composite(image.convert("RGBA"))
    return np.asarray(opaque.convert("RGB"), dtype=np.float32).reshape(-1) / 255.0


def wiki_icon(name: str) -> Image.Image | None:
    query = urllib.parse.urlencode({
        "action": "query", "titles": f"File:{name}.gif",
        "prop": "imageinfo", "iiprop": "url", "format": "json",
    })
    payload = json.loads(fetch(f"{WIKI_API}?{query}"))
    for page in payload.get("query", {}).get("pages", {}).values():
        info = page.get("imageinfo")
        if info:
            return Image.open(io.BytesIO(fetch(info[0]["url"])))
    return None


def unframe(image: Image.Image) -> Image.Image | None:
    width, height = image.size
    if width != height:
        return None
    if width == ICON_EDGE:
        return image
    border = (width - ICON_EDGE) // 2
    if border <= 0 or width - 2 * border != ICON_EDGE:
        return None
    return image.crop((border, border, width - border, height - border))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--knowledge", type=Path, default=DEFAULT_KNOWLEDGE)
    parser.add_argument("--accept", type=float, default=8.0, help="largest accepted icon distance")
    parser.add_argument("--margin", type=float, default=3.0, help="minimum lead over the runner-up icon")
    parser.add_argument("--workers", type=int, default=4)
    arguments = parser.parse_args()

    knowledge = arguments.knowledge
    icons_root = knowledge / "client-spell-icons" / "spell-icons-32x32"
    if not icons_root.is_dir():
        raise SystemExit(f"spell icons not extracted: {icons_root}. "
                         f"Run scripts/extract-client-spell-icons.py first.")

    bank, bank_index = [], []
    for icon_path in sorted(icons_root.glob("*.png")):
        bank.append(signature(Image.open(icon_path)))
        bank_index.append(int(icon_path.stem))
    bank_array = np.stack(bank)

    objects = json.loads((knowledge / "client-objects.json").read_text("utf8"))["entries"]
    by_name: dict[str, dict] = {}
    for entry in objects:
        name = entry.get("name")
        if name:
            by_name.setdefault(name.strip().lower(), entry)

    spells = load_catalog(arguments.catalog)
    print(f"[spell-icons] spells={len(spells)} atlas icons={len(bank_index)} named objects={len(by_name)}")

    def resolve(spell: dict) -> dict:
        record = {"id": spell["id"], "name": spell["name"], "type": spell["type"],
                  "group": spell["group"], "words": spell.get("words")}
        if spell["type"] == "rune":
            entry = by_name.get(spell["name"].strip().lower())
            if entry and entry["frameGroups"]:
                sprite_ids = entry["frameGroups"][0]["spriteInfo"]["spriteIds"]
                if sprite_ids:
                    return {**record, "source": "client-object", "objectId": entry["id"],
                            "spriteId": sprite_ids[0], "confidence": "name"}
            return {**record, "source": None, "reason": "rune item not found in client objects"}

        try:
            raw = wiki_icon(spell["name"])
        except Exception as error:  # noqa: BLE001 - reported per spell, never fatal
            return {**record, "source": None, "reason": f"wiki fetch failed: {error}"}
        if raw is None:
            return {**record, "source": None, "reason": "no wiki icon"}
        cropped = unframe(raw)
        if cropped is None:
            return {**record, "source": None, "reason": f"unexpected wiki size {raw.size}"}

        distances = np.linalg.norm(bank_array - signature(cropped), axis=1)
        best = int(np.argmin(distances))
        distance = float(distances[best])
        others = np.delete(distances, best)
        margin = float(others.min() - distance)
        if distance > arguments.accept or margin < arguments.margin:
            return {**record, "source": None, "reason": "no confident icon",
                    "bestIconIndex": bank_index[best], "distance": round(distance, 4),
                    "margin": round(margin, 4)}
        return {**record, "source": "client-atlas", "iconIndex": bank_index[best],
                "distance": round(distance, 4), "margin": round(margin, 4),
                "confidence": "exact" if distance <= 2.0 else "high"}

    with ThreadPoolExecutor(max_workers=arguments.workers) as pool:
        links = list(pool.map(resolve, spells))

    linked = [link for link in links if link.get("source")]
    unresolved = [link for link in links if not link.get("source")]
    # Two spells pointing at one icon means one of them is mismatched.
    used: dict[int, list[str]] = {}
    for link in linked:
        if link["source"] == "client-atlas":
            used.setdefault(link["iconIndex"], []).append(link["name"])
    duplicates = {index: names for index, names in used.items() if len(names) > 1}

    output = knowledge / "spell-icon-links.json"
    output.write_text(json.dumps({
        "version": 1,
        "iconEdge": ICON_EDGE,
        "linked": len(linked),
        "unresolved": len(unresolved),
        "duplicateIcons": duplicates,
        "links": links,
    }, ensure_ascii=False, indent=2), encoding="utf8")

    from collections import Counter
    print(f"[spell-icons] linked={len(linked)} unresolved={len(unresolved)} "
          f"by source={dict(Counter(link['source'] for link in linked))}")
    if duplicates:
        print(f"[spell-icons] WARNING {len(duplicates)} icons claimed by more than one spell:")
        for index, names in list(duplicates.items())[:10]:
            print(f"    icon {index}: {names}")
    for link in unresolved[:10]:
        print(f"    unresolved {link['name']}: {link.get('reason')}")
    print(f"[spell-icons] -> {output}")


if __name__ == "__main__":
    main()
