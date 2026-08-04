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

export interface CatalogPage<T> {
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly items: readonly T[];
}

export class GameCatalogRepository {
  constructor(private readonly pool: Pool) {}

  async searchCreatures(query: string, limit: number, offset: number): Promise<CatalogPage<CreatureCatalogRecord>> {
    const pattern = `%${escapeLike(query)}%`;
    const where = query ? "WHERE name LIKE ? ESCAPE '\\\\' OR race LIKE ? ESCAPE '\\\\'" : "";
    const parameters = query ? [pattern, pattern] : [];
    const [countRows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM bot_creature_catalog ${where}`,
      parameters
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, race, name, image_url, description, behaviour, hitpoints, experience,
              CAST(immune_json AS CHAR) AS immune_json, CAST(strong_json AS CHAR) AS strong_json,
              CAST(weakness_json AS CHAR) AS weakness_json, CAST(healed_json AS CHAR) AS healed_json,
              can_be_paralysed, can_be_summoned, summoned_mana, can_be_convinced, convinced_mana,
              sees_invisible, lootable, CAST(loot_json AS CHAR) AS loot_json, source_url
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
    lootable: Boolean(row.lootable), loot: jsonStringArray(row.loot_json), sourceUrl: String(row.source_url)
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

function jsonStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
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
