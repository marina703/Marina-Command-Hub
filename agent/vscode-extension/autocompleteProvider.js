const vscode = require("vscode");
const { complete } = require("./ollamaClient");

/**
 * Provides inline ghost-text autocomplete from Ollama's qwen2.5-coder model.
 */
class OllamaAutocompleteProvider {
  async provideInlineCompletionItems(document, position, context, token) {
    const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");
    if (!cfg.get("autocompleteEnabled", true)) {
      return [];
    }

    const model = cfg.get("autocompleteModel") || "qwen2.5-coder:latest";

    // Build a compact prompt from the current line + a bit of context
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character);
    const suffix = line.slice(position.character);

    // Grab up to ~20 lines of preceding context for better completions
    const startLine = Math.max(0, position.line - 20);
    const contextText = document.getText(
      new vscode.Range(startLine, 0, position.line, position.character)
    );

    const prompt = [
      `You are an inline code completion engine. Complete the code at the cursor.`,
      `Return ONLY the completion text, no explanation, no markdown.`,
      ``,
      `Language: ${document.languageId}`,
      ``,
      `Code context:`,
      `\`\`\`${document.languageId}`,
      contextText,
      `\`\`\``,
      ``,
      `Cursor is at the end of this line:`,
      `\`\`\`${document.languageId}`,
      prefix,
      `\`\`\``,
      ``,
      `Suffix after cursor:`,
      `\`\`\`${document.languageId}`,
      suffix,
      `\`\`\``,
      ``,
      `Completion:`
    ].join("\n");

    try {
      const completion = await complete(model, prompt, {
        temperature: 0.1,
        maxTokens: 64
      });

      if (!completion || token.isCancellationRequested) {
        return [];
      }

      // Trim leading whitespace/newlines that the model may add
      const trimmed = completion.replace(/^\s+/, "");

      return [
        new vscode.InlineCompletionItem(
          trimmed,
          new vscode.Range(position, position)
        )
      ];
    } catch (err) {
      // Silently ignore Ollama errors during autocomplete
      console.error("[ollama-native-chat] autocomplete error:", err.message);
      return [];
    }
  }
}

module.exports = { OllamaAutocompleteProvider };