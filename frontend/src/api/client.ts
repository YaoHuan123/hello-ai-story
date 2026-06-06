import { authTokenStore } from "../lib/authToken";

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export async function parseApiError(response: Response): Promise<Error> {
  let message = `HTTP ${response.status}`;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.message) message = payload.message;
    else if (payload.code) message = payload.code;
    code = payload.code;
  } catch {
    // ignore
  }
  return new ApiRequestError(message, response.status, code);
}

export async function apiRequest<T>(url: string, init: RequestInit = {}, useAuth = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (useAuth) {
    const token = authTokenStore.get();
    if (!token) throw new Error("未登录");
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw await parseApiError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export async function fetchAuthenticatedBlob(url: string): Promise<Blob> {
  const token = authTokenStore.get();
  if (!token) throw new Error("未登录");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await parseApiError(response);
  return response.blob();
}
