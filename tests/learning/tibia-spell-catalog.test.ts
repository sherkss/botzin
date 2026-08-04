import { describe, expect, it } from "vitest";
import { TIBIA_SPELL_CATALOG } from "../../src/learning/tibia-spell-catalog.generated.js";
import { parseSpellDetail, parseSpellTable } from "../../src/learning/tibia-spell-catalog.js";

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
      premium: false,
      description: null, cooldownSeconds: null, groupCooldownSeconds: null, soulPoints: null, amount: null,
      runeVocations: [], runeGroup: null, runeRequiredLevel: null, runeMagicLevel: null
    }]);
  });

  it("keeps rune creation and use requirements separate", () => {
    expect(TIBIA_SPELL_CATALOG.find((spell) => spell.name === "Magic Wall Rune")).toMatchObject({
      manaCost: 750, soulPoints: 5, amount: 3, cooldownSeconds: 2, runeGroup: "attack", runeRequiredLevel: 32,
      runeVocations: ["druid", "knight", "paladin", "sorcerer", "monk"]
    });
    const html = '<H2>Magic Wall Rune</H2>Creates a wall.<BR><div class="TableContainer"><div>Spell Information</div><TR><TD>Cooldown:</TD><TD>2s (Group: 2s)</TD></TR><TR><TD>Soul Points:</TD><TD>5</TD></TR><TR><TD>Amount:</TD><TD>3</TD></TR><div>Rune Information</div><TR><TD>Vocation:</TD><TD>Knight, Druid, Monk, Paladin, Sorcerer</TD></TR><TR><TD>Group:</TD><TD>Attack</TD></TR><TR><TD>Exp Lvl:</TD><TD>32</TD></TR><TR><TD>Mag Lvl:</TD><TD>9</TD></TR>';
    expect(parseSpellDetail(html)).toMatchObject({ soulPoints: 5, amount: 3, runeRequiredLevel: 32, runeMagicLevel: 9 });
  });
});
