# Ollama Native Chat — VS Code Extension

Bridge local Ollama models into VS Code's **native chat view** (model picker + chat
participants) and **inline ghost-text autocomplete**.

## What it does

| Feature | Model | How |
|---|---|---|
| Native chat model picker | Any Ollama model | Shows up in the chat model dropdown via `LanguageModelChatProvider` API |
| Model selector command | — | QuickPick to switch between all locally installed Ollama models |
| Inline autocomplete | `qwen2.5-coder:latest` | Ghost-text completions in the editor via `InlineCompletionItemProvider` |
| Ollama ping command | any | `Ollama Native Chat: Ping Ollama` in the command palette |

## Install (from source)

```bash
cd vscode-extension
npm install          # no deps, but ensures node_modules is set up
```

Then launch the extension host:

1. Open this `vscode-extension` folder in a VS Code window.
2. Press **F5** → opens the Extension Development Host.
3. In the dev host, open the Chat view. You should see **Ollama: llama3.1:8b**
   (or whichever model is configured) in the model picker dropdown.
4. Run the command **Ollama Native Chat: Ping Ollama** to verify connectivity.

The extension activates automatically on VS Code startup (`onStartupFinished`).

## Switching models

Two ways to switch which Ollama model is used:

### Via command (recommended)

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **Ollama Native Chat: Select Chat Model**.
3. A QuickPick dropdown shows all locally installed Ollama models with their sizes.
4. Pick one — it updates the config and refreshes the chat model picker.

For autocomplete models, use **Ollama Native Chat: Select Autocomplete Model**.

### Via settings

Open **Settings** → search for `Ollama Native Chat` and change the model name directly.

## Settings

| Setting | Default | Description |
|---|---|---|
| `ollamaNativeChat.baseUrl` | `http://localhost:11434` | Ollama server URL |
| `ollamaNativeChat.chatModel` | `llama3.1:8b` | Model for native chat |
| `ollamaNativeChat.autocompleteModel` | `qwen2.5-coder:latest` | Model for inline completions |
| `ollamaNativeChat.autocompleteEnabled` | `true` | Toggle inline autocomplete on/off |

## Path A — Run Cline on Ollama (zero-code, fully local)

Cline (the VS Code extension) can use Ollama as its backend so everything runs
locally without hitting any cloud API.

1. Open Cline extension settings.
2. Set **API Provider** → **Ollama**.
3. Set **Base URL** → `http://localhost:11434`.
4. Pick your model — e.g. `llama3.1:8b`.

Now Cline (including tool-use, file editing, and the full agent loop) runs
entirely on your local machine.

## Path B — Native chat integration (this extension)

This extension registers your selected Ollama model as a **custom language model**
that appears in VS Code's native Chat view model picker. When you type in the
chat, requests are streamed through Ollama's OpenAI-compatible API at
`localhost:11434/v1`.

The inline autocomplete provider uses `qwen2.5-coder:latest` (Ollama's code-focused
model) to suggest ghost-text completions directly in the editor, independent of
GitHub Copilot.

## Switching between Copilot and Ollama

Once the extension is active, the chat model picker dropdown will show both:
- **Copilot models** (under the `github-copilot` vendor)
- **Ollama models** (under the `ollama` vendor)

Click the model name in the chat view header to switch between them.

## Files

| File | Purpose |
|---|---|
| `package.json` | Extension manifest, settings schema, commands |
| `extension.js` | Activation — registers providers, model picker commands, auto-ping |
| `ollamaClient.js` | HTTP client (streaming chat + non-streaming generate + model listing) |
| `chatModelProvider.js` | `LanguageModelChatProvider` → native chat model with dynamic config |
| `autocompleteProvider.js` | `InlineCompletionItemProvider` → ghost text |