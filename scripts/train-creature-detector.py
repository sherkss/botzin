"""Generate a synthetic Tibia entity dataset and train/export a small YOLO detector.

The model learns two coarse classes: ``creature`` and ``item``. Every imported
species teaches the same ``creature`` class and every imported sprite teaches the
same ``item`` class. Species/item identification belongs to a second-stage
classifier; asking a small detector to learn thousands of names with only a few
samples each prevents it from learning detection at all.

Item sprites are optional: without ``storage/knowledge/item-assets`` the script
falls back to the original single-class creature model.
"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import json
import os
import random
import shutil
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from PIL import Image, ImageFilter, ImageOps
from ultralytics import YOLO

# labels.json "kind" feeds GameEntity.kind at runtime (src/core/game-entity.ts);
# any other value corrupts the live entity counters downstream.
VALID_ENTITY_KINDS = {"player", "creature", "npc", "player-summon", "item", "effect", "missile", "unknown"}

# Each source draws at its own native tile size (creature animations are 64px, item
# sprites 32px, client effects 32px and missiles 64px), so every class needs its own
# range to end up at a comparable on-screen size.
SCALE_RANGES = {
    # A 64 px Tibia creature becomes roughly 8-16 px after a full 1280/1920 px
    # gameplay capture is letterboxed to the 320 px detector input. Keep larger
    # examples as well, but include that live-capture range in the training set.
    "creature": (0.12, 0.70),
    "item": (0.45, 1.30),
    "effect": (0.45, 1.30),
    "missile": (0.30, 0.90),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", default="storage/knowledge/creature-assets")
    parser.add_argument("--items", default="storage/knowledge/item-assets")
    parser.add_argument("--items-per-sample", type=int, default=4)
    parser.add_argument("--skip-items", action="store_true")
    parser.add_argument("--effects", default="storage/knowledge/effect-assets")
    parser.add_argument("--effects-per-sample", type=int, default=2)
    parser.add_argument("--skip-effects", action="store_true")
    parser.add_argument("--missiles", default="storage/knowledge/missile-assets")
    parser.add_argument("--missiles-per-sample", type=int, default=2)
    parser.add_argument("--skip-missiles", action="store_true")
    parser.add_argument("--backgrounds", default="storage/knowledge/visual-training/frames")
    parser.add_argument("--dataset", default="storage/knowledge/creature-training-binary")
    parser.add_argument("--output-model", default="models/tibia-creatures.onnx")
    parser.add_argument("--output-labels", default="models/tibia-creatures.labels.json")
    parser.add_argument("--base-model", default="yolo11n.pt")
    parser.add_argument("--samples-per-creature", "--samples-per-class", dest="samples_per_creature", type=int, default=3)
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--image-size", type=int, default=320)
    parser.add_argument("--seed", type=int, default=20260806)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--freeze", type=int, default=10)
    parser.add_argument("--warmup-epochs", type=float, default=0.5)
    parser.add_argument("--fraction", type=float, default=1.0)
    parser.add_argument("--validation-limit", type=int, default=0)
    parser.add_argument("--skip-validation", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--reuse-dataset", action="store_true")
    parser.add_argument(
        "--force", action="store_true",
        help="break a lock still held by a live process (data loss if it is really training)",
    )
    return parser.parse_args()


def process_alive(pid: int) -> bool:
    """Best-effort liveness check used to recognise abandoned lock files."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        # os.kill(pid, 0) terminates the target on Windows, so the process has to be
        # probed through the Win32 API instead.
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return False
            return code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@contextlib.contextmanager
def exclusive_lock(target: Path, force: bool):
    """Claim ``target`` for this run, refusing to share it with a concurrent one.

    Two trainings started with the default flags write the same dataset, weights and
    ONNX paths. Since ``create_dataset`` deletes and rebuilds the image and label
    trees, the second run silently destroys the first one's data mid-training. A
    lock file next to each owned path turns that into an immediate, explicit failure.
    """
    lock = target.with_name(target.name + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({
        "pid": os.getpid(),
        "host": socket.gethostname(),
        "target": str(target),
        "startedAt": datetime.now(timezone.utc).isoformat(),
    })

    for attempt in range(3):
        try:
            handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                holder = json.loads(lock.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                holder = {}
            pid = int(holder.get("pid", 0) or 0)
            same_host = holder.get("host") == socket.gethostname()
            if not force and same_host and process_alive(pid):
                raise SystemExit(
                    f"[creature-train] {target} is already in use by pid {pid} "
                    f"(started {holder.get('startedAt', 'unknown')}).\n"
                    f"[creature-train] Run the second training with its own --dataset, "
                    f"--output-model and --output-labels, or pass --force to override."
                )
            # The holder is gone (or the user insisted): reclaim and retry.
            with contextlib.suppress(OSError):
                lock.unlink()
            time.sleep(0.05 * (attempt + 1))
            continue
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            file.write(payload)
        break
    else:
        raise SystemExit(f"[creature-train] could not acquire the lock for {target}")

    try:
        yield
    finally:
        with contextlib.suppress(OSError):
            lock.unlink()


def main() -> None:
    args = parse_args()
    if args.samples_per_creature < 2:
        raise ValueError("--samples-per-creature must be at least 2 (train + validation).")
    if args.epochs < 1 or args.image_size < 128:
        raise ValueError("--epochs must be positive and --image-size must be at least 128.")
    if not 0.0 < args.fraction <= 1.0:
        raise ValueError("--fraction must be greater than 0 and at most 1.")
    if args.items_per_sample < 0:
        raise ValueError("--items-per-sample must not be negative.")

    # Everything this run rewrites has to be claimed before any of it is touched,
    # so a concurrent training fails on the lock instead of halfway through.
    owned = [
        Path(args.dataset).resolve(),
        Path(args.output_model).resolve(),
        Path(args.output_labels).resolve(),
    ]
    with contextlib.ExitStack() as stack:
        for target in dict.fromkeys(owned):
            stack.enter_context(exclusive_lock(target, args.force))
        run(args)


def run(args: argparse.Namespace) -> None:
    assets_root = Path(args.assets).resolve()
    backgrounds = list_images(Path(args.backgrounds).resolve())
    creatures = load_creatures(assets_root)
    items = [] if args.skip_items or args.items_per_sample == 0 else load_items(Path(args.items).resolve())
    effects = [] if args.skip_effects or args.effects_per_sample == 0 else load_client_assets(Path(args.effects).resolve())
    missiles = [] if args.skip_missiles or args.missiles_per_sample == 0 else load_client_assets(Path(args.missiles).resolve())
    if not backgrounds:
        raise RuntimeError("No real video frames were found for synthetic backgrounds.")
    if len(creatures) < 2:
        raise RuntimeError("At least two imported creature animations are required.")

    # YOLO requires contiguous class ids starting at zero, so an absent optional
    # asset group must not leave a hole in the numbering.
    groups = [
        {"name": "creature", "assets": creatures, "perSample": 0},
        {"name": "item", "assets": items, "perSample": args.items_per_sample},
        {"name": "effect", "assets": effects, "perSample": args.effects_per_sample},
        {"name": "missile", "assets": missiles, "perSample": args.missiles_per_sample},
    ]
    groups = [group for group in groups if group["assets"]]
    for class_id, group in enumerate(groups):
        group["classId"] = class_id
    class_names = {group["classId"]: group["name"] for group in groups}

    dataset_root = Path(args.dataset).resolve()
    if not args.reuse_dataset:
        create_dataset(
            dataset_root, groups, backgrounds, class_names,
            args.samples_per_creature, args.image_size, args.seed
        )
    data_yaml = dataset_root / "data.yaml"
    if not data_yaml.is_file():
        raise RuntimeError(f"Dataset metadata was not found: {data_yaml}")
    # The dataset is authoritative when it is reused. This prevents a newly
    # available optional asset class (for example, items) from making the label
    # file disagree with an already generated one-class ONNX model.
    dataset_metadata = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    dataset_names = dataset_metadata.get("names", {})
    if isinstance(dataset_names, list):
        class_names = {index: str(name) for index, name in enumerate(dataset_names)}
    else:
        class_names = {int(class_id): str(name) for class_id, name in dataset_names.items()}
    if not class_names:
        raise RuntimeError(f"Dataset classes were not found in {data_yaml}")
    invalid_kinds = sorted(name for name in class_names.values() if name not in VALID_ENTITY_KINDS)
    if invalid_kinds:
        raise RuntimeError(
            f"Dataset classes {invalid_kinds} in {data_yaml} are not valid GameEntityKind values; "
            "the dataset was likely built by an older script version. Regenerate it without --reuse-dataset."
        )
    labels_path = Path(args.output_labels).resolve()
    labels_path.parent.mkdir(parents=True, exist_ok=True)
    labels_path.write_text(json.dumps([
        {"id": class_id, "kind": name, "label": name} for class_id, name in sorted(class_names.items())
    ], ensure_ascii=False, indent=2), encoding="utf-8")

    train_samples = len(creatures) * (args.samples_per_creature - 1)
    validation_samples = len(creatures)
    print(
        f"[creature-train] classes={len(class_names)} species={len(creatures)} items={len(items)} "
        f"effects={len(effects)} missiles={len(missiles)} "
        f"train={train_samples} val={validation_samples} backgrounds={len(backgrounds)} dataset={dataset_root}"
    )
    if args.prepare_only:
        print("[creature-train] dataset prepared; training skipped by --prepare-only")
        return
    model = YOLO(args.base_model)
    training_yaml = build_training_yaml(dataset_root, data_yaml, args.validation_limit, args.seed)
    result = model.train(
        data=str(training_yaml),
        epochs=args.epochs,
        imgsz=args.image_size,
        device=args.device,
        workers=0,
        batch=args.batch,
        freeze=args.freeze,
        warmup_epochs=args.warmup_epochs,
        fraction=args.fraction,
        cache=False,
        project=str(dataset_root / "runs"),
        name="yolo-creature-binary",
        exist_ok=True,
        patience=max(2, args.epochs),
        single_cls=len(class_names) == 1,
        seed=args.seed,
        val=not args.skip_validation,
        plots=not args.skip_validation,
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


def load_items(root: Path) -> list[dict]:
    items: list[dict] = []
    for manifest_path in sorted(root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        sprites = [manifest_path.parent / value for value in manifest.get("files", [])]
        sprites = [sprite for sprite in sprites if sprite.is_file()]
        if not sprites:
            continue
        items.append({
            "sourceId": int(manifest["sourceId"]),
            "name": str(manifest["name"]),
            "frames": sprites,
        })
    items.sort(key=lambda value: value["sourceId"])
    return items


def load_client_assets(root: Path) -> list[dict]:
    """Effects and missiles share the manifest layout written by pack-client-effects.py."""
    assets: list[dict] = []
    for manifest_path in sorted(root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        frames = [manifest_path.parent / value for value in manifest.get("files", [])]
        frames = [frame for frame in frames if frame.is_file()]
        if not frames:
            continue
        assets.append({"id": int(manifest["id"]), "frames": frames})
    assets.sort(key=lambda value: value["id"])
    return assets


def list_images(root: Path) -> list[Path]:
    extensions = {".jpg", ".jpeg", ".png", ".webp"}
    return [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in extensions]


def build_training_yaml(dataset_root: Path, data_yaml: Path, validation_limit: int, seed: int) -> Path:
    if validation_limit <= 0:
        return data_yaml
    validation_images = sorted((dataset_root / "images" / "val").glob("*.jpg"))
    rng = random.Random(seed + 1)
    rng.shuffle(validation_images)
    selected = validation_images[:validation_limit]
    validation_list = dataset_root / "validation-quick.txt"
    validation_list.write_text("\n".join(str(path) for path in selected) + "\n", encoding="utf-8")
    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    data["val"] = str(validation_list)
    training_yaml = dataset_root / "data-training.yaml"
    training_yaml.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return training_yaml


def create_dataset(
    root: Path,
    groups: list[dict],
    backgrounds: list[Path],
    class_names: dict[int, str],
    samples: int,
    size: int,
    seed: int,
) -> None:
    rng = random.Random(seed)
    for split in ("train", "val"):
        (root / "images" / split).mkdir(parents=True, exist_ok=True)
        (root / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Generation is resumable per creature. Clearing the whole tree up front means an
    # interruption leaves nothing behind and the next attempt starts over, which never
    # finishes on a machine where runs are cut short. Stale files from an older class
    # set are still removed, just individually rather than by wiping everything.
    # Keyed by split: the same stem moves between train and val when
    # --samples-per-creature changes, so a stem-only check leaves the old copy behind
    # in the split it no longer belongs to.
    expected: dict[str, set[str]] = {"train": set(), "val": set()}

    # Cached samples keep the class ids they were generated with, while ids are
    # renumbered per run from whichever optional asset groups are present. Reusing
    # them under a different id->name mapping would silently train boxes as the
    # wrong class, so any mapping change (or an unverifiable pre-marker dataset)
    # discards the cache.
    class_map_path = root / "class-map.json"
    class_map = json.dumps(dict(sorted(class_names.items())), sort_keys=True)
    previous_map = class_map_path.read_text(encoding="utf-8") if class_map_path.is_file() else None
    if previous_map != class_map:
        discarded = 0
        for split in ("train", "val"):
            for path in (root / "images" / split).glob("*.jpg"):
                path.unlink(missing_ok=True)
                discarded += 1
            for path in (root / "labels" / split).glob("*.txt"):
                path.unlink(missing_ok=True)
        if discarded:
            print(f"[creature-train] class map changed; discarded {discarded} cached samples")
    class_map_path.write_text(class_map, encoding="utf-8")

    def sample_paths(stem: str, split: str) -> tuple[Path, Path]:
        return (root / "images" / split / f"{stem}.jpg", root / "labels" / split / f"{stem}.txt")

    creature_group = groups[0]
    creatures = creature_group["assets"]
    optional_groups = groups[1:]
    training_order = creatures.copy()
    rng.shuffle(training_order)
    for creature_index, creature in enumerate(training_order):
        for sample_index in range(samples):
            split = "val" if sample_index == samples - 1 else "train"
            stem = f"{creature_index:04d}-{creature['race']}-{sample_index:03d}"
            expected[split].add(stem)
            image_path, label_path = sample_paths(stem, split)
            # Both files must exist: an interrupted write can leave the image without
            # its label, and a sample missing its label would train on nothing.
            if image_path.is_file() and label_path.is_file():
                continue
            instance_count = rng.randint(2, 6)
            sprites = [(rng.choice(creature["frames"]), creature_group["classId"])]
            sprites.extend(
                (rng.choice(rng.choice(creatures)["frames"]), creature_group["classId"])
                for _ in range(instance_count - 1)
            )
            # Loot on the ground, spell effects and missiles all share the viewport with
            # the creatures they belong to, so every class must appear in the same frame
            # for the detector to learn to separate them.
            for group in optional_groups:
                sprites.extend(
                    (rng.choice(rng.choice(group["assets"])["frames"]), group["classId"])
                    for _ in range(rng.randint(0, group["perSample"]))
                )
            image, label = synthetic_sample(rng.choice(backgrounds), sprites, size, rng, class_names)
            # Label first: a stray label without its image is skipped by the trainer,
            # while an image without a label would be read as a frame with no objects.
            label_path.write_text(label + "\n", encoding="utf-8")
            image.save(image_path, quality=91, optimize=True)

    # Anything left from a previous, different class set would otherwise stay in the
    # dataset and be trained on.
    removed = 0
    for split in ("train", "val"):
        for stale in (root / "images" / split).glob("*.jpg"):
            if stale.stem not in expected[split]:
                stale.unlink(missing_ok=True)
                (root / "labels" / split / f"{stale.stem}.txt").unlink(missing_ok=True)
                removed += 1
    if removed:
        print(f"[creature-train] removidas {removed} amostras obsoletas do dataset")

    data = {
        "path": str(root),
        "train": "images/train",
        "val": "images/val",
        "names": dict(sorted(class_names.items())),
    }
    (root / "data.yaml").write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def synthetic_sample(
    background_path: Path,
    sprites: list[tuple[Path, int]],
    size: int,
    rng: random.Random,
    class_names: dict[int, str],
) -> tuple[Image.Image, str]:
    with Image.open(background_path) as source:
        background = source.convert("RGB")
        scale = min(size / background.width, size / background.height)
        resized_width = round(background.width * scale)
        resized_height = round(background.height * scale)
        background = background.resize((resized_width, resized_height), Image.Resampling.LANCZOS)
    pad_x = (size - resized_width) // 2
    pad_y = (size - resized_height) // 2
    canvas = Image.new("RGB", (size, size), (114, 114, 114))
    canvas.paste(background, (pad_x, pad_y))
    # Video frames can already contain unlabelled creatures. Blur them so the pasted,
    # labelled sprite remains the only sharp training target.
    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=4.0))
    labels: list[str] = []
    content_left = pad_x + round(resized_width * 0.18)
    content_right = pad_x + round(resized_width * 0.82)
    content_top = pad_y + round(resized_height * 0.08)
    content_bottom = pad_y + round(resized_height * 0.82)
    cluster_center = (rng.randint(content_left, content_right), rng.randint(content_top, content_bottom))

    for index, (sprite_path, class_id) in enumerate(sprites):
        with Image.open(sprite_path) as source:
            sprite = source.convert("RGBA")
        alpha_box = sprite.getchannel("A").getbbox()
        if not alpha_box:
            raise RuntimeError(f"Sprite has no visible pixels: {sprite_path}")
        sprite = sprite.crop(alpha_box)
        # Item sprites are 32px tiles while creature animations are 64px, so both
        # classes need their own scale range to end up at a comparable on-screen size.
        minimum, maximum = SCALE_RANGES.get(class_names.get(class_id, ""), SCALE_RANGES["creature"])
        scale = rng.uniform(minimum, maximum)
        width = min(size, max(8, round(sprite.width * scale)))
        height = min(size, max(8, round(sprite.height * scale)))
        sprite = sprite.resize((width, height), Image.Resampling.NEAREST)

        # Most game encounters form a cluster around the player, while some
        # creatures remain spread across the viewport.
        if index > 0 and rng.random() < 0.75:
            x = max(content_left, min(content_right - width, cluster_center[0] + rng.randint(-36, 36) - width // 2))
            y = max(content_top, min(content_bottom - height, cluster_center[1] + rng.randint(-28, 28) - height // 2))
        else:
            x = rng.randint(content_left, max(content_left, content_right - width))
            y = rng.randint(content_top, max(content_top, content_bottom - height))
        # A sprite wider than the content area falls back to content_left/top above,
        # which can push the box past the canvas; a single coordinate outside [0, 1]
        # makes YOLO discard every label in the image.
        x = max(0, min(x, size - width))
        y = max(0, min(y, size - height))
        canvas.paste(sprite, (x, y), sprite)
        center_x = (x + width / 2) / size
        center_y = (y + height / 2) / size
        labels.append(f"{class_id} {center_x:.6f} {center_y:.6f} {width / size:.6f} {height / size:.6f}")

    return canvas, "\n".join(labels)


if __name__ == "__main__":
    main()
