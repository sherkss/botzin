import { describe, expect, it } from "vitest";
import { TIBIA_GENERAL_KNOWLEDGE } from "../../src/learning/tibia-general-knowledge.generated.js";
import { cleanWikiText } from "../../src/learning/tibia-general-knowledge.js";

describe("Tibia general knowledge catalog", () => {
  it("contains the generated multi-domain snapshot without duplicate keys", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE).toHaveLength(6246);
    expect(new Set(TIBIA_GENERAL_KNOWLEDGE.map((entry) => entry.key)).size).toBe(TIBIA_GENERAL_KNOWLEDGE.length);
    expect([...new Set(TIBIA_GENERAL_KNOWLEDGE.map((entry) => entry.domain))]).toEqual(expect.arrayContaining([
      "achievement", "book", "boss", "city", "event", "hunting-place", "market", "mystery", "npc", "npc-dialogue", "quest", "rune", "soul-core"
    ]));
  });

  it("keeps actionable quest, achievement and hunt knowledge with provenance", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.name === "20 Years a Cook Quest")).toMatchObject({
      domain: "quest", trust: "community"
    });
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.name === "A Friend in Need")?.content).toContain("Threatened Dreams Quest");
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.name === "Ab'Dendriel Elf Cave")?.content).toContain("Machete");
  });

  it("includes official runes and marks changing knowledge as volatile", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.name === "Avalanche Rune")).toMatchObject({
      domain: "rune", trust: "official", volatile: false
    });
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.domain === "market")).toMatchObject({ trust: "official", volatile: true });
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.domain === "event")).toMatchObject({ trust: "official", volatile: true });
  });

  it("keeps party composition taught by the user separate from external sources", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.key === "user:party:composition:v1")).toMatchObject({
      domain: "mechanic", trust: "user", metadata: {
        normalPartySize: { minimum: 2, maximum: 5 },
        preferredCore: ["knight", "druid"],
        purposes: { boss: { maximumSize: null, largerPartyAllowed: true } }
      }
    });
  });

  it("keeps the Shared Experience level formula with official provenance", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.key === "official:mechanic:shared-experience")).toMatchObject({
      trust: "official", metadata: { formula: "lowestLevel * 3 >= highestLevel * 2", appliesTo: "leveling" }
    });
  });

  it("stores NPC dialogue as attributed turns and keeps 469 unresolved", () => {
    const cipfried = TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.name === "Cipfried — diálogos");
    expect(cipfried).toMatchObject({ domain: "npc-dialogue", trust: "community" });
    expect((cipfried?.metadata.turns as unknown[]).length).toBeGreaterThan(0);
    expect(cipfried?.metadata).toMatchObject({ license: "CC-BY-SA-3.0" });
    expect(TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.key === "community:mystery:469")).toMatchObject({
      domain: "mystery", metadata: { resolutionStatus: "unresolved" }
    });
  });

  it("keeps Tibia books bilingual with automatic-translation provenance", () => {
    const commandments = TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.key === "fandom:book:16827");
    expect(commandments).toMatchObject({
      domain: "book", trust: "community",
      metadata: { translationStatus: "machine-translated", license: "CC-BY-SA-3.0" }
    });
    expect(commandments?.metadata.textEn).toContain("Thou shalt not kill");
    expect(commandments?.metadata.textPtBr).toContain("Não matarás");

    const numeric469 = TIBIA_GENERAL_KNOWLEDGE.find((entry) => entry.key === "fandom:book:11290");
    expect(numeric469?.metadata.textPtBr).toBe(numeric469?.metadata.textEn);
  });

  it("converts common wiki markup into searchable text", () => {
    expect(cleanWikiText("Go to [[Thais]] with [[Captain Bluebear|the captain]].<br>'''Ready'''")).toBe(
      "Go to Thais with the captain. Ready"
    );
  });
});
