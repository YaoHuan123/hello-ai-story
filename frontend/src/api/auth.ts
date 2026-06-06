import { authTokenStore } from "../lib/authToken";
import type { AuthResult, MeResponse, SmsScene } from "../types/auth";
import { apiRequest } from "./client";

export async function sendSms(phone: string, scene: SmsScene = "login"): Promise<void> {
  await apiRequest<{ ok: boolean }>("/api/auth/sms/send", {
    method: "POST",
    body: JSON.stringify({ phone, scene }),
  });
}

export async function smsLogin(phone: string, code: string): Promise<AuthResult> {
  const result = await apiRequest<AuthResult>("/api/auth/sms/login", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  authTokenStore.set(result.token);
  return result;
}

export async function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>("/api/auth/me", { method: "GET" }, true);
}

export async function changePhone(payload: {
  newPhone: string;
  newCode: string;
  oldCode: string;
}): Promise<{ phone: string }> {
  return apiRequest<{ phone: string }>(
    "/api/auth/phone",
    { method: "PATCH", body: JSON.stringify(payload) },
    true,
  );
}

export async function deleteAccount(code: string): Promise<void> {
  await apiRequest<{ ok: true }>(
    "/api/auth/me",
    { method: "DELETE", body: JSON.stringify({ code }) },
    true,
  );
}
