import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMysqlPool } from "./mysql-pool.js";
import type { RowDataPacket } from "mysql2/promise";
import { seedBasicGameKnowledge } from "../learning/basic-game-knowledge.js";
import { seedTibiaSpells } from "../learning/seed-tibia-spells.js";
import { seedTibiaGameCatalog } from "../learning/seed-tibia-game-catalog.js";
import { seedTibiaGeneralKnowledge } from "../learning/seed-tibia-general-knowledge.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "../../database/schema.sql");

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const pool = createMysqlPool(config);
  const schema = await readFile(schemaPath, "utf8");
  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }

  await pool.query("ALTER TABLE bot_learning_sources ALTER COLUMN trust_level SET DEFAULT 'low'");
  await pool.query("ALTER TABLE bot_skills MODIFY mana_cost INT UNSIGNED NULL DEFAULT 0");
  await pool.query("ALTER TABLE bot_game_knowledge MODIFY trust_level ENUM('official', 'community', 'user') NOT NULL");
  const [multiActionColumns] = await pool.query<Array<RowDataPacket & { count: number }>>(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema=? AND table_name='bot_client_spell_bindings' AND column_name='multi_action_slot'",
    [config.mysqlDatabase]
  );
  if (Number(multiActionColumns[0]?.count ?? 0) === 0) {
    await pool.query("ALTER TABLE bot_client_spell_bindings ADD COLUMN multi_action_slot TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER hotkey");
  }
  const [multiActionIndexes] = await pool.query<Array<RowDataPacket & { count: number }>>(
    "SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema=? AND table_name='bot_client_spell_bindings' AND index_name='uq_bot_client_spell_bindings_hotkey_slot'",
    [config.mysqlDatabase]
  );
  if (Number(multiActionIndexes[0]?.count ?? 0) === 0) {
    await pool.query("ALTER TABLE bot_client_spell_bindings ADD UNIQUE KEY uq_bot_client_spell_bindings_hotkey_slot (character_id, hotkey, multi_action_slot)");
  }
  const creatureColumns: Record<string, string> = {
    armor: "INT UNSIGNED NOT NULL DEFAULT 0", mitigation: "DOUBLE NOT NULL DEFAULT 0", max_damage: "INT UNSIGNED NOT NULL DEFAULT 0",
    damage_by_type_json: "JSON NULL", damage_modifiers_json: "JSON NULL", attacks_json: "JSON NULL", location: "TEXT NULL",
    loot_details_json: "JSON NULL", community_source_url: "VARCHAR(500) NULL", community_source_updated_at: "DATETIME NULL"
  };
  for (const [column, definition] of Object.entries(creatureColumns)) {
    const [columns] = await pool.query<Array<RowDataPacket & { count: number }>>(
      "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema=? AND table_name='bot_creature_catalog' AND column_name=?",
      [config.mysqlDatabase, column]
    );
    if (Number(columns[0]?.count ?? 0) === 0) await pool.query(`ALTER TABLE bot_creature_catalog ADD COLUMN \`${column}\` ${definition}`);
  }

  const [indexRows] = await pool.query<Array<RowDataPacket & { count: number }>>(
    `SELECT COUNT(*) AS count
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = 'bot_learning_sources'
        AND index_name = 'uq_bot_learning_sources_content_hash'`,
    [config.mysqlDatabase]
  );
  if (Number(indexRows[0]?.count ?? 0) === 0) {
    await pool.query(
      "ALTER TABLE bot_learning_sources ADD UNIQUE KEY uq_bot_learning_sources_content_hash (content_hash)"
    );
  }

  const [foreignKeys] = await pool.query<Array<RowDataPacket & { constraintName: string; deleteRule: string }>>(
    `SELECT constraint_name AS constraintName, delete_rule AS deleteRule
       FROM information_schema.referential_constraints
      WHERE constraint_schema = ? AND table_name = 'bot_decision_feedback'
        AND constraint_name IN ('fk_bot_decision_feedback_event', 'fk_bot_decision_feedback_assignment')`,
    [config.mysqlDatabase]
  );
  for (const foreignKey of foreignKeys) {
    if (foreignKey.deleteRule === "CASCADE") continue;
    const name = String(foreignKey.constraintName);
    await pool.query(`ALTER TABLE bot_decision_feedback DROP FOREIGN KEY \`${name}\``);
    if (name === "fk_bot_decision_feedback_event") {
      await pool.query("ALTER TABLE bot_decision_feedback ADD CONSTRAINT fk_bot_decision_feedback_event FOREIGN KEY (learning_event_id) REFERENCES bot_learning_events (id) ON DELETE CASCADE");
    } else {
      await pool.query("ALTER TABLE bot_decision_feedback ADD CONSTRAINT fk_bot_decision_feedback_assignment FOREIGN KEY (assignment_id) REFERENCES bot_hunt_assignments (id) ON DELETE CASCADE");
    }
  }

  await seedBasicGameKnowledge(pool);
  await seedTibiaSpells(pool);
  await seedTibiaGameCatalog(pool);
  await seedTibiaGeneralKnowledge(pool);

  await pool.end();
  console.log(`Database schema migrated on ${config.mysqlHost}:${config.mysqlPort}/${config.mysqlDatabase}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
