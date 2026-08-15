import type { PerceptionEvent } from "../coordination/perception-event.js";
import type { BotCharacter, BotHunt } from "../core/bot-configuration.js";
import type { GameEntity } from "../core/game-entity.js";
import { normalizeCreatureName } from "../learning/tibia-game-catalog.js";
import { findCreature, threatOf } from "./creature-knowledge.js";
import type { CharacterOperationObservation } from "./hunt-operation-policy.js";

export interface VitalReading {
  readonly current: number;
  readonly max: number;
  readonly percent: number;
}

export interface TrackedCreature {
  readonly entityId: string;
  readonly species: string | null;
  readonly confidence: number;
  /** Pixel distance from the frame centre, where the played character stands. */
  readonly distance: number;
  /** Worst case damage from the catalog; null when the species is unknown. */
  readonly threat: number | null;
  readonly weaknesses: readonly string[];
  readonly identified: boolean;
  readonly allowed: boolean;
  readonly dangerous: boolean;
  readonly entity: GameEntity;
}

export interface TargetingPolicy {
  readonly minimumConfidence: number;
  /** When not empty, only these species may be attacked. */
  readonly allowSpecies: readonly string[];
  readonly ignoreSpecies: readonly string[];
  /** Species that must always trigger an escape. */
  readonly dangerousSpecies: readonly string[];
  /** Catalog max damage above which a creature counts as dangerous. */
  readonly maxThreat: number | null;
  readonly requireKnownSpecies: boolean;
}

export const DEFAULT_TARGETING_POLICY: TargetingPolicy = {
  minimumConfidence: 0.5,
  allowSpecies: [],
  ignoreSpecies: [],
  dangerousSpecies: [],
  maxThreat: null,
  // The detector alone reports every creature as "creature": demanding a species
  // would leave the bot idle until the classifier model is installed.
  requireKnownSpecies: false
};

export interface GameState {
  readonly observedAt: string;
  readonly capturedAt: string;
  /** Milliseconds between the capture and the moment the state was built. */
  readonly ageMs: number;
  readonly confidence: number | null;
  readonly character: BotCharacter | null;
  readonly hunt: BotHunt | null;
  readonly health: VitalReading | null;
  readonly mana: VitalReading | null;
  readonly creatures: readonly TrackedCreature[];
  readonly creatureCount: number;
  readonly unidentifiedCreatures: number;
  readonly dangerousCreatures: readonly TrackedCreature[];
  readonly target: TrackedCreature | null;
  readonly items: readonly TrackedItem[];
  readonly otherEntityCounts: Readonly<Record<"player" | "npc" | "player-summon", number>>;
  readonly supplies: Readonly<Record<string, number>>;
  readonly staminaMinutes: number | null;
  readonly capacity: number | null;
  readonly inCombat: boolean;
}

export interface TrackedItem {
  readonly entityId: string;
  readonly name: string | null;
  readonly confidence: number;
  readonly distance: number;
  readonly entity: GameEntity;
}

export interface GameStateInput {
  readonly event: PerceptionEvent;
  readonly character?: BotCharacter | null;
  readonly hunt?: BotHunt | null;
  readonly observation?: CharacterOperationObservation | null;
  readonly targeting?: TargetingPolicy;
  readonly now?: number;
}

export function buildGameState(input: GameStateInput): GameState {
  const { event } = input;
  const now = input.now ?? Date.now();
  const targeting = input.targeting ?? DEFAULT_TARGETING_POLICY;
  const centreX = event.frame.width / 2;
  const centreY = event.frame.height / 2;

  const creatures = event.entities
    .filter((entity) => entity.kind === "creature")
    .map((entity) => trackCreature(entity, centreX, centreY, targeting))
    .sort((left, right) => left.distance - right.distance);

  // Only creatures the detector is confident about may become a target: an
  // uncertain box can be a player, an NPC or a summon, and attacking those is
  // exactly what the plan forbids.
  const identified = creatures.filter((creature) => creature.confidence >= targeting.minimumConfidence);
  const items = event.entities
    .filter((entity) => entity.kind === "item")
    .map((entity) => ({
      entityId: entity.id,
      name: entity.label && entity.label !== "item" ? entity.label : null,
      confidence: entity.confidence,
      distance: distanceFromCentre(entity, centreX, centreY),
      entity
    }))
    .sort((left, right) => left.distance - right.distance);

  return {
    observedAt: new Date(now).toISOString(),
    capturedAt: event.capturedAt,
    ageMs: Math.max(0, now - Date.parse(event.capturedAt)),
    confidence: averageConfidence(event.entities),
    character: input.character ?? null,
    hunt: input.hunt ?? null,
    health: vitalReading(input.observation?.health),
    mana: vitalReading(input.observation?.mana),
    creatures,
    creatureCount: creatures.length,
    unidentifiedCreatures: creatures.filter((creature) => !creature.identified).length,
    dangerousCreatures: creatures.filter((creature) => creature.dangerous),
    // Closest creature that the hunt allows and that is not flagged dangerous.
    target: identified.find((creature) => creature.allowed && !creature.dangerous) ?? null,
    items,
    otherEntityCounts: {
      player: countKind(event.entities, "player"),
      npc: countKind(event.entities, "npc"),
      "player-summon": countKind(event.entities, "player-summon")
    },
    supplies: input.observation?.supplies ?? {},
    staminaMinutes: input.observation?.staminaMinutes ?? null,
    capacity: input.observation?.capacity ?? null,
    inCombat: creatures.length > 0
  };
}

function trackCreature(entity: GameEntity, centreX: number, centreY: number, targeting: TargetingPolicy): TrackedCreature {
  const species = entity.label && entity.label !== "creature" ? entity.label : null;
  const knowledge = findCreature(species);
  const threat = threatOf(knowledge);
  const identified = knowledge !== null;
  const listed = (list: readonly string[]) => list.some((name) => sameSpecies(name, species));
  const allowed = (!targeting.requireKnownSpecies || identified)
    && !listed(targeting.ignoreSpecies)
    && (targeting.allowSpecies.length === 0 || listed(targeting.allowSpecies));
  return {
    entityId: entity.id,
    species,
    confidence: entity.confidence,
    distance: distanceFromCentre(entity, centreX, centreY),
    threat,
    weaknesses: knowledge?.weakness ?? [],
    identified,
    allowed,
    dangerous: listed(targeting.dangerousSpecies) || (targeting.maxThreat !== null && threat !== null && threat > targeting.maxThreat),
    entity
  };
}

function distanceFromCentre(entity: GameEntity, centreX: number, centreY: number): number {
  // ponytail: pixel distance from the frame centre stands in for SQM distance;
  // swap for a tile grid once the minimap/tile mapping exists.
  return Math.hypot(entity.box.x + entity.box.width / 2 - centreX, entity.box.y + entity.box.height / 2 - centreY);
}

function sameSpecies(left: string, right: string | null): boolean {
  return right !== null && normalizeCreatureName(left) === normalizeCreatureName(right);
}

function vitalReading(value: { readonly current: number; readonly max: number } | null | undefined): VitalReading | null {
  if (!value || !Number.isFinite(value.current) || !Number.isFinite(value.max) || value.max <= 0) return null;
  const current = Math.max(0, Math.min(value.current, value.max));
  return { current, max: value.max, percent: (current / value.max) * 100 };
}

function averageConfidence(entities: readonly GameEntity[]): number | null {
  if (entities.length === 0) return null;
  return entities.reduce((sum, entity) => sum + entity.confidence, 0) / entities.length;
}

function countKind(entities: readonly GameEntity[], kind: GameEntity["kind"]): number {
  return entities.filter((entity) => entity.kind === kind).length;
}
