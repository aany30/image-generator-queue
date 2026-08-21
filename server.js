import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGenerate, sendJson } from "./api/_lib/openai-image.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

async function loadLocalEnv() {
  try {
    const envFile = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // A .env file is optional; Vercel uses project environment variables.
  }
}

await loadLocalEnv();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    if (req.method === "HEAD") return res.end();
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === "/health" || pathname === "/api/health") {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/generate") {
    return handleGenerate(req, res);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Image Prompt Automator running at http://${host}:${port}`);
});
