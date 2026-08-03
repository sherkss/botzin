import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";
import { createHunt, createSkill } from "../helpers/fixtures.js";

describe("POST /api/hunt-skill-rules", () => {
  let opToken: string;
  let huntId: number;
  let skillId: number;

  beforeAll(async () => {
    opToken = await loginAsOperator();
    const [hunt, skill] = await Promise.all([
      createHunt(opToken, { name: "Rules Hunt" }),
      createSkill(opToken, { name: "Rules Skill", allowedVocations: "knight" })
    ]);
    huntId = hunt.id as number;
    skillId = skill.id as number;
  });

  it("creates rule with all fields and returns 201", async () => {
    const res = await post(
      "/api/hunt-skill-rules",
      {
        huntId,
        skillId,
        priority: 10,
        minManaPercent: 20,
        maxManaPercent: 100,
        minHpPercent: 50,
        maxHpPercent: 100,
        minCreatures: 2,
        maxCreatures: 5,
        enabled: true,
        notes: "Burst when mana high"
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.huntId).toBe(huntId);
    expect(body.skillId).toBe(skillId);
    expect(body.priority).toBe(10);
    expect(body.minManaPercent).toBe(20);
    expect(body.maxManaPercent).toBe(100);
    expect(body.minHpPercent).toBe(50);
    expect(body.maxHpPercent).toBe(100);
    expect(body.minCreatures).toBe(2);
    expect(body.maxCreatures).toBe(5);
    expect(body.enabled).toBe(true);
    expect(body.notes).toBe("Burst when mana high");
  });

  it("optional percent/creature fields default to null", async () => {
    const hunt2 = await createHunt(opToken, { name: "Minimal Rule Hunt" });
    const skill2 = await createSkill(opToken, { name: "Minimal Rule Skill", allowedVocations: "druid" });

    const res = await post(
      "/api/hunt-skill-rules",
      { huntId: hunt2.id, skillId: skill2.id },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.minManaPercent).toBeNull();
    expect(body.maxManaPercent).toBeNull();
    expect(body.minHpPercent).toBeNull();
    expect(body.maxHpPercent).toBeNull();
    expect(body.minCreatures).toBeNull();
    expect(body.maxCreatures).toBeNull();
  });

  it("returns 400 when minManaPercent exceeds 100", async () => {
    const hunt3 = await createHunt(opToken, { name: "Over Percent Hunt" });
    const skill3 = await createSkill(opToken, { name: "Over Percent Skill", allowedVocations: "paladin" });

    const res = await post(
      "/api/hunt-skill-rules",
      { huntId: hunt3.id, skillId: skill3.id, minManaPercent: 101 },
      opToken
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("minManaPercent");
    expect(body.error).toContain("100");
  });

  it("returns 400 when maxHpPercent is negative", async () => {
    const hunt4 = await createHunt(opToken, { name: "Neg HP Hunt" });
    const skill4 = await createSkill(opToken, { name: "Neg HP Skill", allowedVocations: "sorcerer" });

    const res = await post(
      "/api/hunt-skill-rules",
      { huntId: hunt4.id, skillId: skill4.id, maxHpPercent: -10 },
      opToken
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("maxHpPercent");
  });

  it("returns 400 when huntId is missing", async () => {
    const res = await post("/api/hunt-skill-rules", { skillId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"huntId"');
  });

  it("returns 400 when skillId is missing", async () => {
    const res = await post("/api/hunt-skill-rules", { huntId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"skillId"');
  });

  it("returns 409 on duplicate (huntId, skillId) pair", async () => {
    // The first test already created a rule for (huntId, skillId).
    const res = await post("/api/hunt-skill-rules", { huntId, skillId }, opToken);
    expect(res.status).toBe(409);
  });
});
