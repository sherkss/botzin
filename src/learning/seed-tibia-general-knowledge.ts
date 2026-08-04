import type { Pool } from "mysql2/promise";
import { TIBIA_GENERAL_KNOWLEDGE } from "./tibia-general-knowledge.generated.js";

const BATCH_SIZE = 150;

export async function seedTibiaGeneralKnowledge(pool: Pool): Promise<void> {
  const generatedAt = new Date();
  for (let offset = 0; offset < TIBIA_GENERAL_KNOWLEDGE.length; offset += BATCH_SIZE) {
    const batch = TIBIA_GENERAL_KNOWLEDGE.slice(offset, offset + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const values = batch.flatMap((entry) => [
      entry.key,
      entry.domain,
      entry.name,
      entry.summary,
      entry.content,
      JSON.stringify(entry.metadata),
      entry.sourceUrl,
      entry.sourceUpdatedAt ? new Date(entry.sourceUpdatedAt) : null,
      entry.trust,
      entry.volatile,
      generatedAt
    ]);
    await pool.query(
      `INSERT INTO bot_game_knowledge
         (knowledge_key, domain, name, summary, content, metadata_json, source_url,
          source_updated_at, trust_level, volatile, source_generated_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         domain = VALUES(domain), name = VALUES(name), summary = VALUES(summary), content = VALUES(content),
         metadata_json = VALUES(metadata_json), source_url = VALUES(source_url),
         source_updated_at = VALUES(source_updated_at), trust_level = VALUES(trust_level),
         volatile = VALUES(volatile), source_generated_at = VALUES(source_generated_at)`,
      values
    );
  }
}
