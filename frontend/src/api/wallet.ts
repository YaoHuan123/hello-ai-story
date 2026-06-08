import type { WalletBalance, WalletTransactionsPage } from "../types/wallet";
import { apiRequest } from "./client";

export async function getWalletBalance(): Promise<WalletBalance> {
  return apiRequest<WalletBalance>("/api/wallet/balance", { method: "GET" }, true);
}

export async function listWalletTransactions(params?: {
  limit?: number;
  cursor?: string;
}): Promise<WalletTransactionsPage> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<WalletTransactionsPage>(`/api/wallet/transactions${suffix}`, { method: "GET" }, true);
}

export async function mockRechargeWallet(amount: number): Promise<WalletBalance & { ok: true }> {
  return apiRequest<WalletBalance & { ok: true }>(
    "/api/wallet/recharge/mock",
    { method: "POST", body: JSON.stringify({ amount }) },
    true,
  );
}
