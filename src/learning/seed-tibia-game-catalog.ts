import type { Pool } from "mysql2/promise";
import {
  TIBIA_CREATURE_CATALOG,
  TIBIA_CREATURE_CATALOG_GENERATED_AT,
  TIBIA_CREATURE_CATALOG_SOURCE
} from "./tibia-creature-catalog.generated.js";
import {
  TIBIA_ITEM_CATALOG,
  TIBIA_ITEM_CATALOG_GENERATED_AT,
  TIBIA_ITEM_CATALOG_SOURCE
} from "./tibia-item-catalog.generated.js";

export async function seedTibiaGameCatalog(pool: Pool): Promise<void> {
  await seedCreatures(pool);
  await seedItems(pool);
}

export async function seedCreatures(pool: Pool): Promise<void> {
  const rows = TIBIA_CREATURE_CATALOG.map((creature) => [
    creature.race, creature.name, creature.imageUrl, creature.description, creature.behaviour,
    creature.hitpoints, creature.experience, JSON.stringify(creature.immune), JSON.stringify(creature.strong),
    JSON.stringify(creature.weakness), JSON.stringify(creature.healed), creature.canBeParalysed,
    creature.canBeSummoned, creature.summonedMana, creature.canBeConvinced, creature.convincedMana,
    creature.seesInvisible, creature.lootable, JSON.stringify(creature.loot), creature.armor, creature.mitigation,
    creature.maxDamage, JSON.stringify(creature.damageByType), JSON.stringify(creature.damageModifiers), JSON.stringify(creature.attacks),
    creature.location || null, JSON.stringify(creature.lootDetails), creature.communitySourceUrl,
    optionalMysqlDate(creature.communitySourceUpdatedAt ?? ""), TIBIA_CREATURE_CATALOG_SOURCE,
    mysqlDate(TIBIA_CREATURE_CATALOG_GENERATED_AT)
  ]);
  for (const batch of chunks(rows, 100)) {
    const placeholders = batch.map(() => `(${Array(31).fill("?").join(", ")})`).join(", ");
    await pool.execute(
      `INSERT INTO bot_creature_catalog
         (race, name, image_url, description, behaviour, hitpoints, experience, immune_json, strong_json,
          weakness_json, healed_json, can_be_paralysed, can_be_summoned, summoned_mana, can_be_convinced,
          convinced_mana, sees_invisible, lootable, loot_json, armor, mitigation, max_damage, damage_by_type_json,
          damage_modifiers_json, attacks_json, location, loot_details_json, community_source_url, community_source_updated_at,
          source_url, source_generated_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE name=VALUES(name), image_url=VALUES(image_url), description=VALUES(description),
         behaviour=VALUES(behaviour), hitpoints=VALUES(hitpoints), experience=VALUES(experience),
         immune_json=VALUES(immune_json), strong_json=VALUES(strong_json), weakness_json=VALUES(weakness_json),
         healed_json=VALUES(healed_json), can_be_paralysed=VALUES(can_be_paralysed),
         can_be_summoned=VALUES(can_be_summoned), summoned_mana=VALUES(summoned_mana),
         can_be_convinced=VALUES(can_be_convinced), convinced_mana=VALUES(convinced_mana),
         sees_invisible=VALUES(sees_invisible), lootable=VALUES(lootable), loot_json=VALUES(loot_json),
         armor=VALUES(armor), mitigation=VALUES(mitigation), max_damage=VALUES(max_damage),
         damage_by_type_json=VALUES(damage_by_type_json), damage_modifiers_json=VALUES(damage_modifiers_json),
         attacks_json=VALUES(attacks_json), location=VALUES(location), loot_details_json=VALUES(loot_details_json),
         community_source_url=VALUES(community_source_url), community_source_updated_at=VALUES(community_source_updated_at),
         source_url=VALUES(source_url), source_generated_at=VALUES(source_generated_at)`,
      batch.flat()
    );
  }
}

export async function seedItems(pool: Pool): Promise<void> {
  const rows = TIBIA_ITEM_CATALOG.map((item) => [
    item.sourceId, item.name, item.categorySlug, item.categoryName, item.primaryType, item.secondaryType,
    item.objectClass, item.wikiUrl, item.imagePath, optionalMysqlDate(item.sourceUpdatedAt),
    TIBIA_ITEM_CATALOG_SOURCE, mysqlDate(TIBIA_ITEM_CATALOG_GENERATED_AT)
  ]);
  for (const batch of chunks(rows, 400)) {
    const placeholders = batch.map(() => `(${Array(12).fill("?").join(", ")})`).join(", ");
    await pool.execute(
      `INSERT INTO bot_item_catalog
         (source_id, name, category_slug, category_name, primary_type, secondary_type, object_class, wiki_url,
          image_path, source_updated_at, source_url, source_generated_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE name=VALUES(name), category_slug=VALUES(category_slug),
         category_name=VALUES(category_name), primary_type=VALUES(primary_type), secondary_type=VALUES(secondary_type),
         object_class=VALUES(object_class), wiki_url=VALUES(wiki_url), image_path=VALUES(image_path),
         source_updated_at=VALUES(source_updated_at), source_url=VALUES(source_url),
         source_generated_at=VALUES(source_generated_at)`,
      batch.flat()
    );
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function mysqlDate(value: string): string {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function optionalMysqlDate(value: string): string | null {
  return value ? mysqlDate(value) : null;
}
