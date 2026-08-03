import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";
import { createAccount } from "../helpers/fixtures.js";

describe("POST /api/characters", () => {
  let opToken: string;
  let accountId: number;

  beforeAll(async () => {
    opToken = await loginAsOperator();
    const account = await createAccount(opToken, { loginIdentifier: "char-test@example.com" });
    accountId = account.id as number;
  });

  it("creates character with all fields and returns 201", async () => {
    const res = await post(
      "/api/characters",
      {
        accountId,
        name: "Eldrador",
        world: "Antica",
        vocation: "Knight",
        level: 250,
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.accountId).toBe(accountId);
    expect(body.name).toBe("Eldrador");
    expect(body.world).toBe("Antica");
    expect(body.vocation).toBe("Knight");
    expect(body.level).toBe(250);
    expect(body.enabled).toBe(true);
  });

  it("optional fields default to null", async () => {
    const res = await post(
      "/api/characters",
      { accountId, name: "Minimal" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.world).toBeNull();
    expect(body.vocation).toBeNull();
    expect(body.level).toBeNull();
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/characters", { accountId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 400 when accountId is missing", async () => {
    const res = await post("/api/characters", { name: "NoAccount" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"accountId"');
  });

  it("returns 400 for a non-existent accountId", async () => {
    const res = await post(
      "/api/characters",
      { accountId: 999_999, name: "Orphan" },
      opToken
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate (accountId, name) pair", async () => {
    const payload = { accountId, name: "DupChar" };
    await post("/api/characters", payload, opToken);
    const res = await post("/api/characters", payload, opToken);
    expect(res.status).toBe(409);
  });
});
