import type { GameEntity } from "../core/game-entity.js";
import type { EntityDetector } from "./entity-detector.js";
import type { FrameSource } from "./frame-source.js";
import type { ScreenFrame } from "../core/frame.js";
import type { CharacterOperationObservation } from "../decision/hunt-operation-policy.js";

export interface PerceptionResult {
  readonly sourceComputerId: string;
  readonly capturedAt: string;
  readonly entities: readonly GameEntity[];
  readonly frame: ScreenFrame;
  readonly operationObservation?: CharacterOperationObservation;
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
      entities,
      frame
    };
  }
}
