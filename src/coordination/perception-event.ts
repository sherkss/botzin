import type { GameEntity } from "../core/game-entity.js";

export interface PerceptionEvent {
  readonly id: string;
  readonly sourceComputerId: string;
  readonly receivedAt: string;
  readonly capturedAt: string;
  readonly frame: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
  };
  readonly entities: readonly GameEntity[];
}
