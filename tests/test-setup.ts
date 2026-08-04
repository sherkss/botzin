/**
 * Runs for every test file (setupFiles).
 *
 * Uses beforeAll (not beforeEach) so the DB is wiped once per test FILE,
 * not before every individual test. This lets a file's own beforeAll create
 * fixtures that survive for all tests in that file without being truncated
 * between them.
 *
 * Execution order guaranteed by Vitest:
 *   1. setupFile beforeAll  → truncate tables
 *   2. test-file beforeAll  → create per-file fixtures
 *   3. (repeat for each test) beforeEach hooks → test body
 *
 * The config_users table is NOT truncated — test users from globalSetup
 * must persist for authentication across all tests.
 */
import { beforeAll, afterAll } from "vitest";
import mysql, { type Pool } from "mysql2/promise";
import {
  TEST_DB,
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_USER,
  MYSQL_PASSWORD
} from "./helpers/test-config.js";

// Tables ordered leaf-first so FK constraints don't block TRUNCATE.
const DATA_TABLES = [
  "bot_decision_feedback",
  "bot_learning_events",
  "bot_learning_sessions",
  "bot_learning_method_sources",
  "bot_hunt_skill_rules",
  "bot_hunt_telemetry",
  "bot_hunt_assignments",
  "bot_creature_catalog",
  "bot_item_catalog",
  "bot_game_knowledge",
  "bot_skills",
  "bot_hunts",
  "bot_characters",
  "bot_machines",
  "bot_accounts",
  "bot_learning_methods",
  "bot_learning_sources"
];

let pool: Pool | null = null;

function getPool(): Pool {
  return (pool ??= mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: TEST_DB,
    waitForConnections: true,
    connectionLimit: 3
  }));
}

beforeAll(async () => {
  const conn = await getPool().getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of DATA_TABLES) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
});

afterAll(async () => {
  await pool?.end();
  pool = null;
});
