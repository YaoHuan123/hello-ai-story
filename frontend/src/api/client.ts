import { authTokenStore } from "../lib/authToken";

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

export async function parseApiError(response: Response): Promise<Error> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.message) message = payload.message;
    else if (payload.code) message = payload.code;
  } catch {
    // ignore
  }
  return new Error(message);
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
  return (await response.json()) as T;
}
