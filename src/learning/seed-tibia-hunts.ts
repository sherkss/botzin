import type { Pool } from "mysql2/promise";
import { TIBIA_CREATURE_CATALOG } from "./tibia-creature-catalog.generated.js";

/**
 * Hunting spots are derived from the synced creature catalog rather than typed out
 * by hand: every creature already carries the location the wiki lists it in, so
 * grouping by that field yields the real spots without inventing any.
 */

/** A lone creature in a location is usually a boss room, not a hunting ground. */
const MIN_CREATURES_PER_SPOT = 2;
/** The caller asked for high level content; below this the spot is early game. */
const MIN_HUNT_LEVEL = 100;
const MAX_HUNT_LEVEL = 1200;

/**
 * Suggested level from the toughest creature's health.
 *
 * This is a heuristic, not a figure the game publishes. It is a power curve fitted
 * to four widely accepted references - rotworm (65 hp, ~10), dragon (1000 hp, ~60),
 * demon (8200 hp, ~250) and the Radiant creatures (44275 hp, ~800) - and it is meant
 * as a starting point an operator adjusts, not as an authority. Health drives it
 * because the catalog fills that field for every creature, while the parsed
 * ``maxDamage`` is zero for much of the endgame content.
 */
export function suggestedLevel(hitpoints: number): number {
  if (hitpoints <= 0) return 0;
  const level = 10 * Math.pow(hitpoints / 65, 0.671);
  return Math.min(MAX_HUNT_LEVEL, Math.max(1, Math.round(level / 10) * 10));
}

interface DerivedHunt {
  readonly name: string;
  readonly minLevel: number;
  readonly notes: string;
}

export function deriveHunts(
  catalog: readonly { name: string; location: string; hitpoints: number; experience: number }[]
    = TIBIA_CREATURE_CATALOG
): readonly DerivedHunt[] {
  const spots = new Map<string, { name: string; hitpoints: number; experience: number }[]>();
  for (const creature of catalog) {
    // Wiki locations arrive with stray punctuation ("Isle of Ada.") and would
    // otherwise produce two spots for one place.
    const location = creature.location.trim().replace(/[.,;]+$/, "").trim();
    if (!location || location.length > 120) continue;
    const bucket = spots.get(location) ?? [];
    bucket.push({ name: creature.name, hitpoints: creature.hitpoints, experience: creature.experience });
    spots.set(location, bucket);
  }

  const hunts: DerivedHunt[] = [];
  for (const [location, creatures] of spots) {
    if (creatures.length < MIN_CREATURES_PER_SPOT) continue;
    const toughest = creatures.reduce((worst, creature) =>
      creature.hitpoints > worst.hitpoints ? creature : worst);
    const minLevel = suggestedLevel(toughest.hitpoints);
    if (minLevel < MIN_HUNT_LEVEL) continue;

    const byExperience = [...creatures].sort((a, b) => b.experience - a.experience);
    const headline = byExperience.slice(0, 6).map((creature) => creature.name).join(", ");
    const bestExperience = byExperience[0]!.experience;
    hunts.push({
      name: location,
      minLevel,
      notes: [
        `${creatures.length} criaturas catalogadas: ${headline}${creatures.length > 6 ? "…" : ""}.`,
        `Mais forte: ${toughest.name} (${toughest.hitpoints.toLocaleString("pt-BR")} HP).`,
        `Melhor XP unitária: ${bestExperience.toLocaleString("pt-BR")}.`,
        `Nível sugerido ${minLevel} é heurístico, derivado do HP da criatura mais forte — ajuste conforme vocação, equipamento e se a hunt é solo ou em time.`
      ].join(" ")
    });
  }
  return hunts.sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name));
}

export async function seedTibiaHunts(pool: Pool): Promise<void> {
  const hunts = deriveHunts();
  if (hunts.length === 0) return;

  const values = hunts.map((hunt) => [hunt.name, hunt.minLevel, hunt.notes]);
  const placeholders = values.map(() => "(?, NULL, NULL, ?, ?, FALSE)").join(", ");
  // enabled is deliberately left out of the update: a spot the operator turned on
  // (or off) must not flip back when the catalog is re-synced.
  await pool.execute(
    `INSERT INTO bot_hunts (name, city, route_profile, min_level, notes, enabled)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE min_level = VALUES(min_level), notes = VALUES(notes)`,
    values.flat()
  );
}
