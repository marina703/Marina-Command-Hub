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
  memoryAction,
  emailInbound,
  slackDeliverable,
  agentBusAction,
} from "@/lib/durable-api";

interface AgentToolsPanelProps {
  workspaceId: string | null;
  session: Session | null;
}

const SLACK_TYPES = [
  { value: "proposal", label: "Proposal" },
  { value: "product-spec", label: "Product Spec" },
  { value: "campaign-plan", label: "Campaign Plan" },
  { value: "meeting-summary", label: "Meeting Summary" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-3/60 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-primary">
        {title}
      </h4>
      {children}
    </div>
  );
}

/** Phase 4C/4E — memory, email-to-agent, slack deliverables, agent bus. */
export function AgentToolsPanel({ workspaceId, session }: AgentToolsPanelProps) {
  // Memory
  const [recallQuery, setRecallQuery] = useState("");
  const [memoryResult, setMemoryResult] = useState<string>("");
  const [memoryBusy, setMemoryBusy] = useState(false);

  // Email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailResult, setEmailResult] = useState<string>("");
  const [emailBusy, setEmailBusy] = useState(false);

  // Slack
  const [slackType, setSlackType] = useState("proposal");
  const [slackThread, setSlackThread] = useState("");
  const [slackBusy, setSlackBusy] = useState(false);

  // Agent bus
  const [agentId, setAgentId] = useState("");
  const [agentCaps, setAgentCaps] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [delegateTask, setDelegateTask] = useState("");
  const [busResult, setBusResult] = useState<string>("");
  const [busBusy, setBusBusy] = useState(false);

  const authed = !!workspaceId && !!session;

  const handleRecall = async () => {
    if (!authed || !recallQuery.trim()) return;
    setMemoryBusy(true);
    try {
      const res = await memoryAction(workspaceId, session, { action: "recall", query: recallQuery, depth: 2 });
      setMemoryResult(JSON.stringify(res, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recall failed");
    } finally {
      setMemoryBusy(false);
    }
  };

  const handleEmail = async () => {
    if (!authed || (!emailSubject && !emailBody)) return;
    setEmailBusy(true);
    try {
      const res = await emailInbound(workspaceId, session, { subject: emailSubject, body: emailBody });
      setEmailResult(JSON.stringify(res, null, 2));
      toast.success("Task + plan created from email");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Email processing failed");
    } finally {
      setEmailBusy(false);
    }
  };

  const handleSlack = async () => {
    if (!authed || !slackThread.trim()) return;
    setSlackBusy(true);
    try {
      const messages = slackThread.split("\n").map((line) => ({ user: "thread", text: line.trim() })).filter((m) => m.text);
      const res = await slackDeliverable(workspaceId, session, { messages, type: slackType, format: "docx" });
      if (res.base64 && res.filename) {
        const link = document.createElement("a");
        link.href = `data:application/octet-stream;base64,${res.base64}`;
        link.download = res.filename;
        link.click();
        toast.success(`Downloaded ${res.filename}`);
      } else {
        toast.error("No deliverable returned");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Slack deliverable failed");
    } finally {
      setSlackBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!authed || !agentId.trim()) return;
    setBusBusy(true);
    try {
      const caps = agentCaps.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await agentBusAction(workspaceId, session, { action: "register", id: agentId, capabilities: caps });
      setBusResult(JSON.stringify(res, null, 2));
      toast.success(`Registered agent ${agentId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Register failed");
    } finally {
      setBusBusy(false);
    }
  };

  const handleDelegate = async () => {
    if (!authed || !delegateTo.trim() || !delegateTask.trim()) return;
    setBusBusy(true);
    try {
      const res = await agentBusAction(workspaceId, session, { action: "delegate", to: delegateTo, task: delegateTask });
      setBusResult(JSON.stringify(res, null, 2));
      toast.success("Task delegated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delegate failed");
    } finally {
      setBusBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Phase 4C / 4E"
        title="Agent Tools"
        description="Memory, email-to-agent, Slack deliverables, and cross-agent coordination."
        actions={<StatusBadge tone={authed ? "success" : "warning"} label={authed ? "Ready" : "Sign in"} />}
      />
      <CardBody className="space-y-4">
        {/* Memory */}
        <Section title="Memory">
          <div className="flex gap-2">
            <Input value={recallQuery} onChange={(e) => setRecallQuery(e.target.value)} placeholder="Recall query…" />
            <Button variant="primary" size="sm" loading={memoryBusy} onClick={handleRecall} disabled={!authed}>
              Recall
            </Button>
          </div>
          {memoryResult && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-1 p-2 text-xs">{memoryResult}</pre>}
        </Section>

        {/* Email-to-agent */}
        <Section title="Email-to-Agent">
          <div className="flex flex-col gap-2">
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={2}
              placeholder="Email body…"
              className="w-full resize-none rounded-xl border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent-primary/60"
            />
            <Button variant="primary" size="sm" loading={emailBusy} onClick={handleEmail} disabled={!authed}>
              Create task
            </Button>
          </div>
          {emailResult && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-1 p-2 text-xs">{emailResult}</pre>}
        </Section>

        {/* Slack deliverables */}
        <Section title="Slack Deliverables">
          <div className="flex flex-col gap-2">
            <Select value={slackType} onChange={(e) => setSlackType(e.target.value)} options={SLACK_TYPES} label="Type" />
            <textarea
              value={slackThread}
              onChange={(e) => setSlackThread(e.target.value)}
              rows={3}
              placeholder="Paste thread messages, one per line…"
              className="w-full resize-none rounded-xl border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent-primary/60"
            />
            <Button variant="primary" size="sm" loading={slackBusy} onClick={handleSlack} disabled={!authed}>
              Generate document
            </Button>
          </div>
        </Section>

        {/* Agent bus */}
        <Section title="Agent Bus">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Agent id" />
              <Input value={agentCaps} onChange={(e) => setAgentCaps(e.target.value)} placeholder="capabilities (comma)" />
              <Button variant="outline" size="sm" loading={busBusy} onClick={handleRegister} disabled={!authed}>
                Register
              </Button>
            </div>
            <div className="flex gap-2">
              <Input value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} placeholder="Delegate to…" />
              <Input value={delegateTask} onChange={(e) => setDelegateTask(e.target.value)} placeholder="Task…" />
              <Button variant="primary" size="sm" loading={busBusy} onClick={handleDelegate} disabled={!authed}>
                Delegate
              </Button>
            </div>
          </div>
          {busResult && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-1 p-2 text-xs">{busResult}</pre>}
        </Section>
      </CardBody>
    </Card>
  );
}
