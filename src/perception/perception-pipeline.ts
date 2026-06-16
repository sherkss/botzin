import type { GameEntity } from "../core/game-entity.js";
import type { EntityDetector } from "./entity-detector.js";
import type { FrameSource } from "./frame-source.js";

export interface PerceptionResult {
  readonly sourceComputerId: string;
  readonly capturedAt: string;
  readonly entities: readonly GameEntity[];
}

export class PerceptionPipeline {
  constructor(
    private readonly frameSource: FrameSource,
    private readonly detector: EntityDetector
  ) {}

  async inspectCurrentFrame(): Promise<PerceptionResult> {
    const frame = await this.frameSource.captureFrame();
    const entities = await this.detector.detect(frame);

    return {
      sourceComputerId: frame.sourceComputerId,
      capturedAt: frame.capturedAt,
      entities
    };
  }
}
