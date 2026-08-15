import { randomUUID } from "node:crypto";
import type { BotCharacter, BotClientSpellBinding, BotSkill } from "../core/bot-configuration.js";
import type { InputCommand } from "../core/input-command.js";
import { planSpellCast } from "../execution/spell-command-planner.js";
import type { GameState } from "./game-state.js";
import type { ActionProposal, ValidatedAction } from "./rule-engine.js";

export type RuleMode = "observe" | "suggest" | "execute";

export interface ActionValidatorContext {
  readonly character: BotCharacter | null;
  readonly skills: readonly BotSkill[];
  readonly bindings: readonly BotClientSpellBinding[];
  readonly targetComputerId: string;
  readonly gameFocused: boolean;
}

export interface ActionValidatorOptions {
  readonly defaultMode: RuleMode;
  /** Per rule source, so execution can be turned on one rule at a time. */
  readonly modes: Readonly<Record<string, RuleMode>>;
  readonly maxCommandsPerMinute: number;
  readonly maxReadingAgeMs: number;
  readonly minimumConfidence: number;
}

export const DEFAULT_VALIDATOR_OPTIONS: ActionValidatorOptions = {
  defaultMode: "observe",
  modes: {},
  maxCommandsPerMinute: 60,
  maxReadingAgeMs: 2_000,
  minimumConfidence: 0.5
};

/**
 * Last line of defence: even a wrong rule must not produce a dangerous command.
 * Spell eligibility itself is delegated to the existing spell planner.
 */
export class ActionValidator {
  private readonly cooldownUntil = new Map<number, number>();
  private sentAt: number[] = [];

  constructor(
    private readonly context: ActionValidatorContext,
    private readonly options: ActionValidatorOptions = DEFAULT_VALIDATOR_OPTIONS
  ) {}

  validate(proposal: ActionProposal, state: GameState, now = Date.now()): ValidatedAction {
    const mode = this.options.modes[proposal.source] ?? this.options.defaultMode;
    const action = proposal.action;
    if (action.kind === "hold") return { allowed: true, reason: "Nenhum comando: a regra pediu para aguardar.", commands: [] };
    if (state.ageMs > this.options.maxReadingAgeMs) {
      return denied(`Percepção com ${Math.round(state.ageMs)} ms é antiga demais para agir.`);
    }
    if (action.kind === "flee" || action.kind === "return") {
      // ponytail: fleeing and going back to town only stop the bot; add the
      // commands once the route layer knows where the exit and the depot are.
      const what = action.kind === "flee" ? "Fuga" : `Retorno por ${action.motive}`;
      return { allowed: true, reason: `${what} registrado; o bot ainda não envia comandos de deslocamento.`, commands: [] };
    }
    if (usesPerceivedEntity(proposal) && state.confidence !== null && state.confidence < this.options.minimumConfidence) {
      return denied(`Confiança da percepção ${state.confidence.toFixed(2)} abaixo de ${this.options.minimumConfidence}.`);
    }
    if (mode !== "observe" && this.commandsInLastMinute(now) >= this.options.maxCommandsPerMinute) {
      return denied(`Limite de ${this.options.maxCommandsPerMinute} comandos por minuto atingido.`);
    }

    // Observe still runs the full validation: the log has to show what would
    // really have been sent, not what the rule wished for.
    const result = action.kind === "attack" ? this.validateAttack(action.entityId, state)
      : action.kind === "loot" ? this.validateLoot(action.entityId, state)
      : this.validateCast(action.skillId, state, now);
    if (mode !== "observe" || !result.allowed) return result;
    return { allowed: true, reason: `${result.reason} Modo observe: nada foi enviado.`, commands: [] };
  }

  /** Called by the caller once the accepted action really produced commands. */
  commit(proposal: ActionProposal, commands: readonly InputCommand[], now = Date.now()): void {
    if (commands.length === 0) return;
    if (proposal.action.kind === "cast") {
      const skill = this.context.skills.find((candidate) => candidate.id === (proposal.action as { skillId: number }).skillId);
      if (skill) this.cooldownUntil.set(skill.id, now + skill.cooldownMs);
    }
    for (let index = 0; index < commands.length; index += 1) this.sentAt.push(now);
  }

  private validateAttack(entityId: string, state: GameState): ValidatedAction {
    const creature = state.creatures.find((candidate) => candidate.entityId === entityId);
    if (!creature) return denied("O alvo proposto não está mais na percepção atual.");
    if (creature.entity.kind !== "creature") return denied("O alvo proposto não é uma criatura.");
    return {
      allowed: true,
      reason: `Ataque liberado contra ${creature.species ?? "criatura"} a ${Math.round(creature.distance)} px do centro.`,
      commands: [this.clickCommand(creature.entity.box, "left", entityId)]
    };
  }

  private validateLoot(entityId: string, state: GameState): ValidatedAction {
    const item = state.items.find((candidate) => candidate.entityId === entityId);
    if (!item) return denied("O item proposto não está mais na percepção atual.");
    if (state.creatureCount > 0) return denied("Ainda há criatura na tela; coletar agora é inseguro.");
    return {
      allowed: true,
      reason: `Coleta liberada de ${item.name ?? "item"} a ${Math.round(item.distance)} px do centro.`,
      commands: [this.clickCommand(item.entity.box, "right", entityId)]
    };
  }

  private clickCommand(box: { x: number; y: number; width: number; height: number }, button: "left" | "right", entityId: string): InputCommand {
    return {
      id: randomUUID(),
      type: "mouse-click",
      createdAt: new Date().toISOString(),
      targetComputerId: this.context.targetComputerId,
      // ponytail: frame coordinates, not screen coordinates. The executor has to
      // map them through the OBS capture rect before execute mode is safe.
      payload: {
        button,
        frameX: Math.round(box.x + box.width / 2),
        frameY: Math.round(box.y + box.height / 2),
        entityId
      }
    };
  }

  private validateCast(skillId: number, state: GameState, now: number): ValidatedAction {
    const { character, skills, bindings } = this.context;
    if (!character) return denied("Nenhum personagem ativo foi configurado para esta máquina.");
    const skill = skills.find((candidate) => candidate.id === skillId);
    if (!skill) return denied(`A magia ${skillId} não está cadastrada.`);
    const binding = bindings.find((candidate) => candidate.skillId === skillId && candidate.characterId === character.id && candidate.enabled);
    if (!binding) return denied(`${skill.name} não tem hotkey configurada para ${character.name}.`);
    const remaining = (this.cooldownUntil.get(skillId) ?? 0) - now;
    if (remaining > 0) return denied(`${skill.name} ainda está em cooldown por ${Math.ceil(remaining)} ms.`);

    const plan = planSpellCast({
      character,
      skill,
      binding,
      targetComputerId: this.context.targetComputerId,
      currentMana: state.mana?.current ?? 0,
      gameFocused: this.context.gameFocused,
      hasCurrentTarget: state.target !== null
    });
    return { allowed: plan.allowed, reason: plan.reason, commands: plan.command ? [plan.command] : [] };
  }

  private commandsInLastMinute(now: number): number {
    this.sentAt = this.sentAt.filter((timestamp) => now - timestamp < 60_000);
    return this.sentAt.length;
  }
}

function usesPerceivedEntity(proposal: ActionProposal): boolean {
  const action = proposal.action;
  return action.kind === "attack" || action.kind === "loot" || (action.kind === "cast" && action.entityId !== undefined);
}

function denied(reason: string): ValidatedAction {
  return { allowed: false, reason, commands: [] };
}
