import { describe, expect, it } from "vitest";
import { planMultiActionPress, planSpellCast } from "../../src/execution/spell-command-planner.js";
import type { BotCharacter, BotClientSpellBinding, BotSkill } from "../../src/core/bot-configuration.js";

const character: BotCharacter = { id: 1, accountId: 1, name: "Tank", world: "Antica", vocation: "Elite Knight", level: 300, enabled: true };
const skill: BotSkill = { id: 2, name: "Berserk", spellWords: "exori", hotkey: null, category: "attack", manaCost: 115, requiredLevel: 35, allowedVocations: ["knight"], cooldownMs: 2000, notes: null, enabled: true };
const binding: BotClientSpellBinding = { id: 3, characterId: 1, skillId: 2, hotkey: "F1", multiActionSlot: 1, castMode: "hotkey", targetMode: "current-target", requireGameFocus: true, lastVerifiedAt: null, notes: null, enabled: true };

describe("spell command planner", () => {
  it("uses the character-specific hotkey after safety validation", () => {
    const plan = planSpellCast({ character, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true });
    expect(plan.allowed).toBe(true);
    expect(plan.command).toMatchObject({ type: "keyboard-press", payload: { key: "F1", skillId: 2 } });
  });

  it("blocks casts without mana, focus, target, level or vocation", () => {
    expect(planSpellCast({ character, skill, binding, targetComputerId: "pc-1", currentMana: 10, gameFocused: true, hasCurrentTarget: true }).allowed).toBe(false);
    expect(planSpellCast({ character, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: false, hasCurrentTarget: true }).allowed).toBe(false);
    expect(planSpellCast({ character, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: false }).allowed).toBe(false);
    expect(planSpellCast({ character: { ...character, level: 10 }, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true }).allowed).toBe(false);
    expect(planSpellCast({ character: { ...character, vocation: "Royal Paladin" }, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true }).allowed).toBe(false);
  });

  it("can type spell words when the client profile explicitly requests it", () => {
    const plan = planSpellCast({ character, skill, binding: { ...binding, castMode: "spell-words" }, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true });
    expect(plan.command).toMatchObject({ type: "keyboard-type", payload: { text: "exori", submit: true } });
  });

  it("predicts the first available Multi-Action slot and always releases the key", () => {
    const secondSkill = { ...skill, id: 4, name: "Groundshaker", spellWords: "exori mas" };
    const plan = planMultiActionPress([
      { character, skill, binding, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true, cooldownRemainingMs: 800 },
      { character, skill: secondSkill, binding: { ...binding, id: 5, skillId: 4, multiActionSlot: 2 }, targetComputerId: "pc-1", currentMana: 500, gameFocused: true, hasCurrentTarget: true, cooldownRemainingMs: 0 }
    ]);
    expect(plan).toMatchObject({ allowed: true, predictedSkillId: 4, predictedSlot: 2 });
    expect(plan.commands.map((command) => command.type)).toEqual(["keyboard-press", "keyboard-release"]);
  });
});
