import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
export function slatePwa(): Plugin {
  return {
    name: "slate-offline-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const files = Object.keys(bundle)
        .filter((name) => /\.(js|css|woff2?|svg|png|mjs)$/.test(name))
        .map((name) => "/" + name);
      const publicDir = join(process.cwd(), "public");
      function walk(path: string) {
        if (!existsSync(path)) return;
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const full = join(path, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (!/slate-cover|\.map$/.test(entry.name))
            files.push("/" + relative(publicDir, full).replaceAll("\\", "/"));
        }
      }
      walk(publicDir);
      files.push("/");
      files.sort();
      const version =
        "slate-shell-" + createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const source = [
        "const CACHE = " + JSON.stringify(version) + ";",
        "const FILES = " + JSON.stringify([...new Set(files)]) + ";",
        'self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));',
        'self.addEventListener("activate", event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("slate-shell-") && key !== CACHE).map(key => caches.delete(key))))])));',
        'self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE") self.skipWaiting(); });',
        'self.addEventListener("fetch", event => { const request = event.request; if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return; event.respondWith(caches.open(CACHE).then(async cache => { if (request.mode === "navigate") return await cache.match("/") || fetch(request); const cached = await cache.match(request, { ignoreVary: true }); return cached || fetch(request); })); });',
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
