import { useState } from "react";
import { Download, Package, RefreshCw } from "lucide-react";

import { toast } from "sonner";
import type { CommandHubUpdate } from "@/types";
import { getUiUpdates, installCard } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Button } from "@/components/ui";

interface CommandHubUpdatesProps {
  updates: CommandHubUpdate[];
  onRefresh: () => void;
}

const TYPE_TONE: Record<CommandHubUpdate["type"], string> = {
  tool: "text-accent-primary",
  card: "text-accent-secondary",
  widget: "text-accent-primary",
  info: "text-text-secondary",
  success: "text-status-success",
  warning: "text-status-warning",
};

export function CommandHubUpdates({
  updates,
  onRefresh,
}: CommandHubUpdatesProps) {
  const [installing, setInstalling] = useState<string | null>(null);

  const handleInstall = async (update: CommandHubUpdate) => {
    setInstalling(update.id);
    try {
      await installCard({ update });
      toast.success("Update installed", {
        description: `"${update.title}" is now active.`,
      });
      onRefresh();
    } catch (err) {
      toast.error("Install failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setInstalling(null);
    }
  };

  const handleRefresh = async () => {
    try {
      const res = await getUiUpdates();
      toast.success("Updates checked", {
        description: `${res.installed.length} installed updates.`,
      });
      onRefresh();
    } catch (err) {
      toast.error("Could not check updates", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Command Hub"
        title="Updates"
        description="Auto-installed tools, cards, and widgets."
        actions={

          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Check
          </Button>
        }
      />
      <CardBody>
        {updates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            No updates available.
          </p>
        ) : (
          <ul className="space-y-2">
            {updates.map((update) => (
              <li
                key={update.id}
                className="flex items-start gap-3 rounded-lg border border-border-muted bg-surface-2 p-3"
              >
                <span
                  className={`mt-0.5 rounded-md bg-surface-3 p-1.5 ${TYPE_TONE[update.type] ?? "text-text-secondary"}`}
                >
                  <Package className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {update.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                    {update.description}
                  </p>
                </div>
                {update.installed ? (
                  <span className="shrink-0 rounded-full bg-status-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-success">
                    Installed
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInstall(update)}
                    loading={installing === update.id}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
