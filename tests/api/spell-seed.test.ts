import { afterAll, describe, expect, it } from "vitest";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { seedTibiaSpells } from "../../src/learning/seed-tibia-spells.js";
import { MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER, TEST_DB } from "../helpers/test-config.js";

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: TEST_DB,
  connectionLimit: 2
});

afterAll(async () => pool.end());

describe("official Tibia spell seed", () => {
  it("creates all spells idempotently without enabling actions", async () => {
    await seedTibiaSpells(pool);
    await seedTibiaSpells(pool);

    const [countRows] = await pool.query<Array<RowDataPacket & { count: number }>>(
      "SELECT COUNT(*) AS count FROM bot_skills"
    );
    expect(Number(countRows[0]?.count)).toBe(193);

    const [rows] = await pool.query<Array<RowDataPacket & {
      manaCost: number | null;
      allowedVocations: string;
      enabled: number;
    }>>(
      `SELECT mana_cost AS manaCost, allowed_vocations AS allowedVocations, enabled
         FROM bot_skills WHERE name = 'Enchant Party'`
    );
    expect(rows[0]?.manaCost).toBeNull();
    expect(rows[0]?.allowedVocations).toContain("master sorcerer");
    expect(Boolean(rows[0]?.enabled)).toBe(false);
  });
});
