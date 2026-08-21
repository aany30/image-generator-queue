export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
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

export async function generateImage({ apiKey, prompt, imageDataUrl, size, quality, model }) {
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

export async function handleGenerate(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readJsonBody(req);
    const apiKey = process.env.OPENAI_API_KEY;
    const prompt = String(body.prompt || "").trim();
    const imageDataUrl = String(body.imageDataUrl || "");
    const model = body.model || "gpt-image-1.5";
    const size = body.size || "1024x1024";
    const quality = body.quality || "medium";

    if (!apiKey) {
      return sendJson(res, 500, {
        error: "Server is missing OPENAI_API_KEY. Add it in your Vercel project environment variables."
      });
    }
    if (!prompt) {
      return sendJson(res, 400, { error: "Enter a prompt before generating." });
    }
    if (!imageDataUrl.startsWith("data:image/")) {
      return sendJson(res, 400, { error: "Upload a valid image file." });
    }

    const result = await generateImage({ apiKey, prompt, imageDataUrl, model, size, quality });
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
}
