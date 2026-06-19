/**
 * Runs once before all test workers.
 *
 * Prerequisites:
 *   - MySQL running and accessible with the credentials in tests/helpers/test-config.ts
 *     (defaults: host 127.0.0.1:3306, user botzin, password botzin).
 *   - The MySQL user must have CREATE/DROP DATABASE permissions.
 *
 * What it does:
 *   1. Drops and recreates the `botzin_test` database.
 *   2. Applies database/schema.sql.
 *   3. Creates admin, operator, and viewer test users.
 *   4. Starts the API server in-process on a random port.
 *   5. Provides the port to test workers via inject('serverPort').
 */
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { GlobalSetupContext } from "vitest/node";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { createConfigServer } from "../src/web/config-server-factory.js";
import { createMysqlPool } from "../src/database/mysql-pool.js";
import { loadRuntimeConfig } from "../src/config/runtime-config.js";
import {
  TEST_DB,
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_USER,
  MYSQL_PASSWORD,
  TEST_JWT_SECRET,
  ADMIN_USER,
  ADMIN_PASS,
  OPERATOR_USER,
  OPERATOR_PASS,
  VIEWER_USER,
  VIEWER_PASS
} from "./helpers/test-config.js";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const schemaPath = resolve(__dir, "../database/schema.sql");
const publicDir = resolve(__dir, "../public");

export default async function setup({ provide }: GlobalSetupContext) {
  // 1. Create/reset test database using a single admin connection.
  const adminConn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    multipleStatements: true
  });

  await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await adminConn.query(
    `CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConn.query(`USE \`${TEST_DB}\``);

  const schema = readFileSync(schemaPath, "utf8");
  await adminConn.query(schema);

  // 2. Create test users with bcrypt-hashed passwords.
  const [adminHash, operatorHash, viewerHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASS, 10),
    bcrypt.hash(OPERATOR_PASS, 10),
    bcrypt.hash(VIEWER_PASS, 10)
  ]);

  await adminConn.execute(
    `INSERT INTO config_users (username, display_name, password_hash, role)
     VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
    [
      ADMIN_USER, "Test Admin", adminHash, "admin",
      OPERATOR_USER, "Test Operator", operatorHash, "operator",
      VIEWER_USER, "Test Viewer", viewerHash, "viewer"
    ]
  );

  await adminConn.end();

  // 3. Build a runtime config pointing to the test database.
  const testConfig = loadRuntimeConfig({
    ...process.env,
    BOTZIN_JWT_SECRET: TEST_JWT_SECRET,
    BOTZIN_MYSQL_HOST: MYSQL_HOST,
    BOTZIN_MYSQL_PORT: String(MYSQL_PORT),
    BOTZIN_MYSQL_USER: MYSQL_USER,
    BOTZIN_MYSQL_PASSWORD: MYSQL_PASSWORD,
    BOTZIN_MYSQL_DATABASE: TEST_DB
  });

  // 4. Start the API server on a random port.
  const serverPool = createMysqlPool(testConfig);
  const storageDir = await mkdtemp(join(tmpdir(), "botzin-test-storage-"));
  const server = createConfigServer(testConfig, serverPool, publicDir, storageDir);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  provide("serverPort", port);

  // 5. Teardown: close server + pool + drop test database.
  return async () => {
    await new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res())));
    await serverPool.end();

    const cleanConn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD
    });
    await cleanConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await cleanConn.end();
  };
}
