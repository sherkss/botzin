export const GAME_ENTITY_KINDS = [
  "player",
  "creature",
  "npc",
  "player-summon",
  "item",
  "effect",
  "missile",
  "unknown"
] as const;

export type GameEntityKind = (typeof GAME_ENTITY_KINDS)[number];

export function isGameEntityKind(value: unknown): value is GameEntityKind {
  return typeof value === "string" && (GAME_ENTITY_KINDS as readonly string[]).includes(value);
}

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
