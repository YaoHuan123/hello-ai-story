export type WalletTransactionType =
  | "mock_recharge"
  | "plan_escrow"
  | "plan_refund"
  | "quiz_reward"
  | "admin_adjust";

export type WalletBalance = {
  balance: number;
  updatedAt: string;
};

export type WalletTransaction = {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
  note?: string;
  createdAt: string;
};

export type WalletTransactionsPage = {
  items: WalletTransaction[];
  nextCursor?: string;
};
