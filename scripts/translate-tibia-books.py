"""Translate Tibia book cache input with an installed Argos en->pt model."""

from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("CT2_NUM_THREADS", "1")

from argostranslate import translate

DELIMITER = "9876543210123456789"
PROVIDER = "Argos Translate en_pt 1.9"
def machine_translate(text: str) -> str:
    if not text or not re.search(r"[A-Za-z]", text):
        return text
    # Argos splits sentences internally and sends them to CTranslate2 as a batch.
    translated = translate.translate(text, "en", "pt")
    # The current Argos en_pt model occasionally emits Romanian breve where Portuguese uses tilde.
    return translated.replace("ă", "ã").replace("Ă", "Ã")


def translate_entry(entry: dict[str, object]) -> dict[str, object]:
    title = str(entry.get("titleEn") or "")
    blurb = str(entry.get("blurbEn") or "")
    combined = machine_translate(f"{title}\n{DELIMITER}\n{blurb}")
    translated_parts = combined.split(DELIMITER, 1)
    title_pt = translated_parts[0].strip()
    blurb_pt = translated_parts[1].strip() if len(translated_parts) > 1 else machine_translate(blurb)
    return {
        "revisionId": entry.get("revisionId"),
        "titlePtBr": title_pt,
        "blurbPtBr": blurb_pt,
        "textPtBr": machine_translate(str(entry.get("textEn") or "")),
        "provider": PROVIDER,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def main() -> None:
    input_path, output_path = map(Path, sys.argv[1:3])
    entries = json.loads(input_path.read_text(encoding="utf-8"))
    cache = json.loads(output_path.read_text(encoding="utf-8")) if output_path.exists() else {}
    pending = [entry for entry in entries if cache.get(str(entry["pageId"]), {}).get("revisionId") != entry.get("revisionId")]
    workers = max(1, int(os.environ.get("BOTZIN_TRANSLATION_WORKERS", "3")))
    completed = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(translate_entry, entry): entry for entry in pending}
        for future in as_completed(futures):
            entry = futures[future]
            cache[str(entry["pageId"])] = future.result()
            completed += 1
            if completed % 10 == 0:
                output_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"translated {len(cache)}/{len(entries)}", flush=True)
    output_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved {len(cache)} translations", flush=True)


if __name__ == "__main__":
    main()
