import type { BotHuntSkillRule, BotSkill } from "../../core/bot-configuration.js";
import { damageModifier, elementOfSpell, findCreature } from "../creature-knowledge.js";
import type { GameState } from "../game-state.js";
import { PRIORITY, propose, type DecisionRule } from "../rule-engine.js";

export interface CombatOptions {
  readonly huntId: number | null;
  readonly maxCreatures: number;
}

export const DEFAULT_COMBAT_OPTIONS: CombatOptions = { huntId: null, maxCreatures: 6 };

/**
 * The hunt skill rules already stored in the database are the per-vocation rules:
 * each row binds a spell to a HP, mana and creature-count window, and the
 * vocation itself is validated later by the spell planner.
 */
export function createCombatRules(
  skills: readonly BotSkill[],
  huntSkillRules: readonly BotHuntSkillRule[],
  options: CombatOptions = DEFAULT_COMBAT_OPTIONS
): readonly DecisionRule[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const spellRules = huntSkillRules
    .filter((rule) => rule.enabled && (options.huntId === null || rule.huntId === options.huntId))
    .flatMap<DecisionRule>((rule) => {
      const skill = skillById.get(rule.skillId);
      if (!skill || !skill.enabled) return [];
      const element = elementOfSpell(skill.spellWords ?? skill.name);
      const priority = combatPriority(rule.priority);
      return [{
        id: `hunt-skill-${rule.id}`,
        priority,
        evaluate: (state) => {
          if (!matches(rule, skill, state)) return null;
          const modifier = damageModifier(findCreature(state.target?.species ?? null), element);
          // Casting an element the target absorbs is pure mana loss.
          if (skill.category === "attack" && modifier === 0) return null;
          const bonus = skill.category === "attack" && modifier > 100 ? 20 : 0;
          return propose(
            `hunt-skill-${skill.name}`,
            Math.min(priority + bonus, PRIORITY.combat + 99),
            { kind: "cast", skillId: skill.id, entityId: state.target?.entityId },
            `${describe(rule, skill.name, state)}${bonus > 0 ? ` ${state.target?.species} é fraco contra ${element}.` : ""}`,
            state
          );
        }
      }];
    });

  return [
    {
      id: "unsafe-creature",
      priority: PRIORITY.survival + 30,
      evaluate: (state) => {
        const dangerous = state.dangerousCreatures[0];
        return dangerous
          ? propose("unsafe-creature", PRIORITY.survival + 30, { kind: "flee" }, `${dangerous.species ?? "Criatura"} está marcada como perigosa${dangerous.threat !== null ? ` (dano máximo ${dangerous.threat})` : ""}.`, state)
          : null;
      }
    },
    {
      id: "too-many-creatures",
      priority: PRIORITY.survival + 20,
      evaluate: (state) => state.creatureCount > options.maxCreatures
        ? propose("too-many-creatures", PRIORITY.survival + 20, { kind: "flee" }, `${state.creatureCount} criaturas na tela, acima do limite ${options.maxCreatures}.`, state)
        : null
    },
    ...spellRules,
    {
      id: "attack-target",
      priority: PRIORITY.combat - 100,
      evaluate: (state) => state.target
        ? propose("attack-target", PRIORITY.combat - 100, { kind: "attack", entityId: state.target.entityId }, `Alvo mais próximo: ${state.target.species ?? "criatura"} com confiança ${state.target.confidence.toFixed(2)}.`, state)
        : null
    }
  ];
}

/** Lower `priority` in the table means evaluated first, so it maps to a higher band value. */
function combatPriority(rulePriority: number): number {
  return PRIORITY.combat + Math.max(-99, Math.min(99, 100 - rulePriority));
}

function matches(rule: BotHuntSkillRule, skill: BotSkill, state: GameState): boolean {
  // An attack rule without a creature window would otherwise fire on an empty
  // screen, which is both wasted mana and an obvious bot signature.
  if (skill.category === "attack" && state.creatureCount === 0) return false;
  return withinPercent(state.health?.percent ?? null, rule.minHpPercent, rule.maxHpPercent)
    && withinPercent(state.mana?.percent ?? null, rule.minManaPercent, rule.maxManaPercent)
    && withinCount(state.creatureCount, rule.minCreatures, rule.maxCreatures);
}

function withinPercent(value: number | null, minimum: number | null, maximum: number | null): boolean {
  if (minimum === null && maximum === null) return true;
  // A rule that depends on HP or mana can never fire while the screen reader
  // cannot see them; guessing here is how a bot burns mana at full health.
  if (value === null) return false;
  return value >= (minimum ?? 0) && value <= (maximum ?? 100);
}

function withinCount(value: number, minimum: number | null, maximum: number | null): boolean {
  return value >= (minimum ?? 0) && value <= (maximum ?? Number.POSITIVE_INFINITY);
}

function describe(rule: BotHuntSkillRule, skillName: string, state: GameState): string {
  const conditions = [
    rule.minHpPercent !== null || rule.maxHpPercent !== null ? `HP ${Math.round(state.health?.percent ?? 0)}%` : null,
    rule.minManaPercent !== null || rule.maxManaPercent !== null ? `mana ${Math.round(state.mana?.percent ?? 0)}%` : null,
    rule.minCreatures !== null || rule.maxCreatures !== null ? `${state.creatureCount} criaturas` : null
  ].filter((entry): entry is string => entry !== null);
  return `${skillName} dentro da regra ${rule.id}${conditions.length > 0 ? ` (${conditions.join(", ")})` : ""}.`;
}
