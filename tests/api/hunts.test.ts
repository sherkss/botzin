import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";

describe("POST /api/hunts", () => {
  let opToken: string;

  beforeAll(async () => {
    opToken = await loginAsOperator();
  });

  it("creates hunt with all fields and returns 201", async () => {
    const res = await post(
      "/api/hunts",
      { name: "Demons", city: "Ankrahmun", routeProfile: "figure-8", minLevel: 200, notes: "AOE area", enabled: true },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Demons");
    expect(body.city).toBe("Ankrahmun");
    expect(body.routeProfile).toBe("figure-8");
    expect(body.minLevel).toBe(200);
    expect(body.notes).toBe("AOE area");
    expect(body.enabled).toBe(true);
  });

  it("creates hunt with name only — optional fields are null", async () => {
    const res = await post("/api/hunts", { name: "Minimal Hunt" }, opToken);

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.city).toBeNull();
    expect(body.routeProfile).toBeNull();
    expect(body.minLevel).toBeNull();
    expect(body.notes).toBeNull();
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/hunts", { city: "Thais" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 409 on duplicate hunt name", async () => {
    await post("/api/hunts", { name: "Dup Hunt" }, opToken);
    const res = await post("/api/hunts", { name: "Dup Hunt" }, opToken);
    expect(res.status).toBe(409);
  });
});
