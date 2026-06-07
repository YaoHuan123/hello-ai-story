import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hellostory.app",
  appName: "Hello Story",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
};

export default config;
