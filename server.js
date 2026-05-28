import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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
    // A .env file is optional; production hosts can provide real environment variables.
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

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function getOutputImage(response) {
  const outputs = response.output || [];
  for (const output of outputs) {
    if (output.type === "image_generation_call" && output.result) {
      return output.result;
    }

    for (const item of output.content || []) {
      if (item.type === "output_image" && item.image_base64) {
        return item.image_base64;
      }
      if (item.type === "image_generation_call" && item.result) {
        return item.result;
      }
    }
  }

  return null;
}

async function generateImage({ apiKey, prompt, imageDataUrl, size, quality, model }) {
  const imageTool = {
    type: "image_generation",
    model,
    size,
    quality
  };

  if (model === "gpt-image-1.5") {
    imageTool.action = "edit";
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl }
          ]
        }
      ],
      tools: [imageTool],
      tool_choice: { type: "image_generation" }
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }

  const base64 = getOutputImage(payload);
  if (!base64) {
    throw new Error("The API response did not include a generated image.");
  }

  return {
    imageDataUrl: `data:image/png;base64,${base64}`,
    usage: payload.usage || null
  };
}

async function handleGenerate(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const apiKey = process.env.OPENAI_API_KEY;
    const prompt = String(body.prompt || "").trim();
    const imageDataUrl = String(body.imageDataUrl || "");
    const model = body.model || "gpt-image-1.5";
    const size = body.size || "1024x1024";
    const quality = body.quality || "medium";

    if (!apiKey) {
      return sendJson(res, 500, { error: "Server is missing OPENAI_API_KEY. Add it to .env and restart the server." });
    }
    if (!prompt) {
      return sendJson(res, 400, { error: "Enter a prompt before generating." });
    }
    if (!imageDataUrl.startsWith("data:image/")) {
      return sendJson(res, 400, { error: "Upload a valid image file." });
    }

    const result = await generateImage({ apiKey, prompt, imageDataUrl, model, size, quality });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
}

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
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    return handleGenerate(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Image Prompt Automator running at http://${host}:${port}`);
});
