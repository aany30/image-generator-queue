import { sendJson } from "./_lib/openai-image.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  return sendJson(res, 200, { ok: true });
}
