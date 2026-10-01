import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.slate.workspace",
  appName: "Slate",
  webDir: "dist/standalone",
  server: { androidScheme: "https", hostname: "localhost" },
  android: { allowMixedContent: false },
};
export default config;
