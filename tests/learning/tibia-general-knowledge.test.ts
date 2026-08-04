import { describe, expect, it } from "vitest";
import { TIBIA_GENERAL_KNOWLEDGE } from "../../src/learning/tibia-general-knowledge.generated.js";
import { cleanWikiText } from "../../src/learning/tibia-general-knowledge.js";

describe("Tibia general knowledge catalog", () => {
  it("contains the generated multi-domain snapshot without duplicate keys", () => {
    expect(TIBIA_GENERAL_KNOWLEDGE).toHaveLength(4566);
    expect(new Set(TIBIA_GENERAL_KNOWLEDGE.map((entry) => entry.key)).size).toBe(TIBIA_GENERAL_KNOWLEDGE.length);
    expect([...new Set(TIBIA_GENERAL_KNOWLEDGE.map((entry) => entry.domain))]).toEqual(expect.arrayContaining([
      "achievement", "boss", "city", "event", "hunting-place", "market", "npc", "quest", "rune", "soul-core"
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

  it("converts common wiki markup into searchable text", () => {
    expect(cleanWikiText("Go to [[Thais]] with [[Captain Bluebear|the captain]].<br>'''Ready'''")).toBe(
      "Go to Thais with the captain. Ready"
    );
  });
});
