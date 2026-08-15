import { TIBIA_CREATURE_CATALOG } from "../learning/tibia-creature-catalog.generated.js";
import { normalizeCreatureName } from "../learning/tibia-game-catalog.js";
import type { TibiaCreatureCatalogEntry } from "../learning/tibia-game-catalog.js";

export type DamageElement = "physical" | "fire" | "ice" | "earth" | "energy" | "death" | "holy";

const CATALOG_BY_NAME = new Map<string, TibiaCreatureCatalogEntry>(
  (TIBIA_CREATURE_CATALOG as readonly TibiaCreatureCatalogEntry[]).flatMap((entry) => [
    [normalizeCreatureName(entry.name), entry] as const,
    [entry.race, entry] as const
  ])
);

/** The classifier labels are the catalog names, but singular and plural both appear in the wild. */
export function findCreature(species: string | null): TibiaCreatureCatalogEntry | null {
  if (!species) return null;
  return CATALOG_BY_NAME.get(normalizeCreatureName(species)) ?? CATALOG_BY_NAME.get(species.toLowerCase()) ?? null;
}

/** Worst case damage per turn, the number that decides whether a creature is worth fighting. */
export function threatOf(entry: TibiaCreatureCatalogEntry | null): number | null {
  return entry ? entry.maxDamage : null;
}

/**
 * 0 means immune, below 100 resistant, above 100 weak. Falls back to the
 * immune/strong/weakness lists when the modifier table is missing.
 */
export function damageModifier(entry: TibiaCreatureCatalogEntry | null, element: DamageElement | null): number {
  if (!entry || !element) return 100;
  const modifier = entry.damageModifiers[element];
  if (typeof modifier === "number") return modifier;
  if (entry.immune.includes(element)) return 0;
  if (entry.strong.includes(element)) return 80;
  if (entry.weakness.includes(element)) return 110;
  return 100;
}

const ELEMENT_WORDS: Readonly<Record<string, DamageElement>> = {
  flam: "fire",
  frigo: "ice",
  tera: "earth",
  vis: "energy",
  lux: "energy",
  mort: "death",
  san: "holy"
};

/** Tibia spell words carry the element; the catalog of spells does not store it. */
export function elementOfSpell(spellWordsOrName: string | null): DamageElement | null {
  if (!spellWordsOrName) return null;
  for (const word of spellWordsOrName.toLowerCase().split(/[^a-z]+/)) {
    const element = ELEMENT_WORDS[word];
    if (element) return element;
  }
  return /exori|exeta/.test(spellWordsOrName.toLowerCase()) ? "physical" : null;
}
