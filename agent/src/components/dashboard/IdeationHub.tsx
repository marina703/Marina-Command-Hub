import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";

import { toast } from "sonner";
import type { IdeaItem } from "@/types";
import { createIdea } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";

interface IdeationHubProps {
  ideas: IdeaItem[];
  onRefresh: () => void;
}

const CATEGORIES = ["Product", "Marketing", "Automation", "Research"];

export function IdeationHub({ ideas, onRefresh }: IdeationHubProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await createIdea({ title, category, description });
      toast.success("Idea captured", {
        description: `"${title}" added to the brainstorm stream.`,
      });
      setTitle("");
      setDescription("");
      onRefresh();
    } catch (err) {
      toast.error("Could not save idea", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Brainstorm"
        title="Ideation Hub"
        description="Capture and stream new ideas for the AI team."
      />

      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Idea title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Automated weekly client digest"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={submitting}
              >
                <Plus className="h-4 w-4" />
                Add Idea
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-5 space-y-2">
          {ideas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
              No ideas yet. Capture the first one above.
            </p>
          ) : (
            ideas.map((idea) => (
              <div
                key={idea.id}
                className="group flex items-start gap-3 rounded-lg border border-border-muted bg-surface-2 p-3 transition hover:border-accent-primary/40"
              >
                <span className="mt-0.5 rounded-md bg-accent-primary/10 p-1.5 text-accent-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {idea.title}
                    </p>
                    <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      {idea.category}
                    </span>
                  </div>
                  {idea.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                      {idea.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-text-muted">
                    {idea.owner}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}
