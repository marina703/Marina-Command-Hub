import { useState } from "react";
import { Palette, Play, Sparkles } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";


/* ============================================================
   Playbook Bar
   Welcome strip + selectable playbook chips + "Run Playbook".
   ============================================================ */

export interface PlaybookDef {
  id: string;
  label: string;
}

export const PLAYBOOKS: PlaybookDef[] = [
  { id: "next-steps", label: "Next Steps" },
  { id: "daily-ideas", label: "Daily Ideas" },
  { id: "monetization-map", label: "Monetization Map" },
  { id: "marketing-playbook", label: "Marketing Playbook" },
  { id: "opportunity-scan", label: "Opportunity Scan" },
  { id: "execution-map", label: "Execution Map" },
  { id: "business-proposals", label: "Business Proposals" },
  { id: "strategy-brief", label: "Strategy Brief" },
  { id: "generate-coalition", label: "Generate Coalition" },
  { id: "audit-site", label: "Audit Site Syntax & Psychology" },
  { id: "logo-sketch", label: "Logo Sketch" },
  { id: "video-script", label: "Video Script" },
  { id: "write-story-report", label: "Write Story Report" },
  { id: "run-playbook", label: "Run Playbook" },
];



interface PlaybookBarProps {
  /** Greeting shown in the welcome strip. */
  welcome?: string;
  /** Currently selected playbook id (controlled). */
  selected?: string;
  /** Called when a playbook chip is selected. */
  onSelect?: (id: string) => void;
  /** Called when "Run Playbook" is clicked with the selected id and optional prompt. */
  onRun?: (id: string, prompt?: string) => void;
  /** Whether a playbook run is in progress. */
  running?: boolean;
}

export function PlaybookBar({
  welcome = "Rapid Fire",

  selected,
  onSelect,
  onRun,
  running = false,
}: PlaybookBarProps) {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [logoDescription, setLogoDescription] = useState("");
  const active = selected ?? internalSelected;

  const handleSelect = (id: string) => {
    setInternalSelected(id);
    onSelect?.(id);
  };

  const handleRun = () => {
    if (!active) {
      toast.info("Select a playbook first");
      return;
    }
    // For logo-sketch, pass the user's description as the prompt.
    const prompt = active === "logo-sketch" ? logoDescription : undefined;
    onRun?.(active, prompt);
  };


  return (
    <div className="rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card">
      {/* Welcome message */}
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-primary" />
        <h2 className="m-0 text-base font-bold text-text-primary">{welcome}</h2>
      </div>

      {/* Playbook chips */}
      <div className="flex flex-wrap gap-2">
        {PLAYBOOKS.map((pb) => (
          <button
            key={pb.id}
            type="button"
            onClick={() => handleSelect(pb.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
              active === pb.id
                ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary shadow-glow-primary"
                : "border-border-muted bg-surface-3 text-text-secondary hover:border-accent-primary/40 hover:text-text-primary",
            )}
          >
            {pb.label}
          </button>
        ))}
      </div>

      {/* Logo Sketch description input */}
      {active === "logo-sketch" && (
        <div className="mt-3 rounded-xl border border-border-muted bg-surface-3/60 p-3">
          <label
            htmlFor="logo-description"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <Palette className="h-3.5 w-3.5 text-accent-primary" />
            What is this logo for?
          </label>
          <textarea
            id="logo-description"
            value={logoDescription}
            onChange={(e) => setLogoDescription(e.target.value)}
            placeholder="e.g. A modern fintech startup logo, dark background, neon cyan accents, geometric mark…"
            rows={3}
            className="w-full resize-none rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary/60 focus:outline-none focus:ring-1 focus:ring-accent-primary/40"
          />
        </div>
      )}

      {/* Run Playbook button */}
      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          onClick={handleRun}
          loading={running}
          disabled={!active}
        >
          <Play className="h-4 w-4" />
          Run Playbook
        </Button>
      </div>

    </div>
  );
}
