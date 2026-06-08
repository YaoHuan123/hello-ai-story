import { apiRequest } from "./client";

export type HealthResponse = {
  ok: boolean;
  message: string;
  timestamp: string;
  locale?: "zh" | "en";
  sms?: {
    mode: "real" | "mock";
    provider?: string;
    forcedMock?: boolean;
    missingEnvCount?: number;
  };
  apple?: {
    mode: "real" | "mock";
    forcedMock?: boolean;
    missingEnvCount?: number;
  };
  wallet?: {
    mockRechargeEnabled?: boolean;
  };
};

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/api/health", { method: "GET" });
}
