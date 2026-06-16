import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { ConfigUser, ConfigUserRole } from "../core/config-user.js";

export class ConfigUserRepository {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<ConfigUser | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, username, display_name, password_hash, role, enabled FROM config_users WHERE username = ?",
      [username]
    );

    return rows.length === 1 ? mapConfigUser(rows[0]) : null;
  }

  async createOrUpdateUser(input: {
    readonly username: string;
    readonly displayName: string;
    readonly passwordHash: string;
    readonly role: ConfigUserRole;
  }): Promise<ConfigUser> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO config_users (username, display_name, password_hash, role, enabled) VALUES (?, ?, ?, ?, TRUE) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), role = VALUES(role), enabled = TRUE",
      [input.username, input.displayName, input.passwordHash, input.role]
    );

    const user = await this.findByUsername(input.username);
    if (!user) {
      throw new Error(`Config user "${input.username}" was not found after save. Insert id: ${result.insertId}.`);
    }
    return user;
  }

  async markLogin(userId: number): Promise<void> {
    await this.pool.execute("UPDATE config_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
  }
}

function mapConfigUser(row: RowDataPacket): ConfigUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
    role: row.role as ConfigUserRole,
    enabled: Boolean(row.enabled)
  };
}
