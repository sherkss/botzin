import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";

describe("POST /api/skills", () => {
  let opToken: string;

  beforeAll(async () => {
    opToken = await loginAsOperator();
  });

  it("creates skill with all fields and returns 201", async () => {
    const res = await post(
      "/api/skills",
      {
        name: "Exori Gran",
        spellWords: "exori gran",
        hotkey: "F1",
        category: "attack",
        manaCost: 340,
        requiredLevel: 130,
        allowedVocations: "knight",
        cooldownMs: 2000,
        notes: "AOE attack",
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Exori Gran");
    expect(body.spellWords).toBe("exori gran");
    expect(body.hotkey).toBe("F1");
    expect(body.category).toBe("attack");
    expect(body.manaCost).toBe(340);
    expect(body.requiredLevel).toBe(130);
    expect(body.cooldownMs).toBe(2000);
    expect(body.notes).toBe("AOE attack");
    expect(body.enabled).toBe(true);
  });

  it("allowedVocations is stored as CSV and returned as an array of strings", async () => {
    const res = await post(
      "/api/skills",
      {
        name: "Exura Gran",
        allowedVocations: "knight, paladin, druid, sorcerer"
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<{ allowedVocations: unknown[] }>(res);
    expect(Array.isArray(body.allowedVocations)).toBe(true);
    expect(body.allowedVocations).toEqual(["knight", "paladin", "druid", "sorcerer"]);
  });

  it("defaults: category='attack', manaCost=0, requiredLevel=0, cooldownMs=1000", async () => {
    const res = await post(
      "/api/skills",
      { name: "Default Skill", allowedVocations: "knight" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.category).toBe("attack");
    expect(body.manaCost).toBe(0);
    expect(body.requiredLevel).toBe(0);
    expect(body.cooldownMs).toBe(1000);
  });

  it("manaCost=0 is valid (mana-free skills)", async () => {
    const res = await post(
      "/api/skills",
      { name: "Free Skill", allowedVocations: "knight", manaCost: 0 },
      opToken
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/skills", { allowedVocations: "knight" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 400 when allowedVocations is missing", async () => {
    const res = await post("/api/skills", { name: "No Vocations" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"allowedVocations"');
  });

  it("returns 400 when manaCost is negative", async () => {
    const res = await post(
      "/api/skills",
      { name: "Neg Mana", allowedVocations: "knight", manaCost: -1 },
      opToken
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("manaCost");
  });

  it("returns 400 when cooldownMs is negative", async () => {
    const res = await post(
      "/api/skills",
      { name: "Neg CD", allowedVocations: "knight", cooldownMs: -500 },
      opToken
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("cooldownMs");
  });

  it("returns 409 on duplicate name", async () => {
    const payload = { name: "Dup Skill", allowedVocations: "knight" };
    await post("/api/skills", payload, opToken);
    const res = await post("/api/skills", payload, opToken);
    expect(res.status).toBe(409);
  });
});
