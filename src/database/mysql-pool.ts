import mysql from "mysql2/promise";
import type { RuntimeConfig } from "../config/runtime-config.js";

export function createMysqlPool(config: RuntimeConfig): mysql.Pool {
  return mysql.createPool({
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  });
}
