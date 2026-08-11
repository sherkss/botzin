import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import type { GameEntity } from "../core/game-entity.js";
import type { ScreenFrame } from "../core/frame.js";

// Anchored to this module instead of the working directory: when the bot runs as
// a service or scheduled task the cwd is rarely the repo root, and a cwd-relative
// default would silently disable species identification.
const DEFAULT_MODEL_PATH = fileURLToPath(new URL("../../models/tibia-creature-classifier.onnx", import.meta.url));
const DEFAULT_LABELS_PATH = fileURLToPath(new URL("../../models/tibia-creature-classifier.labels.json", import.meta.url));

/** Frame pixels already decoded to alpha-less raw RGB. */
interface DecodedFrame {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

export class CreatureSpeciesClassifier {
  private sessionPromise: Promise<ort.InferenceSession | null> | null = null;
  private labelsPromise: Promise<readonly string[]> | null = null;

  constructor(
    private readonly modelPath = process.env.BOTZIN_SPECIES_MODEL_PATH || DEFAULT_MODEL_PATH,
    private readonly labelsPath = process.env.BOTZIN_SPECIES_LABELS_PATH || DEFAULT_LABELS_PATH,
    private readonly inputSize = 64,
    private readonly minimumConfidence = 0.75
  ) {}

  async identify(frame: ScreenFrame, entities: readonly GameEntity[]): Promise<readonly GameEntity[]> {
    const creatureIndexes = entities
      .map((entity, index) => entity.kind === "creature" ? index : -1)
      .filter((index) => index >= 0);
    if (creatureIndexes.length === 0) return entities;

    const [session, labels] = await Promise.all([this.getSession(), this.getLabels()]);
    if (!session || labels.length === 0) return entities;

    // Decode the frame once: cropping straight from frame.data would re-decode
    // the whole JPEG for every detected creature, on the perception hot path.
    const { data, info } = await sharp(frame.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded: DecodedFrame = { data, width: info.width, height: info.height };
    const tensors = await Promise.all(creatureIndexes.map((entityIndex) => this.prepareCrop(decoded, entities[entityIndex])));

    const output = [...entities];
    for (const [position, entityIndex] of creatureIndexes.entries()) {
      const entity = entities[entityIndex];
      const tensor = tensors[position];
      const result = await session.run({ [session.inputNames[0]]: tensor });
      const scores = result[session.outputNames[0]]?.data as Float32Array | undefined;
      if (!scores) continue;
      let classId = 0;
      for (let index = 1; index < Math.min(scores.length, labels.length); index += 1) {
        if (scores[index] > scores[classId]) classId = index;
      }
      if (scores[classId] < this.minimumConfidence) continue;
      output[entityIndex] = { ...entity, label: labels[classId] ?? entity.label };
    }
    return output;
  }

  private getSession(): Promise<ort.InferenceSession | null> {
    this.sessionPromise ??= access(resolve(this.modelPath))
      .then(() => ort.InferenceSession.create(resolve(this.modelPath)))
      .catch((error: unknown) => {
        // The classifier is optional, but disabling it must be visible: without
        // this warning every detection silently keeps the generic "creature"
        // label, which is indistinguishable from a badly trained model.
        console.warn(
          `[creature-species-classifier] species model unavailable at "${resolve(this.modelPath)}" ` +
          `(${error instanceof Error ? error.message : String(error)}); detections keep the generic "creature" label.`
        );
        return null;
      });
    return this.sessionPromise;
  }

  private getLabels(): Promise<readonly string[]> {
    this.labelsPromise ??= readFile(resolve(this.labelsPath), "utf8")
      .then((raw) => JSON.parse(raw) as string[])
      .catch((error: unknown) => {
        console.warn(
          `[creature-species-classifier] species labels unavailable at "${resolve(this.labelsPath)}" ` +
          `(${error instanceof Error ? error.message : String(error)}); species identification is disabled.`
        );
        return [];
      });
    return this.labelsPromise;
  }

  private async prepareCrop(frame: DecodedFrame, entity: GameEntity): Promise<ort.Tensor> {
    const side = Math.max(8, Math.round(Math.max(entity.box.width, entity.box.height) * 1.35));
    const centerX = entity.box.x + entity.box.width / 2;
    const centerY = entity.box.y + entity.box.height / 2;
    const left = clamp(Math.round(centerX - side / 2), 0, Math.max(0, frame.width - side));
    const top = clamp(Math.round(centerY - side / 2), 0, Math.max(0, frame.height - side));
    const width = Math.min(side, frame.width - left);
    const height = Math.min(side, frame.height - top);
    const { data } = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 3 } })
      .extract({ left, top, width, height })
      .resize(this.inputSize, this.inputSize, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const planeSize = this.inputSize * this.inputSize;
    const input = new Float32Array(planeSize * 3);
    for (let pixel = 0; pixel < planeSize; pixel += 1) {
      input[pixel] = data[pixel * 3] / 255;
      input[pixel + planeSize] = data[pixel * 3 + 1] / 255;
      input[pixel + planeSize * 2] = data[pixel * 3 + 2] / 255;
    }
    return new ort.Tensor("float32", input, [1, 3, this.inputSize, this.inputSize]);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
