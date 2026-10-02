import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const url = process.env.SLATE_TEST_URL || "http://localhost:3000/";
const b = await chromium.launch({ args: ["--no-sandbox"] });
const context = await b.newContext({ viewport: { width: 1440, height: 960 } });
let p = await context.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(url);
await p.getByRole("heading", { name: "Your library", exact: true }).waitFor();
await p.waitForTimeout(250);
mkdirSync(".impeccable/review", { recursive: true });
let checks = [];
async function shot(name) {
  await p.waitForTimeout(250);
  await p.screenshot({ path: ".impeccable/review/" + name + ".png" });
  const r = await new AxeBuilder({ page: p }).analyze();
  checks.push({
    name,
    violations: r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
}
await shot("desktop");
await p.getByRole("button", { name: "Use dark theme", exact: true }).click();
await shot("desktop-dark");
await p.getByRole("button", { name: "Use light theme", exact: true }).click();
await p.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
await shot("note-live");
await p.getByRole("button", { name: "Reading", exact: true }).click();
await shot("note-reading");
await p.locator(".library-tab").click();
await p.getByLabel("Open Problem set 03", { exact: true }).first().click();
await shot("notebook");
const tablet = await b.newContext({
  viewport: { width: 1280, height: 800 },
  isMobile: true,
  hasTouch: true,
});
const tabletPage = await tablet.newPage();
await tabletPage.goto(url);
await tabletPage.getByRole("heading", { name: "Your library", exact: true }).waitFor();
await tabletPage.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
await tabletPage.getByRole("button", { name: "Reading", exact: true }).click();
await tabletPage.screenshot({ path: ".impeccable/review/tablet.png" });
const phone = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
p = await phone.newPage();
await p.goto(url);
await p.getByRole("heading", { name: "Your library", exact: true }).waitFor();
await shot("mobile");
await p.locator(".mobile-navigation").getByRole("button", { name: "Settings", exact: true }).tap();
await p.getByRole("button", { name: "Dark", exact: true }).tap();
await p.getByRole("button", { name: "Done", exact: true }).tap();
await shot("mobile-dark");
await p.locator(".mobile-navigation").getByRole("button", { name: "Settings", exact: true }).tap();
await p.getByRole("button", { name: "Light", exact: true }).tap();
await p.getByRole("button", { name: "Done", exact: true }).tap();
await p.getByRole("button", { name: "New note", exact: true }).tap();
await p.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
await p.locator(".ink-canvas").waitFor();
await shot("mobile-notebook");
writeFileSync("artifacts/accessibility.json", JSON.stringify(checks, null, 2));
console.log(
  JSON.stringify({
    errors,
    checks: checks.map((c) => ({
      name: c.name,
      violations: c.violations.map((v) => ({
        id: v.id,
        count: v.nodes.length,
        example: v.nodes[0],
      })),
    })),
  }),
);
await b.close();
