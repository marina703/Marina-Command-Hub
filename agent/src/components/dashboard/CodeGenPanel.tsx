import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui";
import type { Session } from "@supabase/supabase-js";
import {
  generateCodeProject,
  type CodeGenResult,
} from "@/lib/durable-api";

interface CodeGenPanelProps {
  workspaceId: string | null;
  session: Session | null;
}

const TEMPLATES = [
  { value: "node-cli", label: "Node CLI" },
  { value: "react-app", label: "React (Vite + TS)" },
  { value: "python-fastapi", label: "Python FastAPI" },
  { value: "express-api", label: "Express REST API" },
];

/** Phase 4B — scaffold a project from a spec or template. Safe, no shell exec. */
export function CodeGenPanel({ workspaceId, session }: CodeGenPanelProps) {
  const [useSpec, setUseSpec] = useState(true);
  const [spec, setSpec] = useState("");
  const [template, setTemplate] = useState("node-cli");
  const [projectName, setProjectName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [result, setResult] = useState<CodeGenResult | null>(null);

  const canGenerate = useSpec ? spec.trim().length > 0 : projectName.trim().length > 0;

  const handleGenerate = async () => {
    if (!workspaceId || !session) {
      toast.error("Sign in to generate a project");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await generateCodeProject(
        workspaceId,
        session,
        useSpec ? { spec } : { template, variables: { name: projectName } },
      );
      if (!res.ok) throw new Error("Generation failed");
      setResult(res);
      toast.success(`Generated ${res.project?.fileCount ?? 0} files`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate project");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!workspaceId || !session) return;
    setZipLoading(true);
    try {
      const res = await generateCodeProject(
        workspaceId,
        session,
        useSpec
          ? { spec, outputZip: true }
          : { template, variables: { name: projectName }, outputZip: true },
      );
      if (!res.ok || !res.zip) throw new Error("No ZIP returned");
      const link = document.createElement("a");
      link.href = `data:application/zip;base64,${res.zip}`;
      link.download = res.filename || "project.zip";
      link.click();
      toast.success("ZIP downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download ZIP");
    } finally {
      setZipLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Phase 4B"
        title="Code Generation"
        description="Scaffold a project from a free-text spec or a template. Safe — no shell execution."
        actions={
          <StatusBadge tone={result ? "success" : "neutral"} label={result ? `${result.project?.fileCount} files` : "Ready"} />
        }
      />
      <CardBody>
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant={useSpec ? "primary" : "ghost"} onClick={() => setUseSpec(true)}>
            From Spec
          </Button>
          <Button size="sm" variant={!useSpec ? "primary" : "ghost"} onClick={() => setUseSpec(false)}>
            From Template
          </Button>
        </div>

        {useSpec ? (
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="Describe the project, e.g. 'A react dashboard for tracking orders with a python fastapi backend'"
            rows={3}
            className="w-full resize-none rounded-xl border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent-primary/60"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              options={TEMPLATES}
              label="Template"
            />
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="project-name (lowercase, hyphens)"
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            loading={generating}
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            Generate
          </Button>
          {result?.project && (
            <Button variant="outline" loading={zipLoading} onClick={handleDownloadZip}>
              Download ZIP
            </Button>
          )}
        </div>

        {result?.manifest && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-secondary">
              {result.manifest.projectName} · {result.manifest.template} · {result.manifest.fileCount} files
            </p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border-muted bg-surface-3 p-3 font-mono text-xs">
              {result.manifest.files.map((f) => (
                <li key={f.path} className="flex items-center justify-between text-text-secondary">
                  <span className="text-text-primary">{f.path}</span>
                  <span>{f.sizeBytes} B</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
