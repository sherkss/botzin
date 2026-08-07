"""Generate a synthetic Tibia creature dataset and train/export a small YOLO detector."""

from __future__ import annotations

import argparse
import json
import random
import shutil
from pathlib import Path

import yaml
from PIL import Image, ImageFilter, ImageOps
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", default="storage/knowledge/creature-assets")
    parser.add_argument("--backgrounds", default="storage/knowledge/visual-training/frames")
    parser.add_argument("--dataset", default="storage/knowledge/creature-training")
    parser.add_argument("--output-model", default="models/tibia-creatures.onnx")
    parser.add_argument("--output-labels", default="models/tibia-creatures.labels.json")
    parser.add_argument("--base-model", default="yolo11n.pt")
    parser.add_argument("--samples-per-class", type=int, default=3)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--image-size", type=int, default=320)
    parser.add_argument("--seed", type=int, default=20260806)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.samples_per_class < 2:
        raise ValueError("--samples-per-class must be at least 2 (train + validation).")
    if args.epochs < 1 or args.image_size < 128:
        raise ValueError("--epochs must be positive and --image-size must be at least 128.")

    assets_root = Path(args.assets).resolve()
    backgrounds = list_images(Path(args.backgrounds).resolve())
    creatures = load_creatures(assets_root)
    if not backgrounds:
        raise RuntimeError("No real video frames were found for synthetic backgrounds.")
    if len(creatures) < 2:
        raise RuntimeError("At least two imported creature animations are required.")

    dataset_root = Path(args.dataset).resolve()
    create_dataset(dataset_root, creatures, backgrounds, args.samples_per_class, args.image_size, args.seed)
    data_yaml = dataset_root / "data.yaml"
    labels_path = Path(args.output_labels).resolve()
    labels_path.parent.mkdir(parents=True, exist_ok=True)
    labels_path.write_text(json.dumps([
        {"id": index, "kind": "creature", "label": creature["race"], "name": creature["name"], "catalogId": creature["catalogId"]}
        for index, creature in enumerate(creatures)
    ], ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[creature-train] classes={len(creatures)} backgrounds={len(backgrounds)} dataset={dataset_root}")
    model = YOLO(args.base_model)
    result = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.image_size,
        device="cpu",
        workers=0,
        batch=8,
        cache=False,
        project=str(dataset_root / "runs"),
        name="yolo-creatures",
        exist_ok=True,
        patience=max(2, args.epochs),
        seed=args.seed,
        verbose=True,
    )
    best_model = Path(result.save_dir) / "weights" / "best.pt"
    exported = Path(YOLO(str(best_model)).export(format="onnx", imgsz=args.image_size, opset=17, simplify=False, dynamic=False))
    output_model = Path(args.output_model).resolve()
    output_model.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(exported, output_model)
    print(f"[creature-train] ONNX saved to {output_model}")
    print(f"[creature-train] labels saved to {labels_path}")


def load_creatures(root: Path) -> list[dict]:
    creatures: list[dict] = []
    for manifest_path in sorted(root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        frames = [manifest_path.parent / value for value in manifest.get("files", [])]
        frames = [frame for frame in frames if frame.is_file()]
        if len(frames) < 2:
            continue
        creatures.append({
            "catalogId": int(manifest["catalogId"]),
            "race": str(manifest["race"]),
            "name": str(manifest["name"]),
            "frames": frames,
        })
    creatures.sort(key=lambda value: value["race"])
    return creatures


def list_images(root: Path) -> list[Path]:
    extensions = {".jpg", ".jpeg", ".png", ".webp"}
    return [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in extensions]


def create_dataset(root: Path, creatures: list[dict], backgrounds: list[Path], samples: int, size: int, seed: int) -> None:
    rng = random.Random(seed)
    for split in ("train", "val"):
        (root / "images" / split).mkdir(parents=True, exist_ok=True)
        (root / "labels" / split).mkdir(parents=True, exist_ok=True)

    for class_id, creature in enumerate(creatures):
        for sample_index in range(samples):
            split = "val" if sample_index == samples - 1 else "train"
            stem = f"{class_id:04d}-{creature['race']}-{sample_index:03d}"
            image, label = synthetic_sample(
                rng.choice(backgrounds), rng.choice(creature["frames"]), class_id, size, rng
            )
            image.save(root / "images" / split / f"{stem}.jpg", quality=91, optimize=True)
            (root / "labels" / split / f"{stem}.txt").write_text(label + "\n", encoding="utf-8")

    data = {
        "path": str(root),
        "train": "images/train",
        "val": "images/val",
        "names": {index: creature["race"] for index, creature in enumerate(creatures)},
    }
    (root / "data.yaml").write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def synthetic_sample(background_path: Path, sprite_path: Path, class_id: int, size: int, rng: random.Random) -> tuple[Image.Image, str]:
    with Image.open(background_path) as source:
        canvas = ImageOps.fit(source.convert("RGB"), (size, size), method=Image.Resampling.LANCZOS)
    # Video frames can already contain unlabelled creatures. Blur them so the pasted,
    # labelled sprite remains the only sharp training target.
    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=2.2))
    with Image.open(sprite_path) as source:
        sprite = source.convert("RGBA")
    alpha_box = sprite.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError(f"Sprite has no visible pixels: {sprite_path}")
    sprite = sprite.crop(alpha_box)
    scale = rng.uniform(0.8, 1.8)
    width = max(8, round(sprite.width * scale))
    height = max(8, round(sprite.height * scale))
    sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
    x = rng.randint(0, max(0, size - width))
    y = rng.randint(0, max(0, size - height))
    canvas.paste(sprite, (x, y), sprite)
    center_x = (x + width / 2) / size
    center_y = (y + height / 2) / size
    label = f"{class_id} {center_x:.6f} {center_y:.6f} {width / size:.6f} {height / size:.6f}"
    return canvas, label


if __name__ == "__main__":
    main()
