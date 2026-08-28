import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { syncGemini } from "@/lib/api";
import type { ChatMessage } from "./AssistantConsole";

/* ============================================================
   Gemini Sync
   Pushes Command Hub chat history into Gemini context via
   the existing /api/gemini/sync endpoint.
   ============================================================ */

interface GeminiSyncPanelProps {
  /** Local chat history to sync. */
  chats: ChatMessage[];
}

export function GeminiSyncPanel({ chats }: GeminiSyncPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    count: number;
    at: string;
  } | null>(null);

  const handleSync = async () => {
    if (syncing || chats.length === 0) return;
    setSyncing(true);
    try {
      const res = await syncGemini(chats);
      setLastResult({
        count: res.count,
        at: new Date().toLocaleTimeString(),
      });
      toast.success(res.message || `Synced ${res.count} messages to Gemini`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gemini sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-muted bg-surface-2 p-6 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent-primary/40 bg-accent-primary/10 text-accent-primary shadow-glow-primary">
          <RefreshCw className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-text-primary">Gemini Sync</h2>
          <p className="text-xs text-text-secondary">
            Push Command Hub chat history into Gemini context.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-text-secondary">
          {lastResult ? (
            <span className="inline-flex items-center gap-1.5 text-status-success">
              <CheckCircle2 className="h-4 w-4" />
              Synced {lastResult.count} messages at {lastResult.at}
            </span>
          ) : (
            <>
              {chats.length} message{chats.length === 1 ? "" : "s"} in local
              history
            </>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || chats.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-accent-primary/40 bg-gradient-to-br from-accent-primary-soft to-accent-secondary-soft px-4 py-2 text-sm font-semibold text-text-primary shadow-glow-primary transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {chats.length === 0 && (
        <p className="mt-3 text-xs text-text-muted">
          Send a few messages in the AI Assistant or Command AI panel first,
          then sync them here.
        </p>
      )}
    </div>
  );
}
