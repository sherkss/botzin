import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMysqlPool } from "../database/mysql-pool.js";
import { createConfigServer } from "./config-server-factory.js";

const config = loadRuntimeConfig();
const pool = createMysqlPool(config);
const publicDir = resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const storageDir = resolve(fileURLToPath(new URL("../../storage/learning-sources/videos", import.meta.url)));
const knowledgeDir = resolve(config.knowledgeDir);
const decisionLogPath = resolve(config.decisionLogPath);

const server = createConfigServer(config, pool, publicDir, storageDir, knowledgeDir, decisionLogPath);

server.listen(config.webPort, config.webHost, () => {
  console.log(`Configuration screen: http://${config.webHost}:${config.webPort}`);
});
