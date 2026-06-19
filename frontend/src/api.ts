const TOKEN_KEY = "botzin.config.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  return request<T>(url, {
    ...options,
    headers: { ...options.headers, ...authHeaders() },
  });
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: formData });
}

export function buildPayload(formData: FormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      payload[key] = value;
    } else {
      payload[key] = value === "" ? null : value;
    }
  }
  return payload;
}
