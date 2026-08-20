const vscode = require("vscode");
const { streamChat, ping } = require("./ollamaClient");

/**
 * A LanguageModelChatProvider that exposes Ollama models to VS Code's
 * native chat view (model picker + chat participants).
 */
class OllamaChatModelProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._cachedModel = null;
  }

  /**
   * Fire this to tell VS Code the model list changed (e.g. after user
   * picks a different model via the QuickPick command).
   */
  fireDidChange() {
    this._cachedModel = null;
    this._onDidChange.fire();
  }

  /**
   * Fetch the current model info (with a short cache to avoid hammering
   * Ollama on every chat interaction).
   */
  async _getModelInfo() {
    if (this._cachedModel) return this._cachedModel;

    const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");
    const model = cfg.get("chatModel") || "llama3.1:8b";

    // Try to get actual model details from Ollama for richer metadata
    let maxInputTokens = 8192;
    let maxOutputTokens = 2048;
    try {
      const models = await ping();
      const found = models.find((m) => m.name === model);
      if (found) {
        // Estimate context window from model size (rough heuristic)
        // Most local models support 4k-8k context; larger models may support more
        const sizeGB = (found.size || 0) / (1024 * 1024 * 1024);
        if (sizeGB > 20) {
          maxInputTokens = 32768;
          maxOutputTokens = 8192;
        } else if (sizeGB > 8) {
          maxInputTokens = 16384;
          maxOutputTokens = 4096;
        }
      }
    } catch {
      // Ollama not reachable — use defaults
    }

    this._cachedModel = {
      id: `ollama-${model}`,
      name: `Ollama: ${model}`,
      family: "ollama",
      version: "1.1.0",
      maxInputTokens,
      maxOutputTokens,
      toolCalling: false
    };
    return this._cachedModel;
  }

  /**
   * Stream a chat response from Ollama into the native chat view.
   */
  async provideLanguageModelChatResponse(request, options, progress, token) {
    const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");

    // Determine which model to use:
    // - If the request targets our vendor ("ollama"), use the model name from
    //   the request (VS Code passes the id from provideLanguageModelChatInformation)
    // - Otherwise fall back to the config setting
    let model = cfg.get("chatModel") || "llama3.1:8b";

    if (request.model && request.model.startsWith("ollama-")) {
      // Strip the "ollama-" prefix to get the actual Ollama model name
      model = request.model.replace(/^ollama-/, "");
    }

    const messages = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const part of request.prompt) {
      if (part instanceof vscode.LanguageModelTextPart) {
        messages.push({ role: "user", content: part.value });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        // Handle tool results if present
        messages.push({
          role: "tool",
          content: JSON.stringify(part.content)
        });
      } else {
        messages.push({ role: "user", content: String(part) });
      }
    }

    const abortController = new AbortController();
    token.onCancellationRequested(() => abortController.abort());

    try {
      for await (const chunk of streamChat(model, messages, {
        signal: abortController.signal,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens
      })) {
        progress.report({ content: chunk });
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        throw new vscode.CancellationError();
      }
      throw err;
    }
  }

  /**
   * Model metadata shown in the native chat model picker.
   */
  async provideLanguageModelChatInformation() {
    return this._getModelInfo();
  }

  async provideLanguageModelChatTools() {
    return [];
  }

  async provideLanguageModelChatMessages() {
    return [];
  }
}

module.exports = { OllamaChatModelProvider };