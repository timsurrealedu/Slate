import { resolve, sep } from "node:path";
const root = resolve("dist/standalone");
Bun.serve({
  port: 3002,
  async fetch(request) {
    let file;
    try {
      const path = decodeURIComponent(new URL(request.url).pathname);
      file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (!file.startsWith(root + sep)) return new Response("Unavailable", { status: 403 });
    const asset = Bun.file(file);
    return (await asset.exists())
      ? new Response(asset)
      : new Response("Unavailable", { status: 404 });
  },
});
console.log("Independent Slate build: http://localhost:3002");
