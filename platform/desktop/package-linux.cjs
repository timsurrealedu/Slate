const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { version } = require("../../package.json");
const stage = path.resolve("artifacts/linux-deb-stage");
const source = path.resolve("artifacts/desktop/Slate-linux-x64");
const output = path.resolve(`artifacts/slate-${version}-linux-amd64.deb`);
if (!fs.existsSync(path.join(source, "Slate")))
  throw new Error("Build the Linux desktop package before assembling its installer.");
fs.rmSync(stage, { recursive: true, force: true });
const app = path.join(stage, "opt/slate");
fs.mkdirSync(app, { recursive: true });
fs.cpSync(source, app, { recursive: true, verbatimSymlinks: true });
fs.chmodSync(path.join(app, "chrome-sandbox"), 0o4755);
const control = path.join(stage, "DEBIAN");
fs.mkdirSync(control);
fs.writeFileSync(
  path.join(control, "control"),
  [
    "Package: slate",
    `Version: ${version}`,
    "Architecture: amd64",
    "Maintainer: Slate",
    "Section: education",
    "Priority: optional",
    "Depends: libgtk-3-0, libnss3, libxss1, libasound2t64 | libasound2, libxtst6, libgbm1, libatk-bridge2.0-0, libx11-6, libxcomposite1, libxdamage1, libxrandr2",
    "Description: Local study and knowledge workspace",
    " Markdown, linked notes, page-based handwriting and document annotation.",
    " The workspace stays on this device without an account.",
    "",
  ].join("\n"),
);
const applications = path.join(stage, "usr/share/applications");
fs.mkdirSync(applications, { recursive: true });
fs.writeFileSync(
  path.join(applications, "slate.desktop"),
  [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Slate",
    "Comment=Study, write and connect your notes",
    "Exec=/opt/slate/Slate",
    "Icon=slate",
    "Terminal=false",
    "Categories=Education;Office;",
    "Keywords=Notes;Study;Markdown;PDF;",
    "",
  ].join("\n"),
);
const icons = path.join(stage, "usr/share/icons/hicolor/512x512/apps");
fs.mkdirSync(icons, { recursive: true });
fs.copyFileSync("public/icons/slate-512.png", path.join(icons, "slate.png"));
execFileSync("dpkg-deb", ["--root-owner-group", "-Zxz", "-z9", "--build", stage, output], {
  stdio: "inherit",
});
console.log(output);
