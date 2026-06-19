import { inject } from "vitest";
import { ADMIN_USER, ADMIN_PASS, OPERATOR_USER, OPERATOR_PASS, VIEWER_USER, VIEWER_PASS } from "./test-config.js";

function baseUrl(): string {
  const port = inject("serverPort") as number;
  return `http://127.0.0.1:${port}`;
}

export function apiUrl(path: string): string {
  return `${baseUrl()}${path}`;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function get(path: string, token?: string): Promise<Response> {
  return fetch(apiUrl(path), {
    headers: token ? authHeaders(token) : {}
  });
}

export async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? authHeaders(token) : {})
    },
    body: JSON.stringify(body)
  });
}

export async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<string> {
  const res = await post("/api/auth/login", { username, password });
  if (!res.ok) {
    const body = await json<{ error: string }>(res);
    throw new Error(`Login failed (${res.status}): ${body.error}`);
  }
  const body = await json<{ token: string }>(res);
  return body.token;
}

export const loginAsAdmin = (): Promise<string> => login(ADMIN_USER, ADMIN_PASS);
export const loginAsOperator = (): Promise<string> => login(OPERATOR_USER, OPERATOR_PASS);
export const loginAsViewer = (): Promise<string> => login(VIEWER_USER, VIEWER_PASS);
