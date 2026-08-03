import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apiUrl, authHeaders, json, loginAsOperator } from "../helpers/api.js";

describe("request security limits", () => {
  it("returns 400 for malformed JSON without leaking parser details", async () => {
    const response = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken"
    });
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "JSON body is invalid." });
  });

  it("returns 413 for JSON bodies larger than 1 MB", async () => {
    const response = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x".repeat(1024 * 1024), password: "x" })
    });
    expect(response.status).toBe(413);
  });

  it("hashes uploads, starts them at low trust and rejects duplicates", async () => {
    const token = await loginAsOperator();
    const video = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypisom"),
      Buffer.from("training-sample")
    ]);
    const expectedHash = createHash("sha256").update(video).digest("hex");

    const upload = async () => {
      const form = new FormData();
      form.set("name", "Small verified fixture");
      form.set("file", new File([video], "sample.mp4", { type: "video/mp4" }));
      return fetch(apiUrl("/api/learning-sources/upload-video"), {
        method: "POST",
        headers: authHeaders(token),
        body: form
      });
    };

    const first = await upload();
    expect(first.status).toBe(201);
    const source = await json<Record<string, unknown>>(first);
    expect(source.contentHash).toBe(expectedHash);
    expect(source.trustLevel).toBe("low");

    const duplicate = await upload();
    expect(duplicate.status).toBe(400);
  });

  it("rejects a file whose content does not match its extension", async () => {
    const token = await loginAsOperator();
    const form = new FormData();
    form.set("file", new File(["not-a-video"], "fake.mp4", { type: "video/mp4" }));
    const response = await fetch(apiUrl("/api/learning-sources/upload-video"), {
      method: "POST",
      headers: authHeaders(token),
      body: form
    });
    expect(response.status).toBe(400);
  });
});
