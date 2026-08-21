import type { ServiceStatus } from "@/types";

import { Card, CardBody, CardHeader, StatusBadge } from "@/components/ui";

interface ServicesMonitorProps {
  services: ServiceStatus[];
}

const TONE_MAP: Record<ServiceStatus["status"], "success" | "warning" | "error" | "info"> = {
  healthy: "success",
  online: "success",
  degraded: "warning",
  offline: "error",
  unreachable: "error",
};

export function ServicesMonitor({ services }: ServicesMonitorProps) {
  return (
    <Card>
      <CardHeader
        eyebrow="Infrastructure"
        title="Services"
        description="Health of external services and integrations."
      />

      <CardBody>
        {services.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            No services monitored.
          </p>
        ) : (
          <ul className="space-y-2">
            {services.map((service) => (
              <li
                key={service.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {service.name}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {service.details}
                  </p>
                </div>
                <StatusBadge
                  tone={TONE_MAP[service.status] ?? "info"}
                  label={service.status}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
