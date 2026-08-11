"""Build and train a second-stage classifier for Tibia creature names."""

from __future__ import annotations

import argparse
import json
import random
import shutil
from pathlib import Path

from PIL import Image
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", default="storage/knowledge/creature-assets")
    parser.add_argument("--links", default="storage/knowledge/creature-outfit-links.json")
    parser.add_argument(
        "--all-creatures", action="store_true",
        help="train on every imported creature instead of only the visually distinct ones",
    )
    parser.add_argument("--client-sprites", default="storage/knowledge/client-sprites")
    parser.add_argument(
        "--no-client-sprites", action="store_true",
        help="train only on the wiki animations, without the client's other facings",
    )
    parser.add_argument("--val-fraction", type=float, default=0.15)
    parser.add_argument("--backgrounds", default="storage/knowledge/visual-training/frames")
    parser.add_argument("--dataset", default="storage/knowledge/creature-classification")
    parser.add_argument("--base-model", default="yolo11n-cls.pt")
    parser.add_argument(
        "--run-name", default="species",
        help="subdirectory under runs/; give competing configurations different names "
             "so their weights and metrics survive side by side",
    )
    parser.add_argument("--output-model", default="models/tibia-creature-classifier.onnx")
    parser.add_argument("--output-labels", default="models/tibia-creature-classifier.labels.json")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--image-size", type=int, default=64)
    parser.add_argument("--batch", type=int, default=128)
    parser.add_argument("--samples-per-frame", type=int, default=4)
    parser.add_argument("--freeze", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.002)
    parser.add_argument("--seed", type=int, default=20260807)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--reuse-dataset", action="store_true")
    parser.add_argument(
        "--resume", action="store_true",
        help="continue an interrupted run from runs/species/weights/last.pt",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    assets = Path(args.assets).resolve()
    backgrounds = list_images(Path(args.backgrounds).resolve())
    dataset = Path(args.dataset).resolve()
    creatures = load_creatures(assets)
    if not args.all_creatures:
        creatures = keep_visually_distinct(creatures, Path(args.links).resolve())
    if len(creatures) < 2:
        raise RuntimeError("At least two creature classes are required to train a classifier.")
    if not args.no_client_sprites:
        creatures = add_client_facings(
            creatures, Path(args.links).resolve(), Path(args.client_sprites).resolve())
    # Regenerating the dataset mid-run would swap the images under a resumed
    # checkpoint, so a resume never rebuilds it.
    if not args.reuse_dataset and not args.resume:
        create_dataset(dataset, creatures, backgrounds, args.image_size,
                       args.samples_per_frame, args.val_fraction, rng)
    if args.prepare_only:
        print(f"[creature-classifier] dataset prepared classes={len(creatures)} path={dataset}")
        return

    if args.resume:
        checkpoint = dataset / "runs" / args.run_name / "weights" / "last.pt"
        if not checkpoint.is_file():
            raise RuntimeError(f"No checkpoint to resume from: {checkpoint}")
        print(f"[creature-classifier] resuming from {checkpoint}")
        # Ultralytics restores epochs, optimizer state and data paths from the
        # checkpoint, so passing them again here would conflict with it.
        result = YOLO(str(checkpoint)).train(resume=True)
    else:
        result = YOLO(args.base_model).train(
            data=str(dataset), epochs=args.epochs, imgsz=args.image_size,
            batch=args.batch, device="cpu", workers=0, freeze=args.freeze,
            project=str(dataset / "runs"), name=args.run_name, exist_ok=True,
            patience=max(2, args.epochs), warmup_epochs=0.25, plots=False,
            optimizer="AdamW", lr0=args.learning_rate, lrf=0.05,
            erasing=0.0, auto_augment=None,
            seed=args.seed, verbose=True,
        )
    best_path = Path(result.save_dir) / "weights" / "best.pt"
    best = YOLO(str(best_path))
    friendly_names = json.loads((dataset / "class-names.json").read_text(encoding="utf-8"))
    labels = [friendly_names.get(best.names[index], best.names[index]) for index in sorted(best.names)]
    exported = Path(best.export(format="onnx", imgsz=args.image_size, opset=17, simplify=False, dynamic=False))
    output_model = Path(args.output_model).resolve()
    output_model.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(exported, output_model)
    Path(args.output_labels).resolve().write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[creature-classifier] classes={len(labels)} model={output_model}")


def keep_visually_distinct(creatures: list[dict], links_path: Path) -> list[dict]:
    """Drop creatures whose artwork another creature also uses.

    Recoloured variants share one client outfit and differ only by colours the
    server sends, so nothing in the pixels separates them. Training on both teaches
    the classifier a distinction that does not exist and costs accuracy on the
    classes that are genuinely separable.
    """
    if not links_path.is_file():
        raise RuntimeError(
            f"Creature links not found: {links_path}. "
            f"Run scripts/link-creature-outfits.py first, or pass --all-creatures."
        )
    payload = json.loads(links_path.read_text(encoding="utf-8"))
    distinct = {link["race"] for link in payload["links"] if link["visuallyDistinct"]}
    kept = [creature for creature in creatures if creature["race"] in distinct]
    dropped = len(creatures) - len(kept)
    print(f"[creature-classifier] visually distinct filter: kept={len(kept)} dropped={dropped}")
    return kept


def add_client_facings(creatures: list[dict], links_path: Path, sprites_root: Path) -> list[dict]:
    """Add the client's north/east/west facings to each creature's frame pool.

    The wiki animations only ever show the south facing, so a classifier trained on
    them alone never sees a creature walking away from the player - roughly half of
    what happens on screen.

    Colourisable outfits (``layers == 2``) are deliberately skipped: the client
    stores them uncoloured and the real colours arrive from the server at runtime,
    so their sprites would teach a washed-out appearance that never occurs in game.
    Those creatures keep the wiki animation, which is correctly coloured.
    """
    if not links_path.is_file():
        raise RuntimeError(f"Creature links not found: {links_path}. Run scripts/link-creature-outfits.py first.")
    links = {link["race"]: link for link in json.loads(links_path.read_text(encoding="utf-8"))["links"]}

    enriched: list[dict] = []
    added = skipped_colourisable = 0
    for creature in creatures:
        link = links.get(creature["race"])
        extra: list[Path] = []
        if link is None:
            pass
        elif link["layers"] != 1:
            skipped_colourisable += 1
        else:
            for sprite_ids in link["spritesByDirection"].values():
                for sprite_id in sprite_ids:
                    path = sprites_root / f"{sprite_id // 1000:04d}" / f"{sprite_id}.png"
                    if path.is_file():
                        extra.append(path)
        added += len(extra)
        # Duplicate sprite ids are common: symmetric creatures reuse one drawing for
        # opposite facings, and repeats would skew the class towards that pose.
        frames = list(dict.fromkeys([*creature["frames"], *extra]))
        enriched.append({**creature, "frames": frames})

    total = sum(len(creature["frames"]) for creature in enriched)
    print(f"[creature-classifier] client facings: added={added} frames, "
          f"skipped colourisable={skipped_colourisable}, total frames={total}")
    return enriched


def load_creatures(root: Path) -> list[dict]:
    creatures = []
    for path in sorted(root.glob("*/manifest.json")):
        manifest = json.loads(path.read_text(encoding="utf-8"))
        frames = [path.parent / value for value in manifest.get("files", [])]
        frames = [frame for frame in frames if frame.is_file()]
        if len(frames) >= 2:
            creatures.append({"race": str(manifest["race"]), "name": str(manifest["name"]), "frames": frames})
    return creatures


def list_images(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]


def create_dataset(
    root: Path,
    creatures: list[dict],
    backgrounds: list[Path],
    size: int,
    samples_per_frame: int,
    val_fraction: float,
    rng: random.Random,
) -> None:
    # Generation is resumable per class. It wipes and rebuilds one creature at a
    # time instead of clearing everything up front, because an interruption during a
    # full rebuild leaves no dataset at all and the next attempt starts from zero -
    # on a machine where runs get cut short, that never converges.
    expected: dict[str, dict[str, int]] = {}
    for creature in creatures:
        frames = creature["frames"]
        held_out = max(1, round(len(frames) * val_fraction))
        step = len(frames) / held_out
        validation = {int(position * step) for position in range(held_out)}
        val_variants = max(2, samples_per_frame // 2)
        expected[creature["race"]] = {
            "val": len(validation) * val_variants,
            "train": (len(frames) - len(validation)) * samples_per_frame,
        }

    def is_complete(race: str) -> bool:
        counts = expected[race]
        for split, wanted in counts.items():
            directory = root / split / race
            if not directory.is_dir():
                return False
            if sum(1 for _ in directory.glob("*.jpg")) != wanted:
                return False
        return True

    # Classes left over from a previous, different creature set would otherwise
    # linger and be picked up as extra labels.
    keep = {creature["race"] for creature in creatures}
    for split in ("train", "val"):
        for stale in (root / split).glob("*") if (root / split).is_dir() else []:
            if stale.is_dir() and stale.name not in keep:
                shutil.rmtree(stale, ignore_errors=True)

    done = sum(1 for creature in creatures if is_complete(creature["race"]))
    if done:
        print(f"[creature-classifier] retomando geração: {done}/{len(creatures)} classes já prontas")
    # Opening a full video frame for every small sample makes dataset creation
    # unnecessarily slow. Keep a representative pool decoded in memory and
    # take different random crops from it.
    selected_backgrounds = rng.sample(backgrounds, min(96, len(backgrounds)))
    background_pool = []
    for path in selected_backgrounds:
        with Image.open(path) as source:
            background_pool.append(source.convert("RGB"))
    names = {}
    for creature in creatures:
        names[creature["race"]] = creature["name"]
        if is_complete(creature["race"]):
            continue
        # A partially written class must be cleared, or leftovers from the
        # interrupted attempt would mix with the new ones.
        for split in ("train", "val"):
            shutil.rmtree(root / split / creature["race"], ignore_errors=True)
        frames = creature["frames"]
        # Hold out evenly spaced frames so both splits cover every facing. Taking the
        # last frames instead would put one whole direction in validation and none in
        # training, which measures the wrong thing.
        held_out = max(1, round(len(frames) * val_fraction))
        step = len(frames) / held_out
        validation_indices = {int(position * step) for position in range(held_out)}
        for index, frame in enumerate(frames):
            split = "val" if index in validation_indices else "train"
            target = root / split / creature["race"]
            target.mkdir(parents=True, exist_ok=True)
            variant_count = max(2, samples_per_frame // 2) if split == "val" else samples_per_frame
            for variant in range(variant_count):
                make_sample(frame, rng.choice(background_pool), size, rng).save(
                    target / f"{index:03d}-{variant:02d}.jpg", quality=94
                )
    (root / "class-names.json").write_text(json.dumps(names, ensure_ascii=False, indent=2), encoding="utf-8")


def make_sample(sprite_path: Path, background: Image.Image, size: int, rng: random.Random) -> Image.Image:
    left = rng.randint(0, max(0, background.width - size))
    top = rng.randint(0, max(0, background.height - size))
    canvas = background.crop((left, top, left + size, top + size)).resize((size, size))
    with Image.open(sprite_path) as source:
        sprite = source.convert("RGBA")
    alpha_box = sprite.getchannel("A").getbbox()
    sprite = sprite.crop(alpha_box)
    scale = min((size * rng.uniform(0.55, 0.88)) / max(sprite.width, sprite.height), 2.0)
    width = max(8, round(sprite.width * scale))
    height = max(8, round(sprite.height * scale))
    sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
    x = (size - width) // 2 + rng.randint(-3, 3)
    y = (size - height) // 2 + rng.randint(-3, 3)
    canvas.paste(sprite, (x, y), sprite)
    return canvas


if __name__ == "__main__":
    main()
