import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMysqlPool } from "./mysql-pool.js";
import type { RowDataPacket } from "mysql2/promise";
import { seedBasicGameKnowledge } from "../learning/basic-game-knowledge.js";

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

  await pool.end();
  console.log(`Database schema migrated on ${config.mysqlHost}:${config.mysqlPort}/${config.mysqlDatabase}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
