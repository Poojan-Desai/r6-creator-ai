import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("public/ai-lab");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".json": "application/json",
  ".mp4": "video/mp4",
};
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/studio") {
      response.writeHead(302, { Location: "/studio/" }).end();
      return;
    }
    const file = path.resolve(
      root,
      `.${decodeURIComponent(pathname.endsWith("/") ? `${pathname}index.html` : pathname)}`,
    );
    if (!file.startsWith(`${root}/`)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      types[path.extname(file)] ?? "application/octet-stream",
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(Number(process.env.R6_BROWSER_PORT || 4176), "127.0.0.1", () =>
  console.log(
    `Browser Studio: http://127.0.0.1:${process.env.R6_BROWSER_PORT || 4176}`,
  ),
);
