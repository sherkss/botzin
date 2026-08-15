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

/** Adds the species name to each detected creature; a no-op when no model is installed. */
export interface CreatureIdentifier {
  identify(frame: ScreenFrame, entities: readonly GameEntity[]): Promise<readonly GameEntity[]>;
}

export class PerceptionPipeline {
  private nextFrame: Promise<ScreenFrame> | null = null;

  constructor(
    private readonly frameSource: FrameSource,
    private readonly detector: EntityDetector,
    private readonly identifier: CreatureIdentifier | null = null
  ) {}

  async inspectCurrentFrame(): Promise<PerceptionResult> {
    this.nextFrame ??= this.captureNextFrame();
    const frame = await this.nextFrame;
    // Capture the next frame while the detector processes this one. Only one
    // frame is prefetched, so stale frames never accumulate in a queue.
    this.nextFrame = this.captureNextFrame();
    const detected = await this.detector.detect(frame);
    // Species names are what the creature rules look up in the catalog; without
    // them every creature is just "creature" and the knowledge is unusable.
    const entities = this.identifier ? await this.identifier.identify(frame, detected) : detected;

    return {
      sourceComputerId: frame.sourceComputerId,
      capturedAt: frame.capturedAt,
      entities,
      frame
    };
  }

  private captureNextFrame(): Promise<ScreenFrame> {
    const pending = this.frameSource.captureFrame();
    // A slow detector may finish after a prefetched capture fails. Attach a
    // handler immediately; the original rejection is still observed next cycle.
    void pending.catch(() => undefined);
    return pending;
  }
}
