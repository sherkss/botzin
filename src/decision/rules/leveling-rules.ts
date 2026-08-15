import type { BotHunt, BotHuntTelemetry } from "../../core/bot-configuration.js";
import { PRIORITY, propose, type DecisionRule } from "../rule-engine.js";

export interface LevelingPolicy {
  readonly minimumXpPerHour: number | null;
  readonly minimumProfit: number | null;
  /** Leave when the character level is below the level the hunt was planned for. */
  readonly requireHuntLevel: boolean;
}

export const DEFAULT_LEVELING_POLICY: LevelingPolicy = {
  minimumXpPerHour: null,
  minimumProfit: null,
  requireHuntLevel: true
};

/**
 * Hunt selection stays manual, as the plan asks: these rules only judge the hunt
 * that is already running, using the telemetry already collected for it.
 */
export function createLevelingRules(
  telemetry: readonly BotHuntTelemetry[],
  policy: LevelingPolicy = DEFAULT_LEVELING_POLICY
): readonly DecisionRule[] {
  const priority = PRIORITY.loot + 50;
  return [{
    id: "leave-hunt",
    priority,
    evaluate: (state) => {
      const reason = leaveReason(state.hunt, state.character?.level ?? null, latestFor(telemetry, state.hunt), policy);
      return reason ? propose("leave-hunt", priority, { kind: "return", motive: "efficiency" }, reason, state) : null;
    }
  }];
}

/** Most recent telemetry sample of the running hunt; older samples describe another loadout. */
export function latestFor(telemetry: readonly BotHuntTelemetry[], hunt: BotHunt | null): BotHuntTelemetry | null {
  if (!hunt) return null;
  return [...telemetry]
    .filter((sample) => sample.huntId === hunt.id)
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0] ?? null;
}

function leaveReason(
  hunt: BotHunt | null,
  level: number | null,
  sample: BotHuntTelemetry | null,
  policy: LevelingPolicy
): string | null {
  if (policy.requireHuntLevel && hunt?.minLevel !== null && hunt?.minLevel !== undefined && level !== null && level < hunt.minLevel) {
    return `Level ${level} abaixo do mínimo ${hunt.minLevel} da hunt ${hunt.name}.`;
  }
  if (!sample) return null;
  if (policy.minimumXpPerHour !== null && sample.xpPerHour !== null && sample.xpPerHour < policy.minimumXpPerHour) {
    return `XP por hora ${Math.round(sample.xpPerHour)} abaixo do mínimo ${policy.minimumXpPerHour}.`;
  }
  if (policy.minimumProfit !== null && sample.profit !== null && sample.profit < policy.minimumProfit) {
    return `Lucro ${Math.round(sample.profit)} abaixo do mínimo ${policy.minimumProfit}.`;
  }
  return null;
}
