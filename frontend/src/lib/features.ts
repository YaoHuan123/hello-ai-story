/** Activity / Watch / 积分钱包；美区首版 iOS 构建关闭（见 frontend/.env.ios）。 */
export function isQuizRewardsEnabled(): boolean {
  const raw = (import.meta.env.VITE_ENABLE_QUIZ_REWARDS ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}
