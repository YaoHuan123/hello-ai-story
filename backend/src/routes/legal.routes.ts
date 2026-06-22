import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";

const LEGAL_PAGES = ["privacy", "terms", "support"] as const;
type LegalPage = (typeof LEGAL_PAGES)[number];

const legalDir = (): string => path.join(process.cwd(), "public", "legal");

function sendLegalPage(page: LegalPage) {
  return (_req: Request, res: Response): void => {
    const file = path.join(legalDir(), `${page}.html`);
    if (!fs.existsSync(file)) {
      res.status(404).type("text/plain").send(`Legal page not found: ${page}`);
      return;
    }
    res.type("html").sendFile(file);
  };
}

/** 项目内法律/Support 静态页：部署后由 Nginx 映射到 /{slug}/privacy 等路径。 */
export function mountLegalPages(app: Express): void {
  for (const page of LEGAL_PAGES) {
    app.get(`/${page}`, sendLegalPage(page));
  }
}
