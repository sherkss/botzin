import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { seedTibiaGeneralKnowledge } from "../../src/learning/seed-tibia-general-knowledge.js";
import { get, json, loginAsViewer } from "../helpers/api.js";
import { MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER, TEST_DB } from "../helpers/test-config.js";

const pool = mysql.createPool({ host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: TEST_DB });

beforeAll(async () => {
  await seedTibiaGeneralKnowledge(pool);
  await seedTibiaGeneralKnowledge(pool);
}, 60_000);

afterAll(async () => pool.end());

describe("general Tibia knowledge API", () => {
  it("requires authentication", async () => {
    expect((await get("/api/catalog/knowledge")).status).toBe(401);
  });

  it("searches content and filters by domain", async () => {
    const token = await loginAsViewer();
    const response = await get("/api/catalog/knowledge?domain=quest&q=20%20Years%20a%20Cook&limit=5", token);
    expect(response.status).toBe(200);
    const page = await json<{ total: number; items: Array<Record<string, unknown>> }>(response);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: "20 Years a Cook Quest", domain: "quest", trust: "community" })]));
  });

  it("reports what the AI knows by domain", async () => {
    const token = await loginAsViewer();
    const response = await get("/api/catalog/knowledge/coverage", token);
    expect(response.status).toBe(200);
    const coverage = await json<{ total: number; official: number; domains: Array<{ domain: string; count: number }> }>(response);
    expect(coverage.total).toBe(4566);
    expect(coverage.official).toBeGreaterThan(30);
    expect(coverage.domains.find((entry) => entry.domain === "quest")?.count).toBe(369);
    expect(coverage.domains.find((entry) => entry.domain === "boss")?.count).toBe(316);
  });

  it("rejects unknown domains", async () => {
    const token = await loginAsViewer();
    expect((await get("/api/catalog/knowledge?domain=unknown", token)).status).toBe(400);
  });
});
