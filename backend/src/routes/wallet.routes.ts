import { Router, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import type { WalletService } from "../wallet/wallet.service";

const mockRechargeSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
});

const listTxSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

function mapWalletError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = error.message;
  if (code === "MOCK_RECHARGE_DISABLED") {
    res.status(403).json({ code, message: "当前环境未开启 mock 充值" });
    return true;
  }
  if (code === "INVALID_AMOUNT" || code === "AMOUNT_TOO_LARGE") {
    res.status(400).json({ code, message: "充值金额无效" });
    return true;
  }
  if (code === "INSUFFICIENT_BALANCE") {
    res.status(400).json({ code, message: "积分余额不足" });
    return true;
  }
  return false;
}

export const createWalletRouter = (walletService: WalletService): Router => {
  const router = Router();

  router.get("/balance", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const balance = walletService.getBalance(user.userId);
    res.status(200).json(balance);
  });

  router.get("/transactions", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = listTxSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const result = walletService.listTransactions(user.userId, parsed.data.limit, parsed.data.cursor);
    res.status(200).json(result);
  });

  router.post("/recharge/mock", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = mockRechargeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    try {
      const balance = walletService.mockRecharge(user.userId, parsed.data.amount);
      res.status(200).json({ ok: true as const, ...balance });
    } catch (error) {
      if (mapWalletError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Mock recharge failed" });
    }
  });

  return router;
};
