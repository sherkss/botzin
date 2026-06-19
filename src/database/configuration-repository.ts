import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { ValidationError } from "../core/errors.js";
import type {
  BotAccount,
  BotCharacter,
  BotConfigurationSnapshot,
  BotHunt,
  BotHuntAssignment,
  BotHuntSkillRule,
  BotLearningMethod,
  BotLearningMethodSource,
  BotLearningSession,
  BotLearningSource,
  BotMachine,
  BotSkill
} from "../core/bot-configuration.js";

export class ConfigurationRepository {
  constructor(private readonly pool: Pool) {}

  async getSnapshot(): Promise<BotConfigurationSnapshot> {
    const [
      accounts,
      characters,
      machines,
      hunts,
      skills,
      assignments,
      huntSkillRules,
      learningMethods,
      learningSources,
      learningMethodSources,
      learningSessions
    ] = await Promise.all([
      this.listAccounts(),
      this.listCharacters(),
      this.listMachines(),
      this.listHunts(),
      this.listSkills(),
      this.listAssignments(),
      this.listHuntSkillRules(),
      this.listLearningMethods(),
      this.listLearningSources(),
      this.listLearningMethodSources(),
      this.listLearningSessions()
    ]);

    return {
      accounts,
      characters,
      machines,
      hunts,
      skills,
      assignments,
      huntSkillRules,
      learningMethods,
      learningSources,
      learningMethodSources,
      learningSessions
    };
  }

  async listAccounts(): Promise<readonly BotAccount[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, name, login_identifier, secret_reference, notes, enabled FROM bot_accounts ORDER BY name"
    );
    return rows.map(mapAccount);
  }

  async createAccount(input: Record<string, unknown>): Promise<BotAccount> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_accounts (name, login_identifier, secret_reference, notes, enabled) VALUES (?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        requiredString(input.loginIdentifier, "loginIdentifier"),
        nullableString(input.secretReference),
        nullableString(input.notes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getAccount(result.insertId);
  }

  async listCharacters(): Promise<readonly BotCharacter[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, account_id, name, world, vocation, level, enabled FROM bot_characters ORDER BY name"
    );
    return rows.map(mapCharacter);
  }

  async createCharacter(input: Record<string, unknown>): Promise<BotCharacter> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_characters (account_id, name, world, vocation, level, enabled) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requiredNumber(input.accountId, "accountId"),
        requiredString(input.name, "name"),
        nullableString(input.world),
        nullableString(input.vocation),
        nullableNumber(input.level),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getCharacter(result.insertId);
  }

  async listMachines(): Promise<readonly BotMachine[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, node_id, name, role, preferred_host, connection_notes, enabled FROM bot_machines ORDER BY name"
    );
    return rows.map(mapMachine);
  }

  async createMachine(input: Record<string, unknown>): Promise<BotMachine> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_machines (node_id, name, role, preferred_host, connection_notes, enabled) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.nodeId, "nodeId"),
        requiredString(input.name, "name"),
        stringValue(input.role, "perception"),
        nullableString(input.preferredHost),
        nullableString(input.connectionNotes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getMachine(result.insertId);
  }

  async listHunts(): Promise<readonly BotHunt[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, name, city, route_profile, min_level, notes, enabled FROM bot_hunts ORDER BY name"
    );
    return rows.map(mapHunt);
  }

  async createHunt(input: Record<string, unknown>): Promise<BotHunt> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_hunts (name, city, route_profile, min_level, notes, enabled) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        nullableString(input.city),
        nullableString(input.routeProfile),
        nullableNumber(input.minLevel),
        nullableString(input.notes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getHunt(result.insertId);
  }

  async listSkills(): Promise<readonly BotSkill[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, name, spell_words, hotkey, category, mana_cost, required_level, allowed_vocations, cooldown_ms, notes, enabled FROM bot_skills ORDER BY category, name"
    );
    return rows.map(mapSkill);
  }

  async createSkill(input: Record<string, unknown>): Promise<BotSkill> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_skills (name, spell_words, hotkey, category, mana_cost, required_level, allowed_vocations, cooldown_ms, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        nullableString(input.spellWords),
        nullableString(input.hotkey),
        stringValue(input.category, "attack"),
        nonNegativeNumber(input.manaCost, 0, "manaCost"),
        nonNegativeNumber(input.requiredLevel, 0, "requiredLevel"),
        requiredString(input.allowedVocations, "allowedVocations"),
        nonNegativeNumber(input.cooldownMs, 1000, "cooldownMs"),
        nullableString(input.notes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getSkill(result.insertId);
  }

  async listAssignments(): Promise<readonly BotHuntAssignment[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, machine_id, character_id, hunt_id, status, priority, notes FROM bot_hunt_assignments ORDER BY priority, id"
    );
    return rows.map(mapAssignment);
  }

  async createAssignment(input: Record<string, unknown>): Promise<BotHuntAssignment> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_hunt_assignments (machine_id, character_id, hunt_id, status, priority, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requiredNumber(input.machineId, "machineId"),
        requiredNumber(input.characterId, "characterId"),
        requiredNumber(input.huntId, "huntId"),
        stringValue(input.status, "planned"),
        numberValue(input.priority, 100),
        nullableString(input.notes)
      ]
    );
    return this.getAssignment(result.insertId);
  }

  async listHuntSkillRules(): Promise<readonly BotHuntSkillRule[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, hunt_id, skill_id, priority, min_mana_percent, max_mana_percent, min_hp_percent, max_hp_percent, min_creatures, max_creatures, enabled, notes FROM bot_hunt_skill_rules ORDER BY priority, id"
    );
    return rows.map(mapHuntSkillRule);
  }

  async createHuntSkillRule(input: Record<string, unknown>): Promise<BotHuntSkillRule> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_hunt_skill_rules (hunt_id, skill_id, priority, min_mana_percent, max_mana_percent, min_hp_percent, max_hp_percent, min_creatures, max_creatures, enabled, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredNumber(input.huntId, "huntId"),
        requiredNumber(input.skillId, "skillId"),
        numberValue(input.priority, 100),
        nullablePercent(input.minManaPercent, "minManaPercent"),
        nullablePercent(input.maxManaPercent, "maxManaPercent"),
        nullablePercent(input.minHpPercent, "minHpPercent"),
        nullablePercent(input.maxHpPercent, "maxHpPercent"),
        nullableNumber(input.minCreatures),
        nullableNumber(input.maxCreatures),
        booleanValue(input.enabled, true),
        nullableString(input.notes)
      ]
    );
    return this.getHuntSkillRule(result.insertId);
  }

  async listLearningMethods(): Promise<readonly BotLearningMethod[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, name, method_type, scope, hunt_id, character_id, weight, mode, CAST(config_json AS CHAR) AS config_json, notes, enabled FROM bot_learning_methods ORDER BY enabled DESC, weight DESC, name"
    );
    return rows.map(mapLearningMethod);
  }

  async createLearningMethod(input: Record<string, unknown>): Promise<BotLearningMethod> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_methods (name, method_type, scope, hunt_id, character_id, weight, mode, config_json, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        stringValue(input.methodType, "manual-rules"),
        stringValue(input.scope, "global"),
        nullableNumber(input.huntId),
        nullableNumber(input.characterId),
        numberValue(input.weight, 1),
        stringValue(input.mode, "observe"),
        jsonString(input.configJson),
        nullableString(input.notes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getLearningMethod(result.insertId);
  }

  async listLearningSources(): Promise<readonly BotLearningSource[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, name, source_type, uri, content_hash, language, status, trust_level, captured_at, processed_at, CAST(metadata_json AS CHAR) AS metadata_json, notes, enabled FROM bot_learning_sources ORDER BY created_at DESC, id DESC"
    );
    return rows.map(mapLearningSource);
  }

  async createLearningSource(input: Record<string, unknown>): Promise<BotLearningSource> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_sources (name, source_type, uri, content_hash, language, status, trust_level, captured_at, metadata_json, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        stringValue(input.sourceType, "manual-note"),
        nullableString(input.uri),
        nullableString(input.contentHash),
        nullableString(input.language),
        stringValue(input.status, "pending"),
        stringValue(input.trustLevel, "medium"),
        nullableString(input.capturedAt),
        jsonString(input.metadataJson),
        nullableString(input.notes),
        booleanValue(input.enabled, true)
      ]
    );
    return this.getLearningSource(result.insertId);
  }

  async listLearningMethodSources(): Promise<readonly BotLearningMethodSource[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT method_id, source_id, role, weight FROM bot_learning_method_sources ORDER BY method_id, role, weight DESC"
    );
    return rows.map(mapLearningMethodSource);
  }

  async createLearningMethodSource(input: Record<string, unknown>): Promise<BotLearningMethodSource> {
    await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_method_sources (method_id, source_id, role, weight) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), weight = VALUES(weight)",
      [
        requiredNumber(input.methodId, "methodId"),
        requiredNumber(input.sourceId, "sourceId"),
        stringValue(input.role, "primary"),
        numberValue(input.weight, 1)
      ]
    );
    return {
      methodId: requiredNumber(input.methodId, "methodId"),
      sourceId: requiredNumber(input.sourceId, "sourceId"),
      role: stringValue(input.role, "primary") as BotLearningMethodSource["role"],
      weight: numberValue(input.weight, 1)
    };
  }

  async listLearningSessions(): Promise<readonly BotLearningSession[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, method_id, assignment_id, name, status, started_at, ended_at, CAST(summary_json AS CHAR) AS summary_json, notes FROM bot_learning_sessions ORDER BY started_at DESC, id DESC"
    );
    return rows.map(mapLearningSession);
  }

  async createLearningSession(input: Record<string, unknown>): Promise<BotLearningSession> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_sessions (method_id, assignment_id, name, status, summary_json, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [
        requiredNumber(input.methodId, "methodId"),
        nullableNumber(input.assignmentId),
        requiredString(input.name, "name"),
        stringValue(input.status, "recording"),
        jsonString(input.summaryJson),
        nullableString(input.notes)
      ]
    );
    return this.getLearningSession(result.insertId);
  }

  private async getAccount(id: number): Promise<BotAccount> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, login_identifier, secret_reference, notes, enabled FROM bot_accounts WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapAccount);
  }

  private async getCharacter(id: number): Promise<BotCharacter> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, account_id, name, world, vocation, level, enabled FROM bot_characters WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapCharacter);
  }

  private async getMachine(id: number): Promise<BotMachine> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, node_id, name, role, preferred_host, connection_notes, enabled FROM bot_machines WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapMachine);
  }

  private async getHunt(id: number): Promise<BotHunt> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, city, route_profile, min_level, notes, enabled FROM bot_hunts WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapHunt);
  }

  private async getSkill(id: number): Promise<BotSkill> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, spell_words, hotkey, category, mana_cost, required_level, allowed_vocations, cooldown_ms, notes, enabled FROM bot_skills WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapSkill);
  }

  private async getAssignment(id: number): Promise<BotHuntAssignment> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, machine_id, character_id, hunt_id, status, priority, notes FROM bot_hunt_assignments WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapAssignment);
  }

  private async getHuntSkillRule(id: number): Promise<BotHuntSkillRule> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, hunt_id, skill_id, priority, min_mana_percent, max_mana_percent, min_hp_percent, max_hp_percent, min_creatures, max_creatures, enabled, notes FROM bot_hunt_skill_rules WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapHuntSkillRule);
  }

  private async getLearningMethod(id: number): Promise<BotLearningMethod> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, method_type, scope, hunt_id, character_id, weight, mode, CAST(config_json AS CHAR) AS config_json, notes, enabled FROM bot_learning_methods WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapLearningMethod);
  }

  private async getLearningSource(id: number): Promise<BotLearningSource> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, name, source_type, uri, content_hash, language, status, trust_level, captured_at, processed_at, CAST(metadata_json AS CHAR) AS metadata_json, notes, enabled FROM bot_learning_sources WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapLearningSource);
  }

  private async getLearningSession(id: number): Promise<BotLearningSession> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, method_id, assignment_id, name, status, started_at, ended_at, CAST(summary_json AS CHAR) AS summary_json, notes FROM bot_learning_sessions WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapLearningSession);
  }
}

function mapAccount(row: RowDataPacket): BotAccount {
  return {
    id: Number(row.id),
    name: String(row.name),
    loginIdentifier: String(row.login_identifier),
    secretReference: nullableRowString(row.secret_reference),
    notes: nullableRowString(row.notes),
    enabled: Boolean(row.enabled)
  };
}

function mapCharacter(row: RowDataPacket): BotCharacter {
  return {
    id: Number(row.id),
    accountId: Number(row.account_id),
    name: String(row.name),
    world: nullableRowString(row.world),
    vocation: nullableRowString(row.vocation),
    level: nullableRowNumber(row.level),
    enabled: Boolean(row.enabled)
  };
}

function mapMachine(row: RowDataPacket): BotMachine {
  return {
    id: Number(row.id),
    nodeId: String(row.node_id),
    name: String(row.name),
    role: String(row.role),
    preferredHost: nullableRowString(row.preferred_host),
    connectionNotes: nullableRowString(row.connection_notes),
    enabled: Boolean(row.enabled)
  };
}

function mapHunt(row: RowDataPacket): BotHunt {
  return {
    id: Number(row.id),
    name: String(row.name),
    city: nullableRowString(row.city),
    routeProfile: nullableRowString(row.route_profile),
    minLevel: nullableRowNumber(row.min_level),
    notes: nullableRowString(row.notes),
    enabled: Boolean(row.enabled)
  };
}

function mapSkill(row: RowDataPacket): BotSkill {
  return {
    id: Number(row.id),
    name: String(row.name),
    spellWords: nullableRowString(row.spell_words),
    hotkey: nullableRowString(row.hotkey),
    category: row.category as BotSkill["category"],
    manaCost: Number(row.mana_cost),
    requiredLevel: Number(row.required_level),
    allowedVocations: String(row.allowed_vocations)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    cooldownMs: Number(row.cooldown_ms),
    notes: nullableRowString(row.notes),
    enabled: Boolean(row.enabled)
  };
}

function mapAssignment(row: RowDataPacket): BotHuntAssignment {
  return {
    id: Number(row.id),
    machineId: Number(row.machine_id),
    characterId: Number(row.character_id),
    huntId: Number(row.hunt_id),
    status: row.status as BotHuntAssignment["status"],
    priority: Number(row.priority),
    notes: nullableRowString(row.notes)
  };
}

function mapHuntSkillRule(row: RowDataPacket): BotHuntSkillRule {
  return {
    id: Number(row.id),
    huntId: Number(row.hunt_id),
    skillId: Number(row.skill_id),
    priority: Number(row.priority),
    minManaPercent: nullableRowNumber(row.min_mana_percent),
    maxManaPercent: nullableRowNumber(row.max_mana_percent),
    minHpPercent: nullableRowNumber(row.min_hp_percent),
    maxHpPercent: nullableRowNumber(row.max_hp_percent),
    minCreatures: nullableRowNumber(row.min_creatures),
    maxCreatures: nullableRowNumber(row.max_creatures),
    enabled: Boolean(row.enabled),
    notes: nullableRowString(row.notes)
  };
}

function mapLearningMethod(row: RowDataPacket): BotLearningMethod {
  return {
    id: Number(row.id),
    name: String(row.name),
    methodType: row.method_type as BotLearningMethod["methodType"],
    scope: row.scope as BotLearningMethod["scope"],
    huntId: nullableRowNumber(row.hunt_id),
    characterId: nullableRowNumber(row.character_id),
    weight: Number(row.weight),
    mode: row.mode as BotLearningMethod["mode"],
    configJson: nullableRowString(row.config_json),
    notes: nullableRowString(row.notes),
    enabled: Boolean(row.enabled)
  };
}

function mapLearningSession(row: RowDataPacket): BotLearningSession {
  return {
    id: Number(row.id),
    methodId: Number(row.method_id),
    assignmentId: nullableRowNumber(row.assignment_id),
    name: String(row.name),
    status: row.status as BotLearningSession["status"],
    startedAt: new Date(row.started_at as string).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
    summaryJson: nullableRowString(row.summary_json),
    notes: nullableRowString(row.notes)
  };
}

function mapLearningSource(row: RowDataPacket): BotLearningSource {
  return {
    id: Number(row.id),
    name: String(row.name),
    sourceType: row.source_type as BotLearningSource["sourceType"],
    uri: nullableRowString(row.uri),
    contentHash: nullableRowString(row.content_hash),
    language: nullableRowString(row.language),
    status: row.status as BotLearningSource["status"],
    trustLevel: row.trust_level as BotLearningSource["trustLevel"],
    capturedAt: row.captured_at ? new Date(row.captured_at as string).toISOString() : null,
    processedAt: row.processed_at ? new Date(row.processed_at as string).toISOString() : null,
    metadataJson: nullableRowString(row.metadata_json),
    notes: nullableRowString(row.notes),
    enabled: Boolean(row.enabled)
  };
}

function mapLearningMethodSource(row: RowDataPacket): BotLearningMethodSource {
  return {
    methodId: Number(row.method_id),
    sourceId: Number(row.source_id),
    role: row.role as BotLearningMethodSource["role"],
    weight: Number(row.weight)
  };
}

function mapSingle<T>(rows: RowDataPacket[], mapper: (row: RowDataPacket) => T): T {
  if (rows.length !== 1) {
    throw new Error("Record was not found after save.");
  }

  return mapper(rows[0]);
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringValue(value, "");
  if (!parsed) {
    throw new ValidationError(`Field "${field}" is required.`);
  }
  return parsed;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError(`Field "${field}" is required.`);
  }
  return parsed;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Non-negative number with a fallback. Rejects NaN and negative values. */
function nonNegativeNumber(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative number.`);
  }
  return parsed;
}

/** Optional percentage constrained to [0, 100]. */
function nullablePercent(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ValidationError(`Field "${field}" must be between 0 and 100.`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function jsonString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "null";
  }

  try {
    JSON.parse(value);
  } catch {
    throw new ValidationError("Field must contain valid JSON.");
  }
  return value;
}

function nullableRowString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableRowNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
