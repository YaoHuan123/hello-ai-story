import { authTokenStore } from "../lib/authToken";
import type { AuthResult, MeResponse, SmsScene } from "../types/auth";

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

async function parseError(response: Response): Promise<Error> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.message) message = payload.message;
  } catch {
    // ignore parse failure
  }
  return new Error(message);
}

async function request<T>(url: string, init: RequestInit = {}, useAuth = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (useAuth) {
    const token = authTokenStore.get();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

export async function sendSms(phone: string, scene: SmsScene = "login"): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/sms/send", {
    method: "POST",
    body: JSON.stringify({ phone, scene }),
  });
}

export async function smsLogin(phone: string, code: string): Promise<AuthResult> {
  const result = await request<AuthResult>("/api/auth/sms/login", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  authTokenStore.set(result.token);
  return result;
}

export async function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/auth/me", { method: "GET" }, true);
}
