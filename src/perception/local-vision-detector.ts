import { randomUUID } from "node:crypto";
import type { GameEntity } from "../core/game-entity.js";
import type { ScreenFrame } from "../core/frame.js";
import type { EntityDetector } from "./entity-detector.js";

export class LocalVisionDetector implements EntityDetector {
  readonly name = "mock-local-vision";

  async detect(frame: ScreenFrame): Promise<readonly GameEntity[]> {
    return [
      {
        id: randomUUID(),
        kind: "unknown",
        confidence: 0,
        box: { x: 0, y: 0, width: frame.width, height: frame.height },
        label: "model-not-connected",
        sourceComputerId: frame.sourceComputerId,
        observedAt: new Date().toISOString()
      }
    ];
  }
}
