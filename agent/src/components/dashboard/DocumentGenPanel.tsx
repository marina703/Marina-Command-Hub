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
  generateDocument,
  type DocSection,
  type DocGenResult,
} from "@/lib/durable-api";

interface DocumentGenPanelProps {
  workspaceId: string | null;
  session: Session | null;
}

const FORMATS = [
  { value: "docx", label: "Word (.docx)" },
  { value: "pdf", label: "PDF (.pdf)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
];

/** Parse free text into sections: lines starting with "## " become headings. */
function parseSections(text: string): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection = {};
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      if (current.heading || current.body) sections.push(current);
      current = { heading: line.replace(/^##\s+/, "") };
    } else if (line.trim()) {
      current.body = (current.body ? current.body + "\n" : "") + line;
    }
  }
  if (current.heading || current.body) sections.push(current);
  return sections;
}

/** Parse tab/pipe-separated rows for xlsx. */
function parseRows(text: string): (string | number)[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|\|/).map((c) => c.trim()));
}

/** Natural-language document generation — .docx/.pdf/.xlsx deliverables. */
export function DocumentGenPanel({ workspaceId, session }: DocumentGenPanelProps) {
  const [format, setFormat] = useState<"docx" | "xlsx" | "pdf">("docx");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<DocGenResult | null>(null);

  const handleGenerate = async () => {
    if (!workspaceId || !session) {
      toast.error("Sign in to generate a document");
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a title");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const sections = parseSections(content);
      const rows = parseRows(content);
      const res = await generateDocument(workspaceId, session, {
        format,
        title: title.trim(),
        sections,
        rows,
        sheetName,
      });
      if (!res.ok) throw new Error("Generation failed");
      setResult(res);
      toast.success(`Generated ${res.filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate document");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!result?.base64 || !result.filename) return;
    const link = document.createElement("a");
    link.href = `data:application/octet-stream;base64,${result.base64}`;
    link.download = result.filename;
    link.click();
    toast.success("Downloaded");
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Deliverables"
        title="Document Generation"
        description="Create .docx, .pdf, or .xlsx deliverables from natural-language content."
        actions={
          <StatusBadge
            tone={result ? "success" : "neutral"}
            label={result ? result.filename ?? "Done" : "Ready"}
          />
        }
      />
      <CardBody>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as "docx" | "xlsx" | "pdf")}
            options={FORMATS}
            label="Format"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            label="Title"
          />
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            format === "xlsx"
              ? "Paste rows, one per line, separated by tabs or |\nItem\tCost\nHosting\t100\nDesign\t250"
              : "Write the document content. Use '## Heading' for section headings.\n\n## Overview\nThis is the executive summary."
          }
          rows={6}
          className="w-full resize-none rounded-xl border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent-primary/60"
        />

        {format === "xlsx" && (
          <div className="mt-3">
            <Input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Sheet name"
              label="Sheet name"
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            loading={generating}
            disabled={!title.trim()}
            onClick={handleGenerate}
          >
            Generate
          </Button>
          {result?.base64 && (
            <Button variant="outline" onClick={handleDownload}>
              Download
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
