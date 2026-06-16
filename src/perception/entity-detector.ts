import type { GameEntity } from "../core/game-entity.js";
import type { ScreenFrame } from "../core/frame.js";

export interface EntityDetector {
  readonly name: string;
  detect(frame: ScreenFrame): Promise<readonly GameEntity[]>;
}
