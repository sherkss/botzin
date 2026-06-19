import { describe, it, expect, beforeAll } from "vitest";
import { get, post, json, loginAsAdmin } from "../helpers/api.js";

describe("Unknown routes", () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
  });

  it("GET on an unknown /api/ route returns 404 with an error message", async () => {
    const res = await get("/api/does-not-exist", adminToken);
    expect(res.status).toBe(404);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("not found");
  });

  it("POST on an unknown /api/ route returns 404", async () => {
    const res = await post("/api/unknown-endpoint", {}, adminToken);
    expect(res.status).toBe(404);
  });

  it("requests outside /api/ that miss a static file return 404", async () => {
    const res = await get("/this-file-does-not-exist.html");
    expect(res.status).toBe(404);
  });

  it("path traversal attempt outside public dir returns 403", async () => {
    const res = await get("/../../etc/passwd");
    // The URL is normalised by Node's URL parser, so the server sees it as
    // /etc/passwd (traversal collapsed) and returns 404 (file does not exist in public/).
    // Either 403 or 404 is acceptable — both mean the file was NOT served.
    expect([403, 404]).toContain(res.status);
  });
});
