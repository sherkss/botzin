import { describe, expect, it } from "vitest";
import { TIBIA_CREATURE_CATALOG } from "../../src/learning/tibia-creature-catalog.generated.js";
import { TIBIA_ITEM_CATALOG } from "../../src/learning/tibia-item-catalog.generated.js";
import { parseItemPage, parseOfficialCreature } from "../../src/learning/tibia-game-catalog.js";

describe("Tibia creature and item catalogs", () => {
  it("contains the current complete snapshots", () => {
    expect(TIBIA_CREATURE_CATALOG).toHaveLength(718);
    expect(TIBIA_ITEM_CATALOG).toHaveLength(6465);
    expect(new Set(TIBIA_CREATURE_CATALOG.map((entry) => entry.race)).size).toBe(718);
    expect(new Set(TIBIA_ITEM_CATALOG.map((entry) => entry.sourceId)).size).toBe(6465);
  });

  it("keeps combat information for official creatures", () => {
    expect(TIBIA_CREATURE_CATALOG.find((entry) => entry.race === "dragon")).toMatchObject({
      name: "Dragons",
      hitpoints: 1000,
      experience: 700,
      immune: ["fire"],
      weakness: ["ice"],
      lootable: true
    });
  });

  it("keeps classification and provenance for items", () => {
    expect(TIBIA_ITEM_CATALOG.find((entry) => entry.name === "Magic Plate Armor")).toMatchObject({
      categorySlug: "armors",
      primaryType: "Armors"
    });
  });

  it("parses defensive API payloads", () => {
    expect(parseOfficialCreature({ name: "Test", race: "test", hitpoints: 10, weakness: ["ice"] }, "fallback")).toMatchObject({
      name: "Test", race: "test", hitpoints: 10, experience: 0, weakness: ["ice"]
    });
    expect(parseItemPage({ page: 1, pageSize: 100, totalCount: 1, items: [{ id: 9, name: "Test Item" }] }).items[0]).toMatchObject({
      sourceId: 9, name: "Test Item", categorySlug: null
    });
  });
});
