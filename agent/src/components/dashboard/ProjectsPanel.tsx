import { RefreshCw } from "lucide-react";

import { toast } from "sonner";
import type { ProjectItem } from "@/types";
import { scanProject } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Button } from "@/components/ui";
import { useState } from "react";

interface ProjectsPanelProps {
  projects: ProjectItem[];
  onRefresh: () => void;
}

export function ProjectsPanel({ projects, onRefresh }: ProjectsPanelProps) {
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await scanProject();
      toast.success("Project scan complete", {
        description: `${res.count} files analyzed.`,
      });
      onRefresh();
    } catch (err) {
      toast.error("Scan failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Workspace"
        title="Projects"
        description="Tracked projects and their current state."
        actions={

          <Button
            variant="ghost"
            size="sm"
            onClick={handleScan}
            loading={scanning}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Scan
          </Button>
        }
      />
      <CardBody>
        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            No projects tracked.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li
                key={project.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {project.name}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {project.branch}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {project.status}
                  </span>
                  <span className="text-[11px] text-accent-primary">
                    {project.action}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
