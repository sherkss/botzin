import { describe, expect, it } from "vitest";
import type { PerceptionEvent } from "../../src/coordination/perception-event.js";
import type { BotCharacter, BotClientSpellBinding, BotHuntSkillRule, BotSkill } from "../../src/core/bot-configuration.js";
import type { CharacterOperationObservation } from "../../src/decision/hunt-operation-policy.js";
import { DEFAULT_TARGETING_POLICY } from "../../src/decision/game-state.js";
import { policyFromRunSnapshot } from "../../src/decision/hunt-operation-policy.js";
import { decisionSettingsFrom, RuleEngineStrategy, type RuleEngineLoadout } from "../../src/decision/rule-engine-strategy.js";
import { DEFAULT_COMBAT_OPTIONS } from "../../src/decision/rules/combat-rules.js";
import { DEFAULT_LOOT_POLICY } from "../../src/decision/rules/item-rules.js";
import { DEFAULT_LEVELING_POLICY } from "../../src/decision/rules/leveling-rules.js";
import { DEFAULT_SURVIVAL_THRESHOLDS } from "../../src/decision/rules/survival-rules.js";

const character: BotCharacter = { id: 1, accountId: 1, name: "Testador", world: "Antica", vocation: "Elite Knight", level: 150, enabled: true };

function skill(overrides: Partial<BotSkill> & { id: number; name: string }): BotSkill {
  return {
    spellWords: null,
    hotkey: null,
    category: "healing",
    manaCost: null,
    requiredLevel: 1,
    allowedVocations: ["knight"],
    cooldownMs: 1_000,
    notes: null,
    enabled: true,
    ...overrides
  } as BotSkill;
}

function binding(skillId: number, hotkey: string, overrides: Partial<BotClientSpellBinding> = {}): BotClientSpellBinding {
  return {
    id: skillId,
    characterId: character.id,
    skillId,
    hotkey,
    multiActionSlot: 1,
    castMode: "hotkey",
    targetMode: "self",
    requireGameFocus: false,
    lastVerifiedAt: null,
    notes: null,
    enabled: true,
    ...overrides
  };
}

const healthPotion = skill({ id: 10, name: "Ultimate Health Potion", requiredLevel: 130 });
const smallHeal = skill({ id: 11, name: "Exura", requiredLevel: 8, manaCost: 20 });
const manaPotion = skill({ id: 12, name: "Ultimate Mana Potion", requiredLevel: 130, category: "utility" });
const exori = skill({ id: 13, name: "Exori", category: "attack", manaCost: 115, requiredLevel: 80, cooldownMs: 4_000 });
const highLevelSpell = skill({ id: 14, name: "Exori Gran", category: "attack", manaCost: 340, requiredLevel: 900 });
const druidSpell = skill({ id: 15, name: "Exevo Gran Mas Frigo", category: "attack", manaCost: 200, requiredLevel: 60, allowedVocations: ["druid"] });

function huntRule(overrides: Partial<BotHuntSkillRule> & { id: number; skillId: number }): BotHuntSkillRule {
  return {
    huntId: 1,
    priority: 100,
    minManaPercent: null,
    maxManaPercent: null,
    minHpPercent: null,
    maxHpPercent: null,
    minCreatures: null,
    maxCreatures: null,
    enabled: true,
    notes: null,
    ...overrides
  };
}

function loadout(overrides: Partial<RuleEngineLoadout> = {}): RuleEngineLoadout {
  return {
    character,
    hunt: null,
    skills: [healthPotion, smallHeal, manaPotion, exori, highLevelSpell, druidSpell],
    bindings: [binding(10, "F1"), binding(11, "F2"), binding(12, "F3"), binding(13, "F4", { targetMode: "crosshair" }), binding(14, "F5", { targetMode: "crosshair" }), binding(15, "F6", { targetMode: "crosshair" })],
    huntSkillRules: [],
    telemetry: [],
    survival: DEFAULT_SURVIVAL_THRESHOLDS,
    combat: DEFAULT_COMBAT_OPTIONS,
    targeting: DEFAULT_TARGETING_POLICY,
    operation: policyFromRunSnapshot(null),
    loot: DEFAULT_LOOT_POLICY,
    leveling: DEFAULT_LEVELING_POLICY,
    ...overrides
  };
}

function perception(
  creatures: readonly { confidence: number; x?: number; species?: string }[],
  observation: CharacterOperationObservation | null,
  capturedAt = new Date().toISOString(),
  items: readonly { x?: number; name?: string }[] = []
): PerceptionEvent {
  return {
    id: "event-1",
    sourceComputerId: "pc-main",
    receivedAt: capturedAt,
    capturedAt,
    frame: { id: "frame-1", width: 800, height: 600 },
    entities: [
      ...creatures.map((creature, index) => ({
        id: `creature-${index}`,
        kind: "creature" as const,
        confidence: creature.confidence,
        box: { x: creature.x ?? 400 + index * 20, y: 300, width: 32, height: 32 },
        label: creature.species ?? "Rotworms",
        sourceComputerId: "pc-main",
        observedAt: capturedAt
      })),
      ...items.map((item, index) => ({
        id: `item-${index}`,
        kind: "item" as const,
        confidence: 0.9,
        box: { x: item.x ?? 420, y: 300, width: 16, height: 16 },
        label: item.name ?? "item",
        sourceComputerId: "pc-main",
        observedAt: capturedAt
      }))
    ],
    operationObservation: observation ?? undefined
  };
}

function vitals(
  healthPercent: number,
  manaPercent: number,
  supplies: Record<string, number> = {},
  maximumMana = 1_000
): CharacterOperationObservation {
  return {
    staminaMinutes: 2_400,
    capacity: 500,
    supplies,
    health: { current: healthPercent * 10, max: 1_000 },
    mana: { current: (manaPercent * maximumMana) / 100, max: maximumMana }
  };
}

async function run(event: PerceptionEvent, custom: Partial<RuleEngineLoadout> = {}, mode: "observe" | "execute" = "execute") {
  const strategy = new RuleEngineStrategy(loadout(custom), { targetComputerId: "pc-main", mode });
  const commands = await strategy.plan(event);
  const latest = strategy.lastDecision()!;
  return { commands, decision: latest.decision, state: latest.state, source: latest.decision.accepted?.source ?? null };
}

describe("rule engine first delivery", () => {
  it("heals in emergency with the strongest option even at full mana", async () => {
    const { source, commands } = await run(perception([{ confidence: 0.9 }], vitals(20, 100)));
    expect(source).toBe("emergency-heal");
    expect(commands[0]?.payload.key).toBe("F1");
  });

  it("prefers healing over mana when both are low", async () => {
    const { source } = await run(perception([], vitals(50, 10)));
    expect(source).toBe("heal");
  });

  it("escapes when no healing supply is left", async () => {
    const { source, commands } = await run(
      perception([{ confidence: 0.9 }], vitals(20, 100, { "ultimate health potion": 0 })),
      { skills: [healthPotion, manaPotion], bindings: [binding(10, "F1"), binding(12, "F3")] }
    );
    expect(source).toBe("escape");
    expect(commands).toHaveLength(0);
  });

  it("healing wins over attacking", async () => {
    const { source, decision } = await run(
      perception([{ confidence: 0.95 }], vitals(20, 100)),
      { huntSkillRules: [huntRule({ id: 1, skillId: 13 })] }
    );
    expect(source).toBe("emergency-heal");
    expect(decision.rejected.some((entry) => entry.proposal.source.includes("Exori"))).toBe(true);
  });

  it("does not target a creature the detector is unsure about", async () => {
    const { state, source } = await run(perception([{ confidence: 0.2 }], vitals(100, 100)));
    expect(state.target).toBeNull();
    expect(source).toBeNull();
  });

  it("escapes from a crowd above the configured limit", async () => {
    const crowd = Array.from({ length: 8 }, () => ({ confidence: 0.9 }));
    const { source } = await run(perception(crowd, vitals(100, 100)));
    expect(source).toBe("too-many-creatures");
  });

  it("holds and sends nothing when the reading is old", async () => {
    const stale = new Date(Date.now() - 10_000).toISOString();
    const { source, commands } = await run(perception([{ confidence: 0.9 }], vitals(10, 10), stale));
    expect(source).toBe("stale-reading");
    expect(commands).toHaveLength(0);
  });

  it("refuses a spell above the character level and one from another vocation", async () => {
    const { decision, source } = await run(
      perception([{ confidence: 0.95 }], vitals(100, 100)),
      { huntSkillRules: [huntRule({ id: 1, skillId: 14, priority: 10 }), huntRule({ id: 2, skillId: 15, priority: 20 })] }
    );
    expect(source).toBe("attack-target");
    expect(decision.rejected.map((entry) => entry.reason).join(" ")).toMatch(/Level 900|vocação/i);
  });

  it("refuses a spell without enough mana", async () => {
    const { decision, source } = await run(
      // 50% of a 200 mana pool: above the mana potion threshold, below Exori.
      perception([{ confidence: 0.95 }], vitals(100, 50, {}, 200)),
      { huntSkillRules: [huntRule({ id: 1, skillId: 13 })] }
    );
    expect(source).toBe("attack-target");
    expect(decision.rejected.some((entry) => /Mana insuficiente/.test(entry.reason))).toBe(true);
  });

  it("casts the hunt spell when the window matches and respects its cooldown", async () => {
    const strategy = new RuleEngineStrategy(
      loadout({ huntSkillRules: [huntRule({ id: 1, skillId: 13, minCreatures: 2 })] }),
      { targetComputerId: "pc-main", mode: "execute" }
    );
    const first = await strategy.plan(perception([{ confidence: 0.9 }, { confidence: 0.9 }], vitals(100, 100)));
    expect(first[0]?.payload.key).toBe("F4");
    const second = await strategy.plan(perception([{ confidence: 0.9 }, { confidence: 0.9 }], vitals(100, 100)));
    expect(strategy.lastDecision()!.decision.accepted?.source).toBe("attack-target");
    expect(second[0]?.type).toBe("mouse-click");
  });

  it("observe mode decides but never sends a command", async () => {
    const { source, commands } = await run(perception([{ confidence: 0.9 }], vitals(20, 100)), {}, "observe");
    expect(source).toBe("emergency-heal");
    expect(commands).toHaveLength(0);
  });
});

const fireSpell = skill({ id: 20, name: "Exori Flam", spellWords: "exori flam", category: "attack", manaCost: 20, requiredLevel: 12 });
const deathSpell = skill({ id: 21, name: "Exori Mort", spellWords: "exori mort", category: "attack", manaCost: 20, requiredLevel: 12 });
const iceSpell = skill({ id: 22, name: "Exori Frigo", spellWords: "exori frigo", category: "attack", manaCost: 20, requiredLevel: 12 });
const hunt = { id: 1, name: "Rotworms", city: "Venore", routeProfile: null, minLevel: 20, notes: null, enabled: true };

function telemetrySample(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    characterId: character.id,
    huntId: hunt.id,
    assignmentId: null,
    runId: null,
    capturedAt: new Date().toISOString(),
    durationSeconds: 3_600,
    xpRatePercent: 100,
    xpGain: 100_000,
    rawXpGain: 100_000,
    xpPerHour: 100_000,
    rawXpPerHour: 100_000,
    lootValue: 100_000,
    suppliesValue: 50_000,
    profit: 50_000,
    creaturesJson: null,
    rawText: null,
    source: "telemetry" as const,
    ...overrides
  };
}

describe("creature knowledge, items and leveling rules", () => {
  it("escapes from a species marked as dangerous", async () => {
    const { source } = await run(
      perception([{ confidence: 0.9, species: "Rotworms" }], vitals(100, 100)),
      { targeting: { ...DEFAULT_TARGETING_POLICY, dangerousSpecies: ["Rotworms"] } }
    );
    expect(source).toBe("unsafe-creature");
  });

  it("ignores a creature outside the hunt list", async () => {
    const { state, source } = await run(
      perception([{ confidence: 0.9, species: "Rotworms" }], vitals(100, 100)),
      { targeting: { ...DEFAULT_TARGETING_POLICY, allowSpecies: ["Dragons"] } }
    );
    expect(state.target).toBeNull();
    expect(source).toBeNull();
  });

  it("prefers the element the creature is weak against and skips the one it absorbs", async () => {
    const { source, decision } = await run(
      perception([{ confidence: 0.9, species: "Acid Blobs" }], vitals(100, 100)),
      {
        skills: [fireSpell, deathSpell, iceSpell],
        bindings: [binding(20, "F7", { targetMode: "crosshair" }), binding(21, "F8", { targetMode: "crosshair" }), binding(22, "F9", { targetMode: "crosshair" })],
        // The ice spell has the better configured priority, but the acid blob
        // resists ice and is weak to fire.
        huntSkillRules: [huntRule({ id: 1, skillId: 20 }), huntRule({ id: 2, skillId: 21 }), huntRule({ id: 3, skillId: 22, priority: 90 })],
        combat: { huntId: 1, maxCreatures: 6 }
      }
    );
    expect(source).toBe("hunt-skill-Exori Flam");
    expect(JSON.stringify(decision)).not.toContain("Exori Mort");
  });

  it("goes back to town when a supply is below the configured minimum", async () => {
    const operation = policyFromRunSnapshot(JSON.stringify({
      minStaminaMinutes: 100,
      refill: { supplies: { "ultimate health potion": { returnAt: 50, buyTo: 200 } } }
    }));
    const { source } = await run(
      perception([], vitals(100, 100, { "ultimate health potion": 40 })),
      { operation }
    );
    expect(source).toBe("resupply");
  });

  it("stops the hunt on low stamina, above combat", async () => {
    const operation = policyFromRunSnapshot(JSON.stringify({ minStaminaMinutes: 2_400 }));
    const observation = { ...vitals(100, 100), staminaMinutes: 100 };
    const { source } = await run(
      perception([{ confidence: 0.9 }], observation),
      { operation, huntSkillRules: [huntRule({ id: 1, skillId: 13 })] }
    );
    expect(source).toBe("stop-stamina");
  });

  it("loots only when the screen is clear of creatures", async () => {
    const withCreature = await run(perception([{ confidence: 0.9 }], vitals(100, 100), undefined, [{}]));
    expect(withCreature.source).toBe("attack-target");

    const clear = await run(perception([], vitals(100, 100), undefined, [{}]));
    expect(clear.source).toBe("loot");
    expect(clear.commands[0]?.payload).toMatchObject({ button: "right" });
  });

  it("never loots during an emergency", async () => {
    const { source } = await run(perception([], vitals(15, 100), undefined, [{ name: "golden armor" }]));
    expect(source).toBe("emergency-heal");
  });

  it("leaves the hunt when the telemetry is below the minimum", async () => {
    const { source, decision } = await run(
      perception([], vitals(100, 100)),
      {
        hunt,
        telemetry: [telemetrySample({ xpPerHour: 10_000 })],
        leveling: { minimumXpPerHour: 50_000, minimumProfit: null, requireHuntLevel: true }
      }
    );
    expect(source).toBe("leave-hunt");
    expect(decision.reasons.join(" ")).toContain("XP por hora");
  });

  it("stays in the hunt when the telemetry is healthy", async () => {
    const { source } = await run(
      perception([], vitals(100, 100)),
      { hunt, telemetry: [telemetrySample()], leveling: { minimumXpPerHour: 50_000, minimumProfit: 0, requireHuntLevel: true } }
    );
    expect(source).toBeNull();
  });

  it("reads creature, loot and leveling settings from the run snapshot", () => {
    const settings = decisionSettingsFrom(JSON.stringify({
      creatures: { ignoreSpecies: ["Rotworms"], dangerousSpecies: ["Dragons"], maxThreat: 400, maxCreatures: 3 },
      loot: { ignoreItems: ["leather boots"], maxDistance: 90 },
      leveling: { minimumXpPerHour: 250_000 }
    }));
    expect(settings.targeting.ignoreSpecies).toEqual(["Rotworms"]);
    expect(settings.targeting.maxThreat).toBe(400);
    expect(settings.maxCreatures).toBe(3);
    expect(settings.loot.maxDistance).toBe(90);
    expect(settings.leveling.minimumXpPerHour).toBe(250_000);
  });

  it("does not attack an unknown species when the hunt demands identification", async () => {
    const { state, source } = await run(
      perception([{ confidence: 0.95, species: "Bicho Inventado" }], vitals(100, 100)),
      { targeting: { ...DEFAULT_TARGETING_POLICY, requireKnownSpecies: true } }
    );
    expect(state.creatures[0]?.identified).toBe(false);
    expect(state.target).toBeNull();
    expect(source).toBeNull();
  });

  it("refuses to act on a low confidence perception", async () => {
    const { source, decision } = await run(perception([{ confidence: 0.6 }, { confidence: 0.05 }], vitals(100, 100)));
    expect(source).toBeNull();
    expect(decision.rejected.map((entry) => entry.reason).join(" ")).toMatch(/Confiança/);
  });
});
