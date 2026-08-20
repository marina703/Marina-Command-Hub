const vscode = require("vscode");
const { OllamaChatModelProvider } = require("./chatModelProvider");
const { OllamaAutocompleteProvider } = require("./autocompleteProvider");
const { ping } = require("./ollamaClient");

let chatProvider = null;

function activate(context) {
  // Register the chat model provider — appears in the native chat model picker.
  chatProvider = new OllamaChatModelProvider();
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider("ollama", chatProvider)
  );

  // Register inline autocomplete.
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      new OllamaAutocompleteProvider()
    )
  );

  // Command: Ping Ollama
  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaNativeChat.ping", async () => {
      try {
        const models = await ping();
        const names = models.map((m) => m.name).join(", ");
        vscode.window.showInformationMessage(
          `Ollama connected. Models: ${names}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Ollama connection failed: ${err.message}`
        );
      }
    })
  );

  // Command: Select chat model via QuickPick
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ollamaNativeChat.selectModel",
      async () => {
        try {
          const models = await ping();
          if (!models.length) {
            vscode.window.showWarningMessage(
              "No Ollama models found. Pull a model first (e.g. ollama pull llama3.1:8b)."
            );
            return;
          }

          const currentModel = vscode.workspace
            .getConfiguration("ollamaNativeChat")
            .get("chatModel");

          const picks = models.map((m) => ({
            label: m.name,
            description:
              m.name === currentModel ? "(currently selected)" : "",
            detail: `Size: ${formatSize(m.size)}`
          }));

          const pick = await vscode.window.showQuickPick(picks, {
            placeHolder: "Select an Ollama model for chat",
            title: "Ollama Native Chat — Select Model"
          });

          if (pick) {
            const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");
            await cfg.update(
              "chatModel",
              pick.label,
              vscode.ConfigurationTarget.Global
            );
            // Notify the provider so the model picker refreshes
            chatProvider?.fireDidChange();
            vscode.window.showInformationMessage(
              `Chat model set to ${pick.label}`
            );
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to list Ollama models: ${err.message}`
          );
        }
      }
    )
  );

  // Command: Select autocomplete model via QuickPick
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ollamaNativeChat.selectAutocompleteModel",
      async () => {
        try {
          const models = await ping();
          if (!models.length) {
            vscode.window.showWarningMessage(
              "No Ollama models found. Pull a model first."
            );
            return;
          }

          const currentModel = vscode.workspace
            .getConfiguration("ollamaNativeChat")
            .get("autocompleteModel");

          const picks = models.map((m) => ({
            label: m.name,
            description:
              m.name === currentModel ? "(currently selected)" : "",
            detail: `Size: ${formatSize(m.size)}`
          }));

          const pick = await vscode.window.showQuickPick(picks, {
            placeHolder:
              "Select an Ollama model for inline autocomplete",
            title: "Ollama Native Chat — Select Autocomplete Model"
          });

          if (pick) {
            const cfg = vscode.workspace.getConfiguration("ollamaNativeChat");
            await cfg.update(
              "autocompleteModel",
              pick.label,
              vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage(
              `Autocomplete model set to ${pick.label}`
            );
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to list Ollama models: ${err.message}`
          );
        }
      }
    )
  );

  // Auto-ping on startup to confirm connectivity (non-blocking)
  ping()
    .then((models) => {
      if (models.length) {
        const names = models.map((m) => m.name).join(", ");
        console.log(
          `[ollama-native-chat] Connected. Available models: ${names}`
        );
      }
    })
    .catch((err) => {
      console.warn(
        `[ollama-native-chat] Ollama not reachable on startup: ${err.message}`
      );
    });
}

/** Format bytes to a human-readable size string. */
function formatSize(bytes) {
  if (!bytes) return "unknown";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function deactivate() {}

module.exports = { activate, deactivate };