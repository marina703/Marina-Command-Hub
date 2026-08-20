const vscode = require("vscode");

function getBaseUrl() {
  const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");
  return (cfg.get("baseUrl") || "http://localhost:11434").replace(/\/+$/, "");
}

/**
 * List all locally available Ollama models.
 * Returns an array of { name, size, ... } objects.
 */
async function listModels() {
  return ping();
}

async function ping() {
  const res = await fetch(`${getBaseUrl()}/api/tags`);
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

/**
 * Stream a chat completion from Ollama's OpenAI-compatible endpoint.
 * @param {string} model
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @returns {AsyncIterable<string>} token chunks
 */
async function* streamChat(model, messages, opts = {}) {
  const body = {
    model,
    messages,
    stream: true,
    options: {
      temperature: opts.temperature ?? 0.2,
      num_predict: opts.maxTokens ?? 1024
    }
  };

  const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE lines are separated by \n
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming completion for inline autocomplete.
 * @param {string} model
 * @param {string} prompt
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function complete(model, prompt, opts = {}) {
  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 64
    }
  };

  const res = await fetch(`${getBaseUrl()}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama generate failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.response || "";
}

module.exports = { getBaseUrl, ping, listModels, streamChat, complete };
