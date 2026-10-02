import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { unzipSync } from "fflate";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: app, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}).\n${result.stderr || ""}`);
  return result;
}

export function buildApk(variant, env = process.env, certificate) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error("Set ANDROID_HOME to your Android SDK directory.");
  const version = readdirSync(join(sdk, "build-tools"))
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .pop();
  if (!version) throw new Error("Install Android SDK build tools before building an APK.");
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
  run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "vite.standalone.config.ts",
  ]);
  run(process.execPath, ["node_modules/@capacitor/cli/bin/capacitor", "sync", "android"]);
  const windows = process.platform === "win32";
  run(
    windows ? "gradlew.bat" : "./gradlew",
    ["--no-daemon", "--max-workers=2", `assemble${variant === "release" ? "Release" : "Debug"}`],
    {
      cwd: join(app, "android"),
      env,
      shell: windows,
    },
  );
  const apk = join(app, "android/app/build/outputs/apk", variant, `app-${variant}.apk`);
  const files = unzipSync(readFileSync(apk));
  const bundle = join(app, "dist/standalone");
  for (const path of readdirSync(bundle, { recursive: true })) {
    if (!statSync(join(bundle, path)).isFile()) continue;
    const bytes = files[`assets/public/${path.replaceAll("\\", "/")}`];
    if (!bytes || !Buffer.from(bytes).equals(readFileSync(join(bundle, path))))
      throw new Error(`APK contains stale web assets: ${path}`);
  }
  if (!files["assets/public/index.html"]) throw new Error("APK has no web shell.");
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, "bin", windows ? "java.exe" : "java") : "java";
  const verified = run(
    java,
    [
      "-jar",
      join(sdk, "build-tools", version, "lib/apksigner.jar"),
      "verify",
      "--verbose",
      "--print-certs",
      apk,
    ],
    {
      env,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
  if (
    certificate &&
    !verified.stdout
      .toLowerCase()
      .includes(`certificate sha-256 digest: ${certificate.toLowerCase()}`)
  )
    throw new Error("APK signing identity does not match the preserved Slate release certificate.");
  console.log(verified.stdout.trim());
  console.log(`Verified APK: ${apk}`);
  return apk;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  buildApk("debug");
