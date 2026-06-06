import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** 全屏手机壳：与老项目 `app-shell-phone tc-phone` 对齐。 */
export function AppPageShell({ children, className = "" }: Props) {
  const cls = ["app-shell-phone", "tc-phone", className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}
