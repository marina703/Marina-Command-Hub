import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, Button, Input, StatusBadge, SkeletonList } from "@/components/ui";
import { createTask, completeTask } from "@/lib/api";
import type { TaskItem, CompletedTask } from "@/types";

export interface TaskBoardProps {
  tasks: TaskItem[];
  completed: CompletedTask[];
  loading?: boolean;
  onRefresh: () => void;
}

/** Mission Tasks & Work History board. */

export function TaskBoard({ tasks, completed, loading, onRefresh }: TaskBoardProps) {
  const [title, setTitle] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createTask({
        title: title.trim(),
        owner: "Operator",
        priority: "High",
        status: "queued",
        progress: 10,
      });
      setTitle("");
      toast.success("Task assigned");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create task");
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await completeTask(id);
      toast.success("Task completed");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete task");
    }
  };

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="OPERATIONS"
        title="Mission Tasks & Work History"
        description="Track active tasks, assign new work, and review completed history."
        actions={
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add new task…"
              className="w-44"
            />
            <Button variant="primary" size="sm" type="submit">
              <Plus className="h-3.5 w-3.5" />
              Assign
            </Button>
          </form>
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-accent-primary">
              Active Queue
            </p>
            <div className="flex flex-col gap-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-text-muted">No active tasks in queue.</p>
              ) : (
                tasks.slice(0, 8).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border-muted bg-white/2 p-3"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-text-primary">
                        {task.title}
                      </strong>
                      <small className="text-xs text-text-secondary">
                        {task.owner} • {task.priority} • {task.status}
                      </small>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleComplete(task.id)}
                      aria-label={`Complete ${task.title}`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-accent-secondary">
              Completed Work
            </p>
            <div className="flex flex-col gap-2">
              {completed.length === 0 ? (
                <p className="text-sm text-text-muted">No completed tasks yet.</p>
              ) : (
                completed.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border-muted bg-white/2 p-3 opacity-75"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-text-primary">
                        ✓ {item.title}
                      </strong>
                      <small className="text-xs text-text-secondary">
                        {item.owner} • {new Date(item.completedAt).toLocaleTimeString()}
                      </small>
                    </div>
                    <StatusBadge tone="success" label="Done" dot />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
