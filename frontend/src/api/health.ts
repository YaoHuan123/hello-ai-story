import { apiRequest } from "./client";

export type HealthResponse = {
  ok: boolean;
  message: string;
  timestamp: string;
  /** Web 壳层语言，来自后端 APP_LOCALE */
  locale?: "zh" | "en";
  sms?: {
    mode: "real" | "mock";
    china?: {
      provider: string;
      mode: "real" | "mock";
      forcedMock?: boolean;
      missingEnvCount?: number;
    };
    overseas?: {
      provider: string;
      mode: "real" | "mock";
      forcedMock?: boolean;
      missingEnvCount?: number;
    };
  };
};

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/api/health", { method: "GET" });
}
