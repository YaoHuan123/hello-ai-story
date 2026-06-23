import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.com.YaoHuan123.hello-ai-story",
  appName: "Hello Story",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    Keyboard: {
      resize: "none",
    },
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
};

export default config;
