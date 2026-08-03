import { beforeAll, describe, expect, it } from "vitest";
import { get, json, loginAsOperator, post } from "../helpers/api.js";
import { createAccount, createCharacter, createHunt, createMachine, createAssignment } from "../helpers/fixtures.js";

describe("hunt telemetry", () => {
  let token: string;
  let characterId: number;
  let huntId: number;
  let assignmentId: number;

  beforeAll(async () => {
    token = await loginAsOperator();
    const account = await createAccount(token);
    const character = await createCharacter(token, account.id as number);
    const hunt = await createHunt(token);
    const machine = await createMachine(token);
    const assignment = await createAssignment(token, machine.id as number, character.id as number, hunt.id as number, { status: "active" });
    characterId = character.id as number;
    huntId = hunt.id as number;
    assignmentId = assignment.id as number;
  });

  it("imports copied Session Analyser text and resolves the active assignment", async () => {
    const response = await post("/api/hunt-telemetry/import-analyser", {
      characterId,
      huntId,
      xpRatePercent: 150,
      rawText: "Session: 00:30h\nXP Gain: 150,000\nRaw XP Gain: 100,000\nXP/h: 300,000\nRaw XP/h: 200,000\nLoot: 80,000\nSupplies: 30,000\nBalance: 50,000\nKilled Monsters:\n120x Dragon"
    }, token);

    expect(response.status).toBe(201);
    const sample = await json<Record<string, unknown>>(response);
    expect(sample.assignmentId).toBe(assignmentId);
    expect(sample.durationSeconds).toBe(1_800);
    expect(sample.xpPerHour).toBe(300_000);
    expect(sample.rawXpPerHour).toBe(200_000);
    expect(sample.profit).toBe(50_000);
    expect(JSON.parse(sample.creaturesJson as string)).toEqual({ Dragon: 120 });
  });

  it("filters history by character", async () => {
    const response = await get(`/api/hunt-telemetry?characterId=${characterId}`, token);
    expect(response.status).toBe(200);
    const body = await json<{ samples: Array<{ characterId: number }> }>(response);
    expect(body.samples.length).toBeGreaterThan(0);
    expect(body.samples.every((sample) => sample.characterId === characterId)).toBe(true);
  });

  it("rejects text without analyser fields", async () => {
    const response = await post("/api/hunt-telemetry/import-analyser", { characterId, huntId, rawText: "texto qualquer" }, token);
    expect(response.status).toBe(400);
  });
});
