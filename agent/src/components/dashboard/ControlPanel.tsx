import { useState } from "react";
import { Save, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, Slider, Button, Input } from "@/components/ui";
import { uid } from "@/lib/utils";
import type { PresetConfig } from "@/types";


export interface ControlPanelValues {
  temperature: number;
  maxTokens: number;
  duration: number;
}

export interface ControlPanelProps {
  values: ControlPanelValues;
  onChange: (values: ControlPanelValues) => void;
  /** Presets loaded from localStorage. */
  presets: PresetConfig[];
  onSavePreset: (preset: PresetConfig) => void;
  onLoadPreset: (preset: PresetConfig) => void;
  onDeletePreset: (id: string) => void;
}

const PRESET_STORAGE_KEY = "marina_presets";

/** Load presets from localStorage. */
export function loadPresets(): PresetConfig[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PresetConfig[]) : [];
  } catch {
    return [];
  }
}

/** Persist presets to localStorage. */
export function savePresets(presets: PresetConfig[]) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

/**
 * Control panel with debounced Temperature, Max Tokens, and Duration
 * sliders plus a preset manager to save/load/delete named configs.
 */
export function ControlPanel({
  values,
  onChange,
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}: ControlPanelProps) {
  const [presetName, setPresetName] = useState("");

  const handleSavePreset = () => {

    const name = presetName.trim();
    if (!name) {
      toast.warning("Enter a preset name first");
      return;
    }
    const preset: PresetConfig = {
      id: uid("preset"),
      name,
      temperature: values.temperature,
      maxTokens: values.maxTokens,
      duration: values.duration,
      createdAt: new Date().toISOString(),
    };
    onSavePreset(preset);
    setPresetName("");
    toast.success(`Preset "${name}" saved`);
  };

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="MODEL HUB"
        title="Control Panel"
        description="Tune generation parameters and save reusable presets."
      />

      <div className="flex flex-col gap-5">
        <Slider
          label="Temperature"
          value={values.temperature}
          min={0}
          max={100}
          format={(v) => (v / 100).toFixed(2)}
          onChange={(v) => onChange({ ...values, temperature: v })}
        />
        <Slider
          label="Max Tokens"
          value={values.maxTokens}
          min={256}
          max={4096}
          step={64}
          onChange={(v) => onChange({ ...values, maxTokens: v })}
        />
        <Slider
          label="Duration (s)"
          value={values.duration}
          min={1}
          max={120}
          onChange={(v) => onChange({ ...values, duration: v })}
        />

        {/* Preset Manager */}
        <div className="mt-1 flex flex-col gap-2 border-t border-border-muted pt-3">
          <div className="flex gap-2">
            <Input
              placeholder="Preset name…"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              aria-label="Preset name"
            />
            <Button variant="primary" size="sm" onClick={handleSavePreset}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>

          {presets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-text-secondary">
                Saved Presets
              </p>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-white/2 px-2.5 py-1.5"
                >
                  <button
                    onClick={() => {
                      onLoadPreset(preset);
                      toast.info(`Loaded preset "${preset.name}"`);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-text-primary transition-colors hover:text-accent-primary"
                    title={`Load ${preset.name}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
                    <span className="truncate">{preset.name}</span>
                  </button>
                  <button
                    onClick={() => {
                      onDeletePreset(preset.id);
                      toast.success(`Deleted preset "${preset.name}"`);
                    }}
                    className="rounded p-1 text-text-secondary transition-colors hover:text-status-error"
                    aria-label={`Delete preset ${preset.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
