import { describe, expect, it } from "vitest";
import { TIBIA_SPELL_CATALOG } from "../../src/learning/tibia-spell-catalog.generated.js";
import { parseSpellTable } from "../../src/learning/tibia-spell-catalog.js";

describe("official Tibia spell catalog", () => {
  it("contains the complete current catalog with unique ids and all five vocations", () => {
    expect(TIBIA_SPELL_CATALOG).toHaveLength(193);
    expect(new Set(TIBIA_SPELL_CATALOG.map((spell) => spell.id)).size).toBe(193);
    expect(new Set(TIBIA_SPELL_CATALOG.flatMap((spell) => spell.vocations))).toEqual(
      new Set(["druid", "knight", "paladin", "sorcerer", "monk"])
    );
  });

  it("preserves official mana, level and vocation data", () => {
    expect(TIBIA_SPELL_CATALOG.find((spell) => spell.name === "Berserk")).toMatchObject({
      words: "exori",
      manaCost: 125,
      requiredLevel: 35,
      vocations: ["knight"]
    });
    expect(TIBIA_SPELL_CATALOG.find((spell) => spell.name === "Terra Wave")).toMatchObject({
      manaCost: 170,
      vocations: ["druid"]
    });
    expect(TIBIA_SPELL_CATALOG.find((spell) => spell.name === "Swift Jab")).toMatchObject({
      manaCost: 3,
      vocations: ["monk"]
    });
  });

  it("represents variable mana as unknown instead of zero", () => {
    expect(TIBIA_SPELL_CATALOG.find((spell) => spell.name === "Enchant Party")).toMatchObject({
      manaCost: null,
      manaText: "var."
    });
  });

  it("parses an official table row", () => {
    const html = '<TR BGCOLOR=#D4C0A1><TD><A HREF="https://www.tibia.com/library/?subtopic=spells&spell=levitate&vocation=">Levitate</A> (exani hur "up|down")</TD><TD>Support</TD><TD>Instant</TD><TD>12</TD><TD>50</TD><TD>no</TD></TR>';
    expect(parseSpellTable(html)).toEqual([{
      id: "levitate",
      name: "Levitate",
      words: 'exani hur "up|down"',
      group: "support",
      type: "instant",
      requiredLevel: 12,
      manaCost: 50,
      manaText: "50",
      premium: false
    }]);
  });
});
