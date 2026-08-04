import { describe, expect, it } from "vitest";
import { normalizePartyVocation, sharedExperienceLevelRange, validateParty } from "../../src/decision/party-rules.js";

describe("party composition rules", () => {
  it("accepts leveling parties from 2 to 5 without repeated vocations", () => {
    expect(validateParty("leveling", [
      { name: "Tank", vocation: "EK", level: 300 }, { name: "Healer", vocation: "elder druid", level: 250 },
      { name: "Damage", vocation: "RP", level: 240 }, { name: "Mage", vocation: "master sorcerer", level: 220 },
      { name: "Monk", vocation: "exalted monk", level: 200 }
    ])).toMatchObject({ valid: true, size: 5, sharedExperience: { minimumAllowedLevel: 200, eligible: true }, warnings: [] });
  });

  it("rejects repeated vocations while leveling", () => {
    const result = validateParty("leveling", [
      { name: "EK", vocation: "elite knight", level: 100 }, { name: "ED", vocation: "elder druid", level: 100 },
      { name: "ED 2", vocation: "druid", level: 100 }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("druid");
  });

  it("allows repeated vocations for bosses and quests", () => {
    const members = [
      { name: "EK", vocation: "knight" }, { name: "ED", vocation: "druid" }, { name: "ED 2", vocation: "druid" }
    ];
    expect(validateParty("boss", members).valid).toBe(true);
    expect(validateParty("quest", members).valid).toBe(true);
  });

  it("allows more than five members for bosses and quests but not for leveling", () => {
    const members = [
      { name: "EK 1", vocation: "knight", level: 100 }, { name: "ED 1", vocation: "druid", level: 100 },
      { name: "RP 1", vocation: "paladin", level: 100 }, { name: "MS 1", vocation: "sorcerer", level: 100 },
      { name: "Monk", vocation: "monk", level: 100 }, { name: "ED 2", vocation: "druid", level: 100 }
    ];
    expect(validateParty("boss", members).valid).toBe(true);
    expect(validateParty("quest", members).valid).toBe(true);
    expect(validateParty("leveling", members).valid).toBe(false);
  });

  it("enforces the official two-thirds level range only for leveling", () => {
    expect(sharedExperienceLevelRange([40, 60])).toMatchObject({ minimumAllowedLevel: 40, eligible: true });
    expect(sharedExperienceLevelRange([66, 100])).toMatchObject({ minimumAllowedLevel: 67, eligible: false });
    const leveling = validateParty("leveling", [
      { name: "EK", vocation: "knight", level: 100 }, { name: "ED", vocation: "druid", level: 66 }
    ]);
    expect(leveling.valid).toBe(false);
    expect(leveling.errors.join(" ")).toContain("pelo menos 67");
    expect(validateParty("boss", [
      { name: "EK", vocation: "knight", level: 1000 }, { name: "ED", vocation: "druid", level: 20 }
    ]).valid).toBe(true);
  });

  it("requires every member level for a leveling party", () => {
    const result = validateParty("leveling", [
      { name: "EK", vocation: "knight", level: 100 }, { name: "ED", vocation: "druid" }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("ED");
  });

  it("enforces the minimum party size and recommends EK plus ED without making it an absolute rule", () => {
    expect(validateParty("boss", [{ name: "EK", vocation: "knight" }]).valid).toBe(false);
    const result = validateParty("boss", [{ name: "RP", vocation: "paladin" }, { name: "MS", vocation: "sorcerer" }]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(normalizePartyVocation("Exalted Monk")).toBe("monk");
  });
});
