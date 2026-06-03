/**
 * Tier6 缺口审核：解析 `gapAudit.missingPoints`。
 */
export function parseGapAudit(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GAP_INVALID: 模型输出不是对象");
  }
  const gapAudit = (parsed as Record<string, unknown>).gapAudit;
  if (!gapAudit || typeof gapAudit !== "object" || Array.isArray(gapAudit)) {
    throw new Error("GAP_INVALID: 缺少 gapAudit");
  }
  const points = (gapAudit as Record<string, unknown>).missingPoints;
  if (!Array.isArray(points)) {
    throw new Error("GAP_INVALID: missingPoints 不是数组");
  }
  const out: string[] = [];
  for (const p of points) {
    if (typeof p !== "string") {
      throw new Error("GAP_INVALID: missingPoints 含非字符串项");
    }
    const t = p.trim();
    if (t) out.push(t);
  }
  return out;
}
