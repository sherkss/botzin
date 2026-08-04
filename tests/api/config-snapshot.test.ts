import { describe, it, expect, beforeAll } from "vitest";
import { get, json, loginAsAdmin, loginAsViewer, loginAsOperator } from "../helpers/api.js";
import { createAccount, createCharacter, createHunt, createSkill, createMachine } from "../helpers/fixtures.js";

describe("GET /api/config", () => {
  it("returns 401 without a token", async () => {
    const res = await get("/api/config");
    expect(res.status).toBe(401);
  });

  it("returns 200 for viewer role — viewers are allowed to read config", async () => {
    const token = await loginAsViewer();
    const res = await get("/api/config", token);
    expect(res.status).toBe(200);
  });

  it("returns all top-level collections when DB is empty", async () => {
    const token = await loginAsAdmin();
    const res = await get("/api/config", token);

    expect(res.status).toBe(200);
    const snapshot = await json<Record<string, unknown[]>>(res);

    const expected = [
      "accounts", "characters", "machines", "hunts", "skills",
      "assignments", "huntSkillRules", "huntTelemetry", "characterRuns", "learningMethods", "learningSources",
      "learningMethodSources", "learningSessions", "learningEvents", "decisionFeedback"
    ];
    for (const key of expected) {
      expect(Array.isArray(snapshot[key]), `${key} should be an array`).toBe(true);
      expect(snapshot[key]).toHaveLength(0);
    }
  });

  it("reflects a newly created account in the snapshot", async () => {
    const opToken = await loginAsOperator();
    const account = await createAccount(opToken, {
      name: "Snapshot Account",
      loginIdentifier: "snapshot@example.com"
    });

    const adminToken = await loginAsAdmin();
    const res = await get("/api/config", adminToken);
    const snapshot = await json<{ accounts: Record<string, unknown>[] }>(res);

    const found = snapshot.accounts.find((a) => a.id === account.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Snapshot Account");
    expect(found!.loginIdentifier).toBe("snapshot@example.com");
  });

  it("reflects a hunt, skill, and character in the snapshot after creation", async () => {
    const opToken = await loginAsOperator();
    const account = await createAccount(opToken, { loginIdentifier: "snap2@example.com" });

    const [hunt, skill, machine, character] = await Promise.all([
      createHunt(opToken, { name: "Snapshot Hunt", city: "Edron" }),
      createSkill(opToken, { name: "Snapshot Skill", allowedVocations: "knight,paladin" }),
      createMachine(opToken, { nodeId: "snap-node" }),
      createCharacter(opToken, account.id as number, { name: "SnapChar" })
    ]);

    const adminToken = await loginAsAdmin();
    const snapshot = await json<{
      hunts: Record<string, unknown>[];
      skills: Record<string, unknown>[];
      machines: Record<string, unknown>[];
      characters: Record<string, unknown>[];
    }>(await get("/api/config", adminToken));

    const snapshotHunt = snapshot.hunts.find((h) => h.id === hunt.id);
    expect(snapshotHunt?.city).toBe("Edron");

    const snapshotSkill = snapshot.skills.find((s) => s.id === skill.id);
    expect(Array.isArray(snapshotSkill?.allowedVocations)).toBe(true);
    expect(snapshotSkill?.allowedVocations).toContain("knight");
    expect(snapshotSkill?.allowedVocations).toContain("paladin");

    expect(snapshot.machines.find((m) => m.id === machine.id)).toBeDefined();
    expect(snapshot.characters.find((c) => c.id === character.id)).toBeDefined();
  });
});
