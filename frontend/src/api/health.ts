import { apiRequest } from "./client";

export type HealthResponse = {
  ok: boolean;
  message: string;
  timestamp: string;
  sms?: {
    mode: "real" | "mock";
    forcedMock: boolean;
    missingEnvCount: number;
  };
};

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/api/health", { method: "GET" });
}
