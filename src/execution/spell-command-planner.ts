import { randomUUID } from "node:crypto";
import type { BotCharacter, BotClientSpellBinding, BotSkill } from "../core/bot-configuration.js";
import type { InputCommand } from "../core/input-command.js";

export interface SpellCastContext {
  readonly character: BotCharacter;
  readonly skill: BotSkill;
  readonly binding: BotClientSpellBinding;
  readonly targetComputerId: string;
  readonly currentMana: number;
  readonly gameFocused: boolean;
  readonly hasCurrentTarget?: boolean;
}

export interface SpellCastPlan {
  readonly allowed: boolean;
  readonly reason: string;
  readonly command: InputCommand | null;
}

export interface MultiActionCandidate extends SpellCastContext {
  readonly cooldownRemainingMs: number;
  readonly learned?: boolean;
}

export interface MultiActionPressPlan {
  readonly allowed: boolean;
  readonly reason: string;
  readonly predictedSkillId: number | null;
  readonly predictedSlot: 1 | 2 | 3 | null;
  readonly commands: readonly InputCommand[];
}

export function planSpellCast(context: SpellCastContext): SpellCastPlan {
  const { character, skill, binding } = context;
  if (!character.enabled || !skill.enabled || !binding.enabled) return denied("Personagem, magia ou vínculo está desabilitado.");
  if (binding.characterId !== character.id || binding.skillId !== skill.id) return denied("A hotkey não pertence a este personagem e magia.");
  if (binding.requireGameFocus && !context.gameFocused) return denied("O cliente do Tibia não está com foco confirmado.");
  if ((character.level ?? 0) < skill.requiredLevel) return denied(`Level ${skill.requiredLevel} é necessário para ${skill.name}.`);
  if (!vocationCanUse(character.vocation, skill.allowedVocations)) return denied(`A vocação ${character.vocation ?? "desconhecida"} não pode usar ${skill.name}.`);
  if (context.currentMana < (skill.manaCost ?? 0)) return denied(`Mana insuficiente para ${skill.name}.`);
  if (binding.targetMode === "current-target" && skill.category === "attack" && !context.hasCurrentTarget) {
    return denied("Nenhum alvo atual foi confirmado.");
  }

  const base = { id: randomUUID(), createdAt: new Date().toISOString(), targetComputerId: context.targetComputerId };
  if (binding.castMode === "spell-words") {
    if (!skill.spellWords) return denied(`As palavras de ${skill.name} não estão cadastradas.`);
    return {
      allowed: true,
      reason: `${skill.name} liberada por palavras, com mana, level, vocação e foco validados.`,
      command: { ...base, type: "keyboard-type", payload: { text: skill.spellWords, submit: true, skillId: skill.id } }
    };
  }
  return {
    allowed: true,
    reason: `${skill.name} liberada pela hotkey ${binding.hotkey}, com mana, level, vocação e foco validados.`,
    command: { ...base, type: "keyboard-press", payload: { key: binding.hotkey, skillId: skill.id } }
  };
}

export function planMultiActionPress(candidates: readonly MultiActionCandidate[]): MultiActionPressPlan {
  if (candidates.length === 0) return deniedMulti("Nenhum slot Multi-Action foi configurado.");
  const ordered = [...candidates].sort((left, right) => left.binding.multiActionSlot - right.binding.multiActionSlot);
  const first = ordered[0]!;
  if (ordered.some((candidate) => candidate.binding.characterId !== first.binding.characterId || candidate.binding.hotkey !== first.binding.hotkey)) {
    return deniedMulti("Os slots precisam pertencer ao mesmo personagem e hotkey.");
  }

  for (const candidate of ordered) {
    if (candidate.learned === false || candidate.cooldownRemainingMs > 0) continue;
    const eligibility = planSpellCast({ ...candidate, binding: { ...candidate.binding, castMode: "hotkey" } });
    if (!eligibility.allowed) continue;
    const payload = {
      key: candidate.binding.hotkey,
      multiAction: true,
      predictedSkillId: candidate.skill.id,
      predictedSlot: candidate.binding.multiActionSlot
    };
    const createdAt = new Date().toISOString();
    return {
      allowed: true,
      reason: `Multi-Action prevê ${candidate.skill.name} no slot ${candidate.binding.multiActionSlot}; a tecla será solta após o pressionamento.`,
      predictedSkillId: candidate.skill.id,
      predictedSlot: candidate.binding.multiActionSlot,
      commands: [
        { id: randomUUID(), type: "keyboard-press", createdAt, targetComputerId: candidate.targetComputerId, payload },
        { id: randomUUID(), type: "keyboard-release", createdAt, targetComputerId: candidate.targetComputerId, payload }
      ]
    };
  }
  return deniedMulti("Todos os slots estão em cooldown, não aprendidos ou bloqueados pelas regras de segurança.");
}

function denied(reason: string): SpellCastPlan {
  return { allowed: false, reason, command: null };
}

function deniedMulti(reason: string): MultiActionPressPlan {
  return { allowed: false, reason, predictedSkillId: null, predictedSlot: null, commands: [] };
}

function vocationCanUse(vocation: string | null, allowed: readonly string[]): boolean {
  const current = baseVocation(vocation ?? "");
  return current !== null && allowed.some((candidate) => baseVocation(candidate) === current);
}

function baseVocation(value: string): "knight" | "druid" | "sorcerer" | "paladin" | "monk" | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("knight") || normalized === "ek") return "knight";
  if (normalized.includes("druid") || normalized === "ed") return "druid";
  if (normalized.includes("sorcerer") || normalized === "ms") return "sorcerer";
  if (normalized.includes("paladin") || normalized === "rp") return "paladin";
  if (normalized.includes("monk") || normalized === "em") return "monk";
  return null;
}
