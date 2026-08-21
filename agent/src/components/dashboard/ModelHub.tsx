import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, Button, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { updateConfig } from "@/lib/api";
import type { LLMConfig } from "@/types";

export interface ModelHubProps {
  config: LLMConfig | null;
  onConfigChange: (config: LLMConfig) => void;
}

const MODELS = [
  { provider: "gemini", model: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { provider: "ollama", model: "qwen2.5:3b", label: "Ollama (Qwen 2.5 3B)" },
  { provider: "ollama", model: "phi3:mini", label: "Phi-3 Mini (Local)" },
  { provider: "ollama", model: "llama3.1:8b", label: "Llama 3.1 8B (Local)" },
  { provider: "copilot", model: "gpt-4o-mini", label: "GitHub Copilot" },
];

/** LLM Control Room — switch between providers and models. */
export function ModelHub({ config, onConfigChange }: ModelHubProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const activeProvider = config?.provider ?? "ollama";
  const activeModel = config?.model ?? "";

  const handleSelect = async (provider: string, model: string) => {
    try {
      const res = await updateConfig({ provider, model });
      onConfigChange(res.config);
      toast.success(`Switched to ${provider.toUpperCase()} (${model})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch model");
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await updateConfig({
        apiKey: apiKey.trim(),
        provider: "gemini",
        model: "gemini-1.5-flash",
      });
      onConfigChange(res.config);
      setApiKey("");
      toast.success("Gemini API key saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="MODEL HUB"
        title="LLM Control Room"
        description="Switch between local Ollama, Gemini, Copilot, and OpenAI-compatible endpoints."
        actions={
          <StatusBadge tone="info" label={`${activeProvider.toUpperCase()}: ${activeModel || "default"}`} />
        }
      />

      <div className="mb-3 grid gap-1.5">
        {MODELS.map((m) => {
          const isActive = m.provider === activeProvider && m.model === activeModel;
          return (
            <button
              key={`${m.provider}-${m.model}`}
              onClick={() => handleSelect(m.provider, m.model)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
                isActive
                  ? "border-accent-secondary/45 bg-accent-secondary/5 text-text-primary shadow-glow-secondary"
                  : "border-border-muted bg-white/2 text-text-primary hover:border-border-strong",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 rounded-xl border border-border-muted bg-white/2 p-3">
        <p className="mb-2 text-xs leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Token Speed Optimizations:</strong>{" "}
          Model kept warm in RAM • Modest context (4 096) • Output capped (1 024
          tokens) • Flash attention enabled
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs font-semibold text-accent-primary">KEEP ALIVE</div>
            <div className="text-xs text-text-secondary">30 min</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-accent-primary">CTX SIZE</div>
            <div className="text-xs text-text-secondary">4K tokens</div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">Gemini API Key (Optional)</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy…"
            className="flex-1 rounded-xl border border-border-muted bg-white/3 px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-secondary focus:shadow-glow-secondary"
          />
          <Button variant="primary" size="sm" onClick={handleSaveKey} loading={saving}>
            Save
          </Button>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={() => toast.info("Scanning workspace context…")}>
        Scan Workspace Context
      </Button>
    </Card>
  );
}
