import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.slate.workspace",
  appName: "Slate",
  webDir: "dist/standalone",
  server: { androidScheme: "https", hostname: "localhost" },
  android: { allowMixedContent: false },
  plugins: {
    App: { disableBackButtonHandler: true },
    // MainActivity handles immersive cutouts and IME resizing without reserving hidden bars.
    SystemBars: { hidden: true, insetsHandling: "disable" },
  },
};
export default config;
