import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function resolvePath(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const requestPath = cleanPath === "/" ? "/index.html" : cleanPath;
  return join(root, requestPath);
}

createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    "content-type": types[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`ScoutAI static site running on port ${port}`);
});
