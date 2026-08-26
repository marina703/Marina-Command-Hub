/* ============================================================
   MarinaAI — Image Generation Tool (AI Design)

   Provider adapter for image generation. Fail-closed: returns a
   truthful "not configured" result until a provider key is set.
   Supports OpenAI DALL-E and Stability (extensible). LM Studio
   cannot run diffusion models, so this is provider-backed only.
   Safe: only outbound HTTPS to the configured provider.
   ============================================================ */

const PROVIDERS = {
  openai: {
    name: "openai",
    baseUrl: "https://api.openai.com/v1/images/generations",
    requiredEnv: "OPENAI_API_KEY",
  },
  stability: {
    name: "stability",
    baseUrl: "https://api.stability.ai/v2beta/stable-image/generate/core",
    requiredEnv: "STABILITY_API_KEY",
  },
};

const DEFAULT_PROVIDER = process.env.IMAGE_GEN_PROVIDER || "openai";
const TIMEOUT_MS = Number(process.env.IMAGE_GEN_TIMEOUT_MS) || 60000;

/** Generate an image from a prompt. Returns { ok, base64, provider } or a graceful error. */
async function generateImage({ prompt, provider, size = "1024x1024", n = 1 }) {
  if (!prompt || typeof prompt !== "string") {
    return { ok: false, message: "prompt is required" };
  }
  const providerName = provider || DEFAULT_PROVIDER;
  const config = PROVIDERS[providerName];
  if (!config) {
    return { ok: false, message: `Unknown provider: ${providerName}` };
  }
  const apiKey = process.env[config.requiredEnv];
  if (!apiKey) {
    return { ok: false, message: `No API key configured for ${providerName}. Set ${config.requiredEnv}.` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let base64;
    if (providerName === "openai") {
      const res = await fetch(config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "dall-e-3", prompt, n, size }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI image error: ${res.status} ${err}`);
      }
      const data = await res.json();
      base64 = data.data?.[0]?.b64_json;
    } else if (providerName === "stability") {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("output_format", "png");
      const res = await fetch(config.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stability image error: ${res.status} ${err}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      base64 = buf.toString("base64");
    }

    clearTimeout(timeoutId);
    if (!base64) return { ok: false, message: "Provider returned no image data" };
    return { ok: true, provider: providerName, base64, size, prompt };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") return { ok: false, message: `Image generation timeout after ${TIMEOUT_MS}ms` };
    return { ok: false, message: error.message };
  }
}

module.exports = { PROVIDERS, DEFAULT_PROVIDER, generateImage };
