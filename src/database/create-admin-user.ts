import bcrypt from "bcryptjs";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { ConfigUserRepository } from "./config-user-repository.js";
import { createMysqlPool } from "./mysql-pool.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();

  if (!config.adminUsername || !config.adminPassword || config.adminPassword === "change-me") {
    throw new Error("Configure BOTZIN_ADMIN_USERNAME and BOTZIN_ADMIN_PASSWORD before creating the admin user.");
  }

  const pool = createMysqlPool(config);
  const repository = new ConfigUserRepository(pool);
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const user = await repository.createOrUpdateUser({
    username: config.adminUsername,
    displayName: config.adminDisplayName,
    passwordHash,
    role: "admin"
  });

  await pool.end();
  console.log(`Admin user "${user.username}" is ready.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
