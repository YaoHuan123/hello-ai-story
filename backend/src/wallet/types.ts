export type WalletTransactionType =
  | "mock_recharge"
  | "plan_escrow"
  | "plan_portion"
  | "plan_refund"
  | "quiz_reward"
  | "admin_adjust";

export type WalletRecord = {
  user_id: string;
  balance: number;
  updated_at: string;
};

export type WalletTransactionRecord = {
  id: string;
  user_id: string;
  type: WalletTransactionType;
  amount: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
};

export type WalletBalanceResponse = {
  balance: number;
  updatedAt: string;
};

export type WalletTransactionItem = {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
  note?: string;
  createdAt: string;
};

export type WalletTransactionsResponse = {
  items: WalletTransactionItem[];
  nextCursor?: string;
};
