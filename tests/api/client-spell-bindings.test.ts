import { beforeAll, describe, expect, it } from "vitest";
import { json, loginAsOperator, post } from "../helpers/api.js";
import { createAccount, createCharacter, createSkill } from "../helpers/fixtures.js";

describe("POST /api/client-spell-bindings", () => {
  let token: string;
  let characterId: number;
  let skillId: number;

  beforeAll(async () => {
    token = await loginAsOperator();
    const account = await createAccount(token);
    const character = await createCharacter(token, Number(account.id), { vocation: "elite knight", level: 300 });
    const skill = await createSkill(token, { name: "Binding Berserk", spellWords: "exori", manaCost: 115, allowedVocations: "knight" });
    characterId = Number(character.id);
    skillId = Number(skill.id);
  });

  it("stores the client hotkey per character and spell", async () => {
    const response = await post("/api/client-spell-bindings", {
      characterId,
      skillId,
      hotkey: "ctrl+f1",
      multiActionSlot: 2,
      castMode: "hotkey",
      targetMode: "current-target",
      requireGameFocus: true,
      lastVerifiedAt: "2026-08-04T12:30:00"
    }, token);
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      characterId,
      skillId,
      hotkey: "CTRL+F1",
      multiActionSlot: 2,
      castMode: "hotkey",
      targetMode: "current-target",
      requireGameFocus: true,
      enabled: true
    });
  });

  it("rejects unsupported key combinations", async () => {
    const response = await post("/api/client-spell-bindings", { characterId, skillId, hotkey: "rm -rf" }, token);
    expect(response.status).toBe(400);
    expect((await json<{ error: string }>(response)).error).toContain("hotkey");
  });
});
