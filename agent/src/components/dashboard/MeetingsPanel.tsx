import { useState } from "react";
import { Plus } from "lucide-react";

import { toast } from "sonner";
import type { MeetingItem } from "@/types";
import { createMeeting } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";

interface MeetingsPanelProps {
  meetings: MeetingItem[];
  onRefresh: () => void;
}

export function MeetingsPanel({ meetings, onRefresh }: MeetingsPanelProps) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [agenda, setAgenda] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await createMeeting({
        title,
        time,
        agenda: agenda
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success("Meeting scheduled", {
        description: `"${title}" added to the agenda.`,
      });
      setTitle("");
      setTime("");
      setAgenda("");
      onRefresh();
    } catch (err) {
      toast.error("Could not schedule meeting", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="AI Team"
        title="Meetings"
        description="Upcoming AI team meeting agenda."
      />

      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Meeting title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly sprint review"
          />
          <Input
            label="Time"
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Agenda (one item per line)
            </label>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={3}
              placeholder={"Review blockers\nPlan next sprint"}
              className="w-full resize-none rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={submitting}
          >
            <Plus className="h-4 w-4" />
            Schedule Meeting
          </Button>
        </form>

        <div className="mt-5 space-y-2">
          {meetings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
              No meetings scheduled.
            </p>
          ) : (
            meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="rounded-lg border border-border-muted bg-surface-2 p-3 transition hover:border-accent-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {meeting.title}
                  </p>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {meeting.time}
                  </span>
                </div>
                {meeting.agenda.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {meeting.agenda.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs text-text-secondary"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-text-muted">
                  {meeting.owner}
                </p>
              </div>
            ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}
