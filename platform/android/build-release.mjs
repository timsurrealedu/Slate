import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const directory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(directory, "../..");
const argument = process.argv.indexOf("--password-file");
if (argument < 0 || !process.argv[argument + 1])
  throw new Error("Provide --password-file pointing to the private signing recovery password.");
const password = readFileSync(resolve(process.argv[argument + 1]), "utf8").trim();
const envelope = JSON.parse(
  readFileSync(join(directory, "slate-release.keystore.enc.json"), "utf8"),
);
if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm+scrypt-32768")
  throw new Error("Unsupported signing key envelope.");
const key = scryptSync(password, Buffer.from(envelope.salt, "base64"), 32, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
let keystore;
try {
  keystore = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]);
} catch {
  throw new Error("The signing recovery password or encrypted key is incorrect.");
}
const temporary = mkdtempSync(join(tmpdir(), "slate-signing-"));
try {
  const path = join(temporary, "slate-release.keystore");
  writeFileSync(path, keystore, { mode: 0o600 });
  const windows = process.platform === "win32";
  const result = spawnSync(
    windows ? "gradlew.bat" : "./gradlew",
    ["--no-daemon", "--max-workers=2", "assembleRelease"],
    {
      cwd: join(appDirectory, "android"),
      env: { ...process.env, SLATE_ANDROID_KEYSTORE: path, SLATE_ANDROID_KEY_PASSWORD: password },
      stdio: "inherit",
      shell: windows,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Android release compilation failed.");
  console.log("Signed APK: android/app/build/outputs/apk/release/app-release.apk");
} finally {
  keystore.fill(0);
  key.fill(0);
  rmSync(temporary, { recursive: true, force: true });
}
