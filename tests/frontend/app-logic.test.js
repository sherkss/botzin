import { beforeEach, describe, expect, it } from "vitest";
import { buildPayload, clearToken, getToken, setToken } from "../../frontend/src/api.ts";

describe("frontend API helpers", () => {
  beforeEach(() => localStorage.clear());

  it("stores and removes the session token", () => {
    expect(getToken()).toBeNull();
    setToken("signed-token");
    expect(getToken()).toBe("signed-token");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("builds a payload and converts empty fields to null", () => {
    const form = new FormData();
    form.set("name", "Knight");
    form.set("huntId", "");
    expect(buildPayload(form)).toEqual({ name: "Knight", huntId: null });
  });

  it("keeps uploaded files in the payload", () => {
    const form = new FormData();
    const file = new File(["frame"], "frame.png", { type: "image/png" });
    form.set("frame", file);
    expect(buildPayload(form).frame).toBe(file);
  });
});
