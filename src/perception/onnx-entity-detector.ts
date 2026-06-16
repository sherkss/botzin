import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { BoundingBox, GameEntity, GameEntityKind } from "../core/game-entity.js";
import type { ScreenFrame } from "../core/frame.js";
import type { EntityDetector } from "./entity-detector.js";

interface ModelLabel {
  readonly id: number;
  readonly kind: GameEntityKind;
  readonly label: string;
}

interface Candidate {
  readonly kind: GameEntityKind;
  readonly label: string;
  readonly confidence: number;
  readonly box: BoundingBox;
}

export class OnnxEntityDetector implements EntityDetector {
  readonly name = "onnx-local-vision";
  private sessionPromise: Promise<ort.InferenceSession> | null = null;
  private labelsPromise: Promise<readonly ModelLabel[]> | null = null;

  constructor(private readonly config: RuntimeConfig) {}

  async detect(frame: ScreenFrame): Promise<readonly GameEntity[]> {
    const [session, labels] = await Promise.all([this.getSession(), this.getLabels()]);
    const input = await this.prepareInput(frame);
    const inputName = session.inputNames[0];
    const output = await session.run({ [inputName]: input });
    const outputTensor = output[session.outputNames[0]];

    if (!outputTensor) {
      throw new Error("ONNX model did not return an output tensor.");
    }

    return this.parseDetections(outputTensor, labels, frame).map((candidate) => ({
      id: randomUUID(),
      kind: candidate.kind,
      confidence: candidate.confidence,
      box: candidate.box,
      label: candidate.label,
      sourceComputerId: frame.sourceComputerId,
      observedAt: new Date().toISOString()
    }));
  }

  private getSession(): Promise<ort.InferenceSession> {
    this.sessionPromise ??= this.createSession();
    return this.sessionPromise;
  }

  private async createSession(): Promise<ort.InferenceSession> {
    const modelPath = resolve(this.config.onnxModelPath);
    await access(modelPath).catch(() => {
      throw new Error(`ONNX model not found at "${modelPath}". Train/export a Tibia entity model and update BOTZIN_ONNX_MODEL_PATH.`);
    });
    return ort.InferenceSession.create(modelPath);
  }

  private getLabels(): Promise<readonly ModelLabel[]> {
    this.labelsPromise ??= this.loadLabels();
    return this.labelsPromise;
  }

  private async loadLabels(): Promise<readonly ModelLabel[]> {
    const labelsPath = resolve(this.config.onnxLabelsPath);
    const raw = await readFile(labelsPath, "utf8").catch(() => {
      throw new Error(`ONNX labels not found at "${labelsPath}". Create a labels JSON file matching the model classes.`);
    });
    const parsed = JSON.parse(raw) as ModelLabel[];
    return parsed;
  }

  private async prepareInput(frame: ScreenFrame): Promise<ort.Tensor> {
    const { data, info } = await sharp(frame.data)
      .resize(this.config.onnxInputWidth, this.config.onnxInputHeight, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const planeSize = info.width * info.height;
    const input = new Float32Array(channels * planeSize);

    for (let index = 0; index < planeSize; index += 1) {
      input[index] = data[index * channels] / 255;
      input[index + planeSize] = data[index * channels + 1] / 255;
      input[index + planeSize * 2] = data[index * channels + 2] / 255;
    }

    return new ort.Tensor("float32", input, [1, 3, info.height, info.width]);
  }

  private parseDetections(
    tensor: ort.Tensor,
    labels: readonly ModelLabel[],
    frame: ScreenFrame
  ): readonly Candidate[] {
    const data = tensor.data as Float32Array;
    const dims = tensor.dims;
    const rows = normalizeRows(data, dims, labels.length);
    const candidates = rows
      .map((row) => this.rowToCandidate(row, labels, frame))
      .filter((candidate): candidate is Candidate => candidate !== null)
      .sort((left, right) => right.confidence - left.confidence);

    return nonMaxSuppression(candidates, this.config.detectionIou);
  }

  private rowToCandidate(row: readonly number[], labels: readonly ModelLabel[], frame: ScreenFrame): Candidate | null {
    const hasObjectness = row.length >= labels.length + 5;
    const classOffset = hasObjectness ? 5 : 4;
    const classScores = row.slice(classOffset, classOffset + labels.length);
    let classId = 0;
    let classScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < classScores.length; index += 1) {
      if (classScores[index] > classScore) {
        classScore = classScores[index];
        classId = index;
      }
    }

    const objectness = hasObjectness ? row[4] : 1;
    const confidence = classScore * objectness;

    if (confidence < this.config.detectionConfidence) {
      return null;
    }

    const label = labels.find((entry) => entry.id === classId) ?? {
      id: classId,
      kind: "unknown" as const,
      label: `class-${classId}`
    };

    return {
      kind: label.kind,
      label: label.label,
      confidence,
      box: scaleBoxFromModel(row[0], row[1], row[2], row[3], frame, this.config.onnxInputWidth, this.config.onnxInputHeight)
    };
  }
}

function normalizeRows(data: Float32Array, dims: readonly number[], labelCount: number): readonly (readonly number[])[] {
  if (dims.length !== 3 || dims[0] !== 1) {
    throw new Error(`Unsupported ONNX output shape: [${dims.join(", ")}]. Expected YOLO-style [1, N, C] or [1, C, N].`);
  }

  const second = dims[1];
  const third = dims[2];
  const channelCount = labelCount + 4;
  const rows: number[][] = [];

  if (third >= channelCount) {
    for (let row = 0; row < second; row += 1) {
      const offset = row * third;
      rows.push(Array.from(data.slice(offset, offset + third)));
    }
    return rows;
  }

  if (second >= channelCount) {
    for (let row = 0; row < third; row += 1) {
      const values: number[] = [];
      for (let channel = 0; channel < second; channel += 1) {
        values.push(data[channel * third + row]);
      }
      rows.push(values);
    }
    return rows;
  }

  throw new Error(`Unsupported ONNX output shape: [${dims.join(", ")}].`);
}

function scaleBoxFromModel(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  frame: ScreenFrame,
  modelWidth: number,
  modelHeight: number
): BoundingBox {
  const normalized = centerX <= 1 && centerY <= 1 && width <= 1 && height <= 1;
  const sourceWidth = normalized ? 1 : modelWidth;
  const sourceHeight = normalized ? 1 : modelHeight;
  const scaleX = frame.width / sourceWidth;
  const scaleY = frame.height / sourceHeight;
  const x = (centerX - width / 2) * scaleX;
  const y = (centerY - height / 2) * scaleY;

  return {
    x: clamp(Math.round(x), 0, frame.width),
    y: clamp(Math.round(y), 0, frame.height),
    width: clamp(Math.round(width * scaleX), 0, frame.width),
    height: clamp(Math.round(height * scaleY), 0, frame.height)
  };
}

function nonMaxSuppression(candidates: readonly Candidate[], threshold: number): readonly Candidate[] {
  const selected: Candidate[] = [];

  for (const candidate of candidates) {
    if (selected.every((entry) => iou(entry.box, candidate.box) <= threshold)) {
      selected.push(candidate);
    }
  }

  return selected;
}

function iou(left: BoundingBox, right: BoundingBox): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
