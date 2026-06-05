export function compactEnvEventFromRow(o: Record<string, unknown>): string {
  return typeof o.env_event === "string" ? o.env_event.trim() : "";
}

export function rowHasRenderableEnvScene(o: Record<string, unknown>): boolean {
  return compactEnvEventFromRow(o).length > 0;
}
