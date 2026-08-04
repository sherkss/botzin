import type { Pool } from "mysql2/promise";
import { TIBIA_SPELL_CATALOG, TIBIA_SPELL_CATALOG_GENERATED_AT, TIBIA_SPELL_CATALOG_SOURCE } from "./tibia-spell-catalog.generated.js";
import type { TibiaVocation } from "./tibia-spell-catalog.js";

const PROMOTED_VOCATIONS: Record<TibiaVocation, string> = {
  druid: "elder druid",
  knight: "elite knight",
  paladin: "royal paladin",
  sorcerer: "master sorcerer",
  monk: "exalted monk"
};

export async function seedTibiaSpells(pool: Pool): Promise<void> {
  const values = TIBIA_SPELL_CATALOG.map((spell) => {
    const allowedVocations = spell.vocations
      .flatMap((vocation) => [vocation, PROMOTED_VOCATIONS[vocation]])
      .join(",");
    const notes = [
      `Catálogo oficial do Tibia (${spell.type === "rune" ? "runa" : "instantânea"}).`,
      spell.manaCost === null ? `Custo de mana variável na fonte: ${spell.manaText}.` : null,
      spell.requiredLevel === null ? "Nível definido por desbloqueio especial/Wheel of Destiny." : null,
      spell.premium ? "Premium." : "Free account.",
      `Fonte: ${TIBIA_SPELL_CATALOG_SOURCE}`,
      `Catálogo gerado em ${TIBIA_SPELL_CATALOG_GENERATED_AT}.`
    ].filter(Boolean).join(" ");

    return [
      spell.name,
      spell.words,
      spell.group,
      spell.manaCost,
      spell.requiredLevel ?? 0,
      allowedVocations,
      1000,
      notes
    ];
  });

  const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, FALSE)").join(", ");
  await pool.execute(
    `INSERT INTO bot_skills
       (name, spell_words, category, mana_cost, required_level, allowed_vocations, cooldown_ms, notes, enabled)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       spell_words = VALUES(spell_words), category = VALUES(category), mana_cost = VALUES(mana_cost),
       required_level = VALUES(required_level), allowed_vocations = VALUES(allowed_vocations),
       notes = VALUES(notes)`,
    values.flat()
  );
}
