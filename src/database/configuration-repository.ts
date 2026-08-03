import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { ValidationError } from "../core/errors.js";
import type {
  BotAccount,
  BotCharacter,
  BotConfigurationSnapshot,
  BotHunt,
  BotHuntAssignment,
  BotHuntSkillRule,
  BotDecisionFeedback,
  BotLearningEvent,
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
      learningSessions,
      learningEvents,
      decisionFeedback
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
      this.listLearningSessions(),
      this.listLearningEvents(),
      this.listDecisionFeedback()
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
      learningSessions,
      learningEvents,
      decisionFeedback
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
        nullableNonNegativeInteger(input.level, "level"),
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
        enumValue(input.role, ["perception", "coordinator", "raspberry-executor"] as const, "perception", "role"),
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
        nullableNonNegativeInteger(input.minLevel, "minLevel"),
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
        enumValue(input.category, ["attack", "healing", "support", "utility"] as const, "attack", "category"),
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
        enumValue(input.status, ["planned", "active", "paused", "disabled"] as const, "planned", "status"),
        integerValue(input.priority, 100, "priority"),
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
    assertOrderedRange(input.minManaPercent, input.maxManaPercent, "mana percent");
    assertOrderedRange(input.minHpPercent, input.maxHpPercent, "HP percent");
    assertOrderedRange(input.minCreatures, input.maxCreatures, "creatures");
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_hunt_skill_rules (hunt_id, skill_id, priority, min_mana_percent, max_mana_percent, min_hp_percent, max_hp_percent, min_creatures, max_creatures, enabled, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredNumber(input.huntId, "huntId"),
        requiredNumber(input.skillId, "skillId"),
        integerValue(input.priority, 100, "priority"),
        nullablePercent(input.minManaPercent, "minManaPercent"),
        nullablePercent(input.maxManaPercent, "maxManaPercent"),
        nullablePercent(input.minHpPercent, "minHpPercent"),
        nullablePercent(input.maxHpPercent, "maxHpPercent"),
        nullableNonNegativeInteger(input.minCreatures, "minCreatures"),
        nullableNonNegativeInteger(input.maxCreatures, "maxCreatures"),
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
    const scope = enumValue(input.scope, ["global", "hunt", "character", "party"] as const, "global", "scope");
    const huntId = optionalId(input.huntId, "huntId");
    const characterId = optionalId(input.characterId, "characterId");
    if (scope === "hunt" && huntId === null) {
      throw new ValidationError('Field "huntId" is required when scope is "hunt".');
    }
    if (scope === "character" && characterId === null) {
      throw new ValidationError('Field "characterId" is required when scope is "character".');
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_methods (name, method_type, scope, hunt_id, character_id, weight, mode, config_json, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        enumValue(input.methodType, ["manual-rules", "human-demonstration", "replay", "human-feedback", "hunt-telemetry", "external-knowledge"] as const, "manual-rules", "methodType"),
        scope,
        huntId,
        characterId,
        nonNegativeNumber(input.weight, 1, "weight"),
        enumValue(input.mode, ["observe", "suggest", "execute"] as const, "observe", "mode"),
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
    const contentHash = nullableString(input.contentHash);
    if (contentHash && !/^[a-f0-9]{64}$/i.test(contentHash)) {
      throw new ValidationError('Field "contentHash" must be a SHA-256 hash.');
    }
    if (contentHash) {
      const [duplicates] = await this.pool.execute<RowDataPacket[]>(
        "SELECT id FROM bot_learning_sources WHERE content_hash = ? LIMIT 1",
        [contentHash.toLowerCase()]
      );
      if (duplicates.length > 0) {
        throw new ValidationError("A learning source with this content hash already exists.");
      }
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_sources (name, source_type, uri, content_hash, language, status, trust_level, captured_at, metadata_json, notes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        requiredString(input.name, "name"),
        enumValue(input.sourceType, ["video", "image", "text", "web-page", "market-snapshot", "obs-recording", "replay", "telemetry", "manual-note"] as const, "manual-note", "sourceType"),
        nullableString(input.uri),
        contentHash?.toLowerCase() ?? null,
        nullableString(input.language),
        enumValue(input.status, ["pending", "processing", "ready", "failed", "archived"] as const, "pending", "status"),
        enumValue(input.trustLevel, ["low", "medium", "high", "verified"] as const, "low", "trustLevel"),
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
        enumValue(input.role, ["primary", "validation", "reference", "negative-example"] as const, "primary", "role"),
        nonNegativeNumber(input.weight, 1, "weight")
      ]
    );
    return {
      methodId: requiredNumber(input.methodId, "methodId"),
      sourceId: requiredNumber(input.sourceId, "sourceId"),
      role: enumValue(input.role, ["primary", "validation", "reference", "negative-example"] as const, "primary", "role"),
      weight: nonNegativeNumber(input.weight, 1, "weight")
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
        optionalId(input.assignmentId, "assignmentId"),
        requiredString(input.name, "name"),
        enumValue(input.status, ["recording", "reviewing", "approved", "rejected", "archived"] as const, "recording", "status"),
        jsonString(input.summaryJson),
        nullableString(input.notes)
      ]
    );
    return this.getLearningSession(result.insertId);
  }

  async listLearningEvents(): Promise<readonly BotLearningEvent[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, session_id, event_type, occurred_at, CAST(state_json AS CHAR) AS state_json, CAST(action_json AS CHAR) AS action_json, reward, notes FROM bot_learning_events ORDER BY occurred_at, id"
    );
    return rows.map(mapLearningEvent);
  }

  async createLearningEvent(input: Record<string, unknown>): Promise<BotLearningEvent> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_learning_events (session_id, event_type, occurred_at, state_json, action_json, reward, notes) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?)",
      [
        requiredNumber(input.sessionId, "sessionId"),
        requiredString(input.eventType, "eventType"),
        nullableString(input.occurredAt),
        jsonString(input.stateJson),
        jsonString(input.actionJson),
        nullableFiniteNumber(input.reward, "reward"),
        nullableString(input.notes)
      ]
    );
    return this.getLearningEvent(result.insertId);
  }

  async listDecisionFeedback(): Promise<readonly BotDecisionFeedback[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, learning_event_id, assignment_id, rating, CAST(correction_action_json AS CHAR) AS correction_action_json, notes, created_at FROM bot_decision_feedback ORDER BY created_at, id"
    );
    return rows.map(mapDecisionFeedback);
  }

  async createDecisionFeedback(input: Record<string, unknown>): Promise<BotDecisionFeedback> {
    const learningEventId = optionalId(input.learningEventId, "learningEventId");
    const assignmentId = optionalId(input.assignmentId, "assignmentId");
    if (learningEventId === null && assignmentId === null) {
      throw new ValidationError('At least one of "learningEventId" or "assignmentId" is required.');
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO bot_decision_feedback (learning_event_id, assignment_id, rating, correction_action_json, notes) VALUES (?, ?, ?, ?, ?)",
      [
        learningEventId,
        assignmentId,
        enumValue(input.rating, ["good", "bad", "unsafe", "unknown"] as const, "unknown", "rating"),
        jsonString(input.correctionActionJson),
        nullableString(input.notes)
      ]
    );
    return this.getDecisionFeedback(result.insertId);
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

  private async getLearningEvent(id: number): Promise<BotLearningEvent> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, session_id, event_type, occurred_at, CAST(state_json AS CHAR) AS state_json, CAST(action_json AS CHAR) AS action_json, reward, notes FROM bot_learning_events WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapLearningEvent);
  }

  private async getDecisionFeedback(id: number): Promise<BotDecisionFeedback> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id, learning_event_id, assignment_id, rating, CAST(correction_action_json AS CHAR) AS correction_action_json, notes, created_at FROM bot_decision_feedback WHERE id = ?",
      [id]
    );
    return mapSingle(rows, mapDecisionFeedback);
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

function mapLearningEvent(row: RowDataPacket): BotLearningEvent {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    eventType: String(row.event_type),
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    stateJson: nullableRowString(row.state_json),
    actionJson: nullableRowString(row.action_json),
    reward: nullableRowNumber(row.reward),
    notes: nullableRowString(row.notes)
  };
}

function mapDecisionFeedback(row: RowDataPacket): BotDecisionFeedback {
  return {
    id: Number(row.id),
    learningEventId: nullableRowNumber(row.learning_event_id),
    assignmentId: nullableRowNumber(row.assignment_id),
    rating: row.rating as BotDecisionFeedback["rating"],
    correctionActionJson: nullableRowString(row.correction_action_json),
    notes: nullableRowString(row.notes),
    createdAt: new Date(row.created_at as string).toISOString()
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
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Field "${field}" is required.`);
  }
  return parsed;
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

function optionalId(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredNumber(value, field);
}

function nullableNonNegativeInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative integer.`);
  }
  return parsed;
}

function integerValue(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ValidationError(`Field "${field}" must be an integer.`);
  }
  return parsed;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function jsonString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    throw new ValidationError("Field must contain valid JSON.");
  }
}

function nullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`Field "${field}" must be a number.`);
  return parsed;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  field: string
): T[number] {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(`Field "${field}" must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

function assertOrderedRange(minimum: unknown, maximum: unknown, label: string): void {
  if (minimum === undefined || minimum === null || minimum === "" || maximum === undefined || maximum === null || maximum === "") return;
  const min = Number(minimum);
  const max = Number(maximum);
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    throw new ValidationError(`Minimum ${label} cannot exceed maximum ${label}.`);
  }
}

function nullableRowString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableRowNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
