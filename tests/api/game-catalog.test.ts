import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { seedTibiaGameCatalog } from "../../src/learning/seed-tibia-game-catalog.js";
import { get, json, loginAsViewer } from "../helpers/api.js";
import { MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER, TEST_DB } from "../helpers/test-config.js";

const pool = mysql.createPool({ host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: TEST_DB });

beforeAll(async () => {
  await seedTibiaGameCatalog(pool);
}, 30_000);

afterAll(async () => pool.end());

describe("game catalog API", () => {
  it("requires authentication", async () => {
    expect((await get("/api/catalog/creatures")).status).toBe(401);
  });

  it("searches official creatures with combat details", async () => {
    const token = await loginAsViewer();
    const response = await get("/api/catalog/creatures?q=dragon&limit=10", token);
    expect(response.status).toBe(200);
    const page = await json<{ total: number; items: Array<Record<string, unknown>> }>(response);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.some((entry) => entry.race === "dragon" && entry.hitpoints === 1000)).toBe(true);
  });

  it("searches items by name and category", async () => {
    const token = await loginAsViewer();
    const response = await get("/api/catalog/items?q=Magic%20Plate%20Armor&limit=5", token);
    expect(response.status).toBe(200);
    const page = await json<{ total: number; items: Array<Record<string, unknown>> }>(response);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ name: "Magic Plate Armor", primaryType: "Armors" });
  });

  it("validates pagination", async () => {
    const token = await loginAsViewer();
    expect((await get("/api/catalog/items?limit=101", token)).status).toBe(400);
    expect((await get("/api/catalog/items?offset=-1", token)).status).toBe(400);
  });
});
