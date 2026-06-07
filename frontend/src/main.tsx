import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StatusBar, Style } from "@capacitor/status-bar";
import "./styles/shell-tokens.css";
import "./styles/app-design.css";
import "./index.css";
import App from "./App.tsx";
import { getHealth } from "./api/health";
import { initI18n, resolveWebLocale } from "./i18n";
import { isNativeApp } from "./lib/platform";

async function bootstrap() {
  if (isNativeApp()) {
    initI18n();
  } else {
    let serverLocale: string | undefined;
    try {
      const health = await getHealth();
      serverLocale = health.locale;
    } catch {
      /* health 不可用时走 VITE_LOCALE / 浏览器 */
    }
    initI18n(resolveWebLocale(serverLocale));
  }

  if (isNativeApp()) {
    document.documentElement.classList.add("capacitor-native");
    void StatusBar.setStyle({ style: Style.Dark });
    void StatusBar.setBackgroundColor({ color: "#1e1b4b" });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
