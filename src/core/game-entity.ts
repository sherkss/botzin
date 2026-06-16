export type GameEntityKind =
  | "player"
  | "creature"
  | "npc"
  | "player-summon"
  | "unknown";

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GameEntity {
  readonly id: string;
  readonly kind: GameEntityKind;
  readonly confidence: number;
  readonly box: BoundingBox;
  readonly label?: string;
  readonly sourceComputerId: string;
  readonly observedAt: string;
}
