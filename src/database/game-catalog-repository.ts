import type { Pool, RowDataPacket } from "mysql2/promise";

export interface CreatureCatalogRecord {
  readonly id: number;
  readonly race: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly description: string | null;
  readonly behaviour: string | null;
  readonly hitpoints: number;
  readonly experience: number;
  readonly immune: readonly string[];
  readonly strong: readonly string[];
  readonly weakness: readonly string[];
  readonly healed: readonly string[];
  readonly canBeParalysed: boolean;
  readonly canBeSummoned: boolean;
  readonly summonedMana: number;
  readonly canBeConvinced: boolean;
  readonly convincedMana: number;
  readonly seesInvisible: boolean;
  readonly lootable: boolean;
  readonly loot: readonly string[];
  readonly armor: number;
  readonly mitigation: number;
  readonly maxDamage: number;
  readonly damageByType: Readonly<Record<string, number>>;
  readonly damageModifiers: Readonly<Record<string, number>>;
  readonly attacks: readonly { name: string; element: string; minimum: number; maximum: number }[];
  readonly location: string | null;
  readonly lootDetails: readonly { itemName: string; amount: string | null; rarity: string | null }[];
  readonly communitySourceUrl: string | null;
  readonly communitySourceUpdatedAt: string | null;
  readonly sourceUrl: string;
}

export interface ItemCatalogRecord {
  readonly id: number;
  readonly sourceId: number;
  readonly name: string;
  readonly categorySlug: string | null;
  readonly categoryName: string | null;
  readonly primaryType: string | null;
  readonly secondaryType: string | null;
  readonly objectClass: string | null;
  readonly wikiUrl: string | null;
  readonly imagePath: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly sourceUrl: string;
}

export interface GameKnowledgeRecord {
  readonly id: number;
  readonly key: string;
  readonly domain: string;
  readonly name: string;
  readonly summary: string | null;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sourceUrl: string;
  readonly sourceUpdatedAt: string | null;
  readonly trust: "official" | "community" | "user";
  readonly volatile: boolean;
}

export interface GameKnowledgeCoverage {
  readonly total: number;
  readonly official: number;
  readonly community: number;
  readonly user: number;
  readonly volatile: number;
  readonly domains: readonly { readonly domain: string; readonly count: number }[];
}

export interface CatalogPage<T> {
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly items: readonly T[];
}

export class GameCatalogRepository {
  constructor(private readonly pool: Pool) {}

  async listCreatureAnimationSources(): Promise<readonly Pick<CreatureCatalogRecord, "id" | "race" | "name" | "imageUrl">[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, race, name, image_url FROM bot_creature_catalog ORDER BY name"
    );
    return rows.map((row) => ({
      id: Number(row.id),
      race: String(row.race),
      name: String(row.name),
      imageUrl: nullableString(row.image_url)
    }));
  }

  async findCreatureByRace(race: string): Promise<CreatureCatalogRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, race, name, image_url, description, behaviour, hitpoints, experience,
              CAST(immune_json AS CHAR) AS immune_json, CAST(strong_json AS CHAR) AS strong_json,
              CAST(weakness_json AS CHAR) AS weakness_json, CAST(healed_json AS CHAR) AS healed_json,
              can_be_paralysed, can_be_summoned, summoned_mana, can_be_convinced, convinced_mana,
              sees_invisible, lootable, CAST(loot_json AS CHAR) AS loot_json, armor, mitigation, max_damage,
              CAST(damage_by_type_json AS CHAR) AS damage_by_type_json, CAST(damage_modifiers_json AS CHAR) AS damage_modifiers_json,
              CAST(attacks_json AS CHAR) AS attacks_json, location, CAST(loot_details_json AS CHAR) AS loot_details_json,
              community_source_url, community_source_updated_at, source_url
         FROM bot_creature_catalog WHERE race = ? LIMIT 1`,
      [race]
    );
    return rows[0] ? mapCreature(rows[0]) : null;
  }

  async searchCreatures(query: string, limit: number, offset: number): Promise<CatalogPage<CreatureCatalogRecord>> {
    const pattern = `%${escapeLike(query)}%`;
    const where = query ? "WHERE name LIKE ? ESCAPE '\\\\' OR race LIKE ? ESCAPE '\\\\' OR location LIKE ? ESCAPE '\\\\' OR CAST(loot_details_json AS CHAR) LIKE ? ESCAPE '\\\\'" : "";
    const parameters = query ? [pattern, pattern, pattern, pattern] : [];
    const [countRows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM bot_creature_catalog ${where}`,
      parameters
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, race, name, image_url, description, behaviour, hitpoints, experience,
              CAST(immune_json AS CHAR) AS immune_json, CAST(strong_json AS CHAR) AS strong_json,
              CAST(weakness_json AS CHAR) AS weakness_json, CAST(healed_json AS CHAR) AS healed_json,
              can_be_paralysed, can_be_summoned, summoned_mana, can_be_convinced, convinced_mana,
              sees_invisible, lootable, CAST(loot_json AS CHAR) AS loot_json, armor, mitigation, max_damage,
              CAST(damage_by_type_json AS CHAR) AS damage_by_type_json, CAST(damage_modifiers_json AS CHAR) AS damage_modifiers_json,
              CAST(attacks_json AS CHAR) AS attacks_json, location, CAST(loot_details_json AS CHAR) AS loot_details_json,
              community_source_url, community_source_updated_at, source_url
         FROM bot_creature_catalog ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...parameters, limit, offset]
    );
    return { query, limit, offset, total: Number(countRows[0]?.total ?? 0), items: rows.map(mapCreature) };
  }

  async searchItems(query: string, limit: number, offset: number): Promise<CatalogPage<ItemCatalogRecord>> {
    const pattern = `%${escapeLike(query)}%`;
    const where = query
      ? "WHERE name LIKE ? ESCAPE '\\\\' OR category_name LIKE ? ESCAPE '\\\\' OR primary_type LIKE ? ESCAPE '\\\\'"
      : "";
    const parameters = query ? [pattern, pattern, pattern] : [];
    const [countRows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM bot_item_catalog ${where}`,
      parameters
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, source_id, name, category_slug, category_name, primary_type, secondary_type, object_class,
              wiki_url, image_path, source_updated_at, source_url
         FROM bot_item_catalog ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...parameters, limit, offset]
    );
    return { query, limit, offset, total: Number(countRows[0]?.total ?? 0), items: rows.map(mapItem) };
  }

  async searchKnowledge(query: string, domain: string | null, limit: number, offset: number): Promise<CatalogPage<GameKnowledgeRecord>> {
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    if (domain) { clauses.push("domain = ?"); parameters.push(domain); }
    if (query) {
      const pattern = `%${escapeLike(query)}%`;
      clauses.push("(name LIKE ? ESCAPE '\\\\' OR summary LIKE ? ESCAPE '\\\\' OR content LIKE ? ESCAPE '\\\\')");
      parameters.push(pattern, pattern, pattern);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [countRows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM bot_game_knowledge ${where}`,
      parameters
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, knowledge_key, domain, name, summary, content, CAST(metadata_json AS CHAR) AS metadata_json,
              source_url, source_updated_at, trust_level, volatile
         FROM bot_game_knowledge ${where} ORDER BY domain, name LIMIT ? OFFSET ?`,
      [...parameters, limit, offset]
    );
    return { query, limit, offset, total: Number(countRows[0]?.total ?? 0), items: rows.map(mapKnowledge) };
  }

  async knowledgeCoverage(): Promise<GameKnowledgeCoverage> {
    const [totals] = await this.pool.query<Array<RowDataPacket & { total: number; official: number; community: number; user: number; volatile: number }>>(
      `SELECT COUNT(*) AS total,
              SUM(trust_level = 'official') AS official,
              SUM(trust_level = 'community') AS community,
              SUM(trust_level = 'user') AS user,
              SUM(volatile = TRUE) AS volatile
         FROM bot_game_knowledge`
    );
    const [domains] = await this.pool.query<Array<RowDataPacket & { domain: string; count: number }>>(
      "SELECT domain, COUNT(*) AS count FROM bot_game_knowledge GROUP BY domain ORDER BY domain"
    );
    const total = totals[0];
    return {
      total: Number(total?.total ?? 0), official: Number(total?.official ?? 0),
      community: Number(total?.community ?? 0), user: Number(total?.user ?? 0), volatile: Number(total?.volatile ?? 0),
      domains: domains.map((row) => ({ domain: String(row.domain), count: Number(row.count) }))
    };
  }
}

function mapCreature(row: RowDataPacket): CreatureCatalogRecord {
  return {
    id: Number(row.id), race: String(row.race), name: String(row.name), imageUrl: nullableString(row.image_url),
    description: nullableString(row.description), behaviour: nullableString(row.behaviour),
    hitpoints: Number(row.hitpoints), experience: Number(row.experience), immune: jsonStringArray(row.immune_json),
    strong: jsonStringArray(row.strong_json), weakness: jsonStringArray(row.weakness_json), healed: jsonStringArray(row.healed_json),
    canBeParalysed: Boolean(row.can_be_paralysed), canBeSummoned: Boolean(row.can_be_summoned),
    summonedMana: Number(row.summoned_mana), canBeConvinced: Boolean(row.can_be_convinced),
    convincedMana: Number(row.convinced_mana), seesInvisible: Boolean(row.sees_invisible),
    lootable: Boolean(row.lootable), loot: jsonStringArray(row.loot_json), armor: Number(row.armor), mitigation: Number(row.mitigation),
    maxDamage: Number(row.max_damage), damageByType: jsonNumberObject(row.damage_by_type_json), damageModifiers: jsonNumberObject(row.damage_modifiers_json),
    attacks: jsonArray(row.attacks_json) as CreatureCatalogRecord["attacks"], location: nullableString(row.location),
    lootDetails: jsonArray(row.loot_details_json) as CreatureCatalogRecord["lootDetails"],
    communitySourceUrl: nullableString(row.community_source_url), communitySourceUpdatedAt: dateString(row.community_source_updated_at),
    sourceUrl: String(row.source_url)
  };
}

function mapItem(row: RowDataPacket): ItemCatalogRecord {
  return {
    id: Number(row.id), sourceId: Number(row.source_id), name: String(row.name),
    categorySlug: nullableString(row.category_slug), categoryName: nullableString(row.category_name),
    primaryType: nullableString(row.primary_type), secondaryType: nullableString(row.secondary_type),
    objectClass: nullableString(row.object_class), wikiUrl: nullableString(row.wiki_url),
    imagePath: nullableString(row.image_path), sourceUpdatedAt: dateString(row.source_updated_at),
    sourceUrl: String(row.source_url)
  };
}

function mapKnowledge(row: RowDataPacket): GameKnowledgeRecord {
  return {
    id: Number(row.id), key: String(row.knowledge_key), domain: String(row.domain), name: String(row.name),
    summary: nullableString(row.summary), content: String(row.content), metadata: jsonObject(row.metadata_json),
    sourceUrl: String(row.source_url), sourceUpdatedAt: dateString(row.source_updated_at),
    trust: row.trust_level === "official" ? "official" : row.trust_level === "user" ? "user" : "community",
    volatile: Boolean(row.volatile)
  };
}

function jsonStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function jsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function jsonNumberObject(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(jsonObject(value)).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return nullableString(value);
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
