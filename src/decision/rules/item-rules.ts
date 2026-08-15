import { evaluateHuntOperation, type HuntOperationPolicy } from "../hunt-operation-policy.js";
import type { GameState } from "../game-state.js";
import { PRIORITY, propose, type DecisionRule } from "../rule-engine.js";

export interface LootPolicy {
  readonly enabled: boolean;
  /** When not empty, only these item names may be collected. */
  readonly allowItems: readonly string[];
  readonly ignoreItems: readonly string[];
  /** Pixel radius around the character; items further away are left behind. */
  readonly maxDistance: number;
  /** Never loot while a creature is on screen. */
  readonly onlyWhenSafe: boolean;
}

export const DEFAULT_LOOT_POLICY: LootPolicy = {
  enabled: true,
  allowItems: [],
  ignoreItems: [],
  maxDistance: 200,
  onlyWhenSafe: true
};

/**
 * Stamina, capacity and supply thresholds are already evaluated by the hunt
 * operation policy; these rules only turn its verdict into proposals.
 */
export function createItemRules(
  operation: HuntOperationPolicy,
  loot: LootPolicy = DEFAULT_LOOT_POLICY
): readonly DecisionRule[] {
  return [
    {
      id: "stop-stamina",
      priority: PRIORITY.emergency - 50,
      evaluate: (state) => {
        const decision = evaluateOperation(operation, state);
        return decision.action === "stop-stamina"
          ? propose("stop-stamina", PRIORITY.emergency - 50, { kind: "return", motive: "stamina" }, decision.reasons.join(" "), state)
          : null;
      }
    },
    {
      id: "resupply",
      priority: PRIORITY.positioning,
      evaluate: (state) => {
        const decision = evaluateOperation(operation, state);
        return decision.action === "refill"
          ? propose("resupply", PRIORITY.positioning, { kind: "return", motive: "supplies" }, decision.reasons.join(" "), state)
          : null;
      }
    },
    {
      id: "loot",
      priority: PRIORITY.loot,
      evaluate: (state) => {
        if (!loot.enabled) return null;
        if (loot.onlyWhenSafe && state.creatureCount > 0) return null;
        const item = state.items.find((candidate) => candidate.distance <= loot.maxDistance && collectible(loot, candidate.name));
        return item
          ? propose("loot", PRIORITY.loot, { kind: "loot", entityId: item.entityId }, `${item.name ?? "Item"} a ${Math.round(item.distance)} px, sem criatura na tela.`, state)
          : null;
      }
    }
  ];
}

function evaluateOperation(policy: HuntOperationPolicy, state: GameState) {
  // The screen reader may still be blind to stamina and supplies; in that case
  // the operation policy answers "await-reading" and no proposal is created.
  const seen = state.staminaMinutes !== null || state.capacity !== null || Object.keys(state.supplies).length > 0;
  return evaluateHuntOperation(policy, seen ? { staminaMinutes: state.staminaMinutes, capacity: state.capacity, supplies: state.supplies } : null);
}

function collectible(policy: LootPolicy, name: string | null): boolean {
  // ponytail: the detector only reports "item"; names arrive when an item
  // classifier exists, and until then the lists can only filter what is named.
  if (name === null) return policy.allowItems.length === 0;
  const matches = (list: readonly string[]) => list.some((entry) => entry.trim().toLowerCase() === name.trim().toLowerCase());
  return !matches(policy.ignoreItems) && (policy.allowItems.length === 0 || matches(policy.allowItems));
}
