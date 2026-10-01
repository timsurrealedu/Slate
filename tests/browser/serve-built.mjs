import worker from "../../dist/server/server.js";
const root = process.cwd() + "/dist/client";
Bun.serve({
  port: 3001,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.includes("..") && pathname !== "/") {
      const file = Bun.file(root + pathname);
      if (await file.exists()) return new Response(file);
    }
    return worker.fetch(
      request,
      {},
      {
        waitUntil(promise) {
          promise.catch(console.error);
        },
      },
    );
  },
});
console.log("Built Slate: http://localhost:3001");
