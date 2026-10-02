const { packager } = require("@electron/packager");
const fs = require("node:fs");
const path = require("node:path");
const { version } = require("../../package.json");
(async () => {
  const appRoot = path.resolve(__dirname, "../..");
  process.chdir(appRoot);
  const stage = path.resolve("artifacts/desktop-stage");
  if (!stage.startsWith(path.join(appRoot, "artifacts") + path.sep))
    throw new Error("Invalid desktop staging path.");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.copyFileSync("platform/desktop/main.cjs", path.join(stage, "main.cjs"));
  fs.copyFileSync("platform/desktop/preload.cjs", path.join(stage, "preload.cjs"));
  fs.copyFileSync("platform/desktop/vault.cjs", path.join(stage, "vault.cjs"));
  fs.cpSync("dist/standalone", path.join(stage, "www"), { recursive: true });
  fs.writeFileSync(
    path.join(stage, "package.json"),
    JSON.stringify({ name: "slate", productName: "Slate", version, main: "main.cjs" }),
  );
  await packager({
    dir: stage,
    name: "Slate",
    platform: ["linux", "win32"],
    arch: "x64",
    out: "artifacts/desktop",
    overwrite: true,
    asar: true,
    prune: true,
    icon: path.resolve("platform/desktop/slate.ico"),
    appVersion: version,
    executableName: "Slate",
    win32metadata: {
      CompanyName: "Slate",
      FileDescription: "Slate study workspace",
      ProductName: "Slate",
    },
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
