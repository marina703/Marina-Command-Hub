import { useEffect, useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui";
import { getSystemMetrics } from "@/lib/api";
import type { SystemMetrics as SystemMetricsData } from "@/types";

interface SystemMetricsProps {
  system?: Record<string, number>;
}

interface MetricRow {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** 0-100 for the progress bar. */
  percent: number;
  accent: "primary" | "secondary";
}

function buildRows(data: SystemMetricsData | null): MetricRow[] {

  if (!data) return [];

  const rows: MetricRow[] = [
    {
      key: "cpu",
      label: "CPU",
      value: Math.round(data.cpu.percent),
      unit: "%",
      percent: Math.min(100, Math.max(0, data.cpu.percent)),
      accent: "primary",
    },
    {
      key: "memory",
      label: "Memory",
      value: Math.round(data.memory.percent),
      unit: "%",
      percent: Math.min(100, Math.max(0, data.memory.percent)),
      accent: "secondary",
    },
    {
      key: "disk",
      label: "Disk",
      value: Math.round(data.disk.percent),
      unit: "%",
      percent: Math.min(100, Math.max(0, data.disk.percent)),
      accent: "secondary",
    },
    {
      key: "network",
      label: "Network",
      value: data.network.downloadMbps,
      unit: "Mbps",
      percent: Math.min(100, Math.max(0, data.network.downloadMbps)),
      accent: "secondary",
    },
    {
      key: "processes",
      label: "Processes",
      value: data.processes.count,
      unit: "",
      percent: Math.min(100, Math.max(0, data.processes.count)),
      accent: "secondary",
    },
    {
      key: "uptime",
      label: "Uptime",
      value: data.uptime.seconds,
      unit: "s",
      percent: 100,
      accent: "secondary",
    },
  ];

  if (data.temperature) {
    rows.push({
      key: "temperature",
      label: "Temp",
      value: Math.round(data.temperature.celsius),
      unit: "°C",
      percent: Math.min(100, Math.max(0, data.temperature.celsius)),
      accent: "secondary",
    });
  }

  return rows;
}

export function SystemMetrics(_props: SystemMetricsProps) {
  const [metrics, setMetrics] = useState<SystemMetricsData | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await getSystemMetrics();
        if (!cancelled) {
          setMetrics(res.metrics);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load metrics");
        }
      }
    };

    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = buildRows(metrics);

  return (
    <Card>
      <CardHeader
        eyebrow="Live"
        title="System Metrics"
        description="Real-time resource utilization."
      />
      <CardBody>
        {error ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            No metrics available.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-1.5 rounded-xl border border-border-muted bg-white/2 p-3 transition-colors hover:border-border-strong"
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    className={
                      row.accent === "primary"
                        ? "text-lg font-bold text-accent-primary"
                        : "text-lg font-bold text-accent-secondary"
                    }
                  >
                    {row.value}
                    {row.unit}
                  </span>
                  <span className="text-[0.68rem] uppercase tracking-wider text-text-secondary">
                    {row.label}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-muted">
                  <div
                    className={
                      row.accent === "primary"
                        ? "h-full rounded-full bg-accent-primary transition-all duration-500"
                        : "h-full rounded-full bg-accent-secondary transition-all duration-500"
                    }
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
