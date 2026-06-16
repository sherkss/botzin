import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMysqlPool } from "./mysql-pool.js";

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

  await pool.end();
  console.log(`Database schema migrated on ${config.mysqlHost}:${config.mysqlPort}/${config.mysqlDatabase}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
