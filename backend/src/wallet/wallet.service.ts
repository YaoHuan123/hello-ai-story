import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  WalletBalanceResponse,
  WalletRecord,
  WalletTransactionItem,
  WalletTransactionRecord,
  WalletTransactionType,
  WalletTransactionsResponse,
} from "./types";

const MAX_MOCK_RECHARGE = 1_000_000;
const DEFAULT_TX_LIMIT = 30;

function createTxId(): string {
  return randomBytes(10).toString("base64url").slice(0, 14);
}

function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function isMockRechargeEnabled(): boolean {
  const v = (process.env.WALLET_MOCK_RECHARGE ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return !isProductionEnv();
}

function mapTransaction(row: WalletTransactionRecord): WalletTransactionItem {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    refType: row.ref_type ?? undefined,
    refId: row.ref_id ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export class WalletService {
  constructor(private readonly db: DatabaseSync) {}

  getBalance(userId: string): WalletBalanceResponse {
    const row = this.ensureWallet(userId);
    return { balance: row.balance, updatedAt: row.updated_at };
  }

  listTransactions(userId: string, limit = DEFAULT_TX_LIMIT, cursor?: string): WalletTransactionsResponse {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const params: Array<string | number> = [userId];
    let sql = `
      SELECT id, user_id, type, amount, balance_after, ref_type, ref_id, note, created_at
      FROM wallet_transactions
      WHERE user_id = ?
    `;
    if (cursor?.trim()) {
      sql += " AND created_at < (SELECT created_at FROM wallet_transactions WHERE id = ? AND user_id = ?)";
      params.push(cursor.trim(), userId);
    }
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?";
    params.push(safeLimit + 1);

    const rows = this.db.prepare(sql).all(...params) as WalletTransactionRecord[];
    const hasMore = rows.length > safeLimit;
    const slice = hasMore ? rows.slice(0, safeLimit) : rows;
    const items = slice.map(mapTransaction);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, nextCursor };
  }

  mockRecharge(userId: string, amount: number): WalletBalanceResponse {
    if (!isMockRechargeEnabled()) {
      throw new Error("MOCK_RECHARGE_DISABLED");
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }
    if (amount > MAX_MOCK_RECHARGE) {
      throw new Error("AMOUNT_TOO_LARGE");
    }
    return this.applyDelta(userId, amount, "mock_recharge", { note: "mock recharge" });
  }

  /** 供 campaign / quiz 等同库事务内调用（调用方须已 BEGIN IMMEDIATE） */
  applyDeltaWithinTransaction(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    opts: { refType?: string; refId?: string; note?: string } = {},
  ): WalletBalanceResponse {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new Error("INVALID_AMOUNT");
    }
    const wallet = this.ensureWallet(userId);
    const nextBalance = wallet.balance + amount;
    if (nextBalance < 0) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    const now = new Date().toISOString();
    const txId = createTxId();
    this.db
      .prepare("UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?")
      .run(nextBalance, now, userId);
    this.db
      .prepare(
        `INSERT INTO wallet_transactions
          (id, user_id, type, amount, balance_after, ref_type, ref_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        txId,
        userId,
        type,
        amount,
        nextBalance,
        opts.refType ?? null,
        opts.refId ?? null,
        opts.note ?? null,
        now,
      );
    return { balance: nextBalance, updatedAt: now };
  }

  /** 供后续 campaign / quiz 模块调用（独立事务） */
  applyDelta(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    opts: { refType?: string; refId?: string; note?: string } = {},
  ): WalletBalanceResponse {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.applyDeltaWithinTransaction(userId, amount, type, opts);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private ensureWallet(userId: string): WalletRecord {
    let row = this.db
      .prepare("SELECT user_id, balance, updated_at FROM wallets WHERE user_id = ?")
      .get(userId) as WalletRecord | undefined;
    if (!row) {
      const now = new Date().toISOString();
      this.db.prepare("INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)").run(userId, now);
      row = { user_id: userId, balance: 0, updated_at: now };
    }
    return row;
  }
}
