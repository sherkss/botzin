import { describe, it, expect, beforeAll } from "vitest";
import { get, post, json, apiUrl, loginAsAdmin, loginAsOperator } from "../helpers/api.js";
import { ADMIN_USER, OPERATOR_USER, VIEWER_USER, ADMIN_PASS } from "../helpers/test-config.js";

describe("POST /api/auth/login", () => {
  it("returns token and user object on valid admin credentials", async () => {
    const res = await post("/api/auth/login", { username: ADMIN_USER, password: ADMIN_PASS });

    expect(res.status).toBe(200);
    const body = await json<{ token: string; user: Record<string, unknown> }>(res);

    // Token must be a well-formed JWT (three dot-separated segments).
    expect(body.token).toBeTypeOf("string");
    expect(body.token.split(".")).toHaveLength(3);

    expect(body.user.username).toBe(ADMIN_USER);
    expect(body.user.role).toBe("admin");
    expect(body.user.id).toBeTypeOf("number");
    expect(body.user.displayName).toBe("Test Admin");
    // Password hash must NEVER appear in the response.
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("password_hash");
  });

  it("returns 401 on wrong password — message is generic to prevent user enumeration", async () => {
    const res = await post("/api/auth/login", { username: ADMIN_USER, password: "wrong-password" });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("Invalid username or password.");
  });

  it("returns 401 for a non-existent user with the same message as wrong password", async () => {
    const res = await post("/api/auth/login", { username: "nobody", password: "anything" });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("Invalid username or password.");
  });

  it("returns 400 when username is omitted", async () => {
    const res = await post("/api/auth/login", { password: ADMIN_PASS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is omitted", async () => {
    const res = await post("/api/auth/login", { username: ADMIN_USER });
    expect(res.status).toBe(400);
  });

  it("returns 400 when both fields are empty strings", async () => {
    const res = await post("/api/auth/login", { username: "", password: "" });
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("required");
  });

  it("operator and viewer receive correct role in login response", async () => {
    const [opRes, viewRes] = await Promise.all([
      post("/api/auth/login", { username: OPERATOR_USER, password: "TestOperator_P4ss!" }),
      post("/api/auth/login", { username: VIEWER_USER, password: "TestViewer_P4ss!" })
    ]);

    expect(opRes.status).toBe(200);
    expect(viewRes.status).toBe(200);

    const op = await json<{ user: { role: string } }>(opRes);
    const view = await json<{ user: { role: string } }>(viewRes);
    expect(op.user.role).toBe("operator");
    expect(view.user.role).toBe("viewer");
  });
});

describe("GET /api/auth/me", () => {
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    [adminToken, operatorToken] = await Promise.all([loginAsAdmin(), loginAsOperator()]);
  });

  it("returns 200 and the authenticated user's data for a valid token", async () => {
    const res = await get("/api/auth/me", adminToken);

    expect(res.status).toBe(200);
    const body = await json<{ user: Record<string, unknown> }>(res);
    expect(body.user.username).toBe(ADMIN_USER);
    expect(body.user.role).toBe("admin");
    expect(body.user.id).toBeTypeOf("number");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("returns the correct role for operator token", async () => {
    const res = await get("/api/auth/me", operatorToken);
    const body = await json<{ user: { role: string } }>(res);
    expect(body.user.role).toBe("operator");
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await get("/api/auth/me");
    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("Bearer");
  });

  it("returns 401 for a syntactically invalid JWT", async () => {
    const res = await get("/api/auth/me", "not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a JWT signed with a different secret (forged token)", async () => {
    const fakeToken =
      "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImhhY2tlciIsInJvbGUiOiJhZG1pbiJ9.fake";
    const res = await get("/api/auth/me", fakeToken);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header uses a scheme other than Bearer", async () => {
    const res = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Basic ${adminToken}` }
    });
    expect(res.status).toBe(401);
  });
});
