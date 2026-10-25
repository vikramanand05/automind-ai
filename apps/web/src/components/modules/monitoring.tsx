"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseTelemetry } from "@/lib/telemetry";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Database,
  Gauge,
  Server,
  Zap,
} from "lucide-react";
import type { SystemStatus } from "@/lib/api";
import {
  Badge,
  SectionHead,
  InsightPanel,
  Metric,
  format,
} from "@/components/ui/workspace";
export default function Monitoring({ system }: { system?: SystemStatus }) {
  const [range, setRange] = useState("Last 15 minutes");
  const telemetry = useQuery({
    queryKey: ["telemetry"],
    queryFn: async () => {
      const response = await fetch("/telemetry/metrics");
      if (!response.ok) throw new Error("Metrics endpoint unavailable");
      return parseTelemetry(await response.text());
    },
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="filter-bar">
        <div
          className="range-tabs"
          role="group"
          aria-label="Monitoring time range"
        >
          {["Last 15 minutes", "Last hour", "Last 24 hours", "Last 7 days"].map(
            (r) => (
              <button
                key={r}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ),
          )}
        </div>
        <a
          className="btn btn-outline btn-sm"
          href="http://localhost:3001"
          target="_blank"
          rel="noreferrer"
        >
          Open Grafana
          <ArrowUpRight size={13} />
        </a>
      </div>
      <div className="monitor-grid">
        {[
          {
            label: "REST API",
            icon: Server,
            state: system ? "Responding" : "Unavailable",
            healthy: !!system,
          },
          {
            label: "Database",
            icon: Database,
            state: system?.database || "Unavailable",
            healthy: system?.database === "connected",
          },
          {
            label: "Redis broker",
            icon: Zap,
            state: system?.redis || "Unavailable",
            healthy: system?.redis === "connected",
          },
        ].map((s) => (
          <section className="panel" key={s.label}>
            <SectionHead
              title={s.label}
              action={<s.icon size={17} className="muted" />}
            />
            <Badge tone={s.healthy ? "green" : "amber"}>{s.state}</Badge>
            <p className="chart-note">
              Current backend observation · refreshed every 30 seconds. This is
              not historical uptime.
            </p>
          </section>
        ))}
      </div>
      <section className="panel">
        <SectionHead
          title="Recorded API telemetry"
          action={<Badge>Process lifetime · not selected range</Badge>}
        />
        {telemetry.data ? (
          <>
            <div className="metrics-grid">
              <Metric
                icon={Server}
                label="Recorded API requests"
                value={format(telemetry.data.requests, 0)}
                detail="Instrumented requests since process start"
              />
              <Metric
                icon={Gauge}
                label="Mean request duration"
                value={`${format(telemetry.data.meanLatencyMs)} ms`}
                detail="Sum / count · not a percentile"
              />
              <Metric
                icon={Activity}
                label="Recorded 5xx rate"
                value={
                  telemetry.data.requests
                    ? `${format((telemetry.data.errors / telemetry.data.requests) * 100)}%`
                    : "—"
                }
                detail={`${telemetry.data.errors} server-error responses recorded`}
              />
              <Metric
                icon={Cpu}
                label="API process started"
                value={
                  telemetry.data.startedAt
                    ? new Date(telemetry.data.startedAt).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "—"
                }
                detail={
                  telemetry.data.startedAt
                    ? new Date(telemetry.data.startedAt).toLocaleDateString()
                    : "Process start metric unavailable"
                }
              />
            </div>
            <div className="table-wrap">
              <table aria-label="API route telemetry">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Recorded requests</th>
                    <th>Mean duration</th>
                    <th>5xx responses</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.data.routes.slice(0, 12).map((r) => (
                    <tr key={r.path}>
                      <td>
                        <code>{r.path}</code>
                      </td>
                      <td>{r.requests}</td>
                      <td className="mono">{format(r.latencyMs)} ms</td>
                      <td>{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="chart-note">
              Counters reset when this API process restarts. Only instrumented
              /api routes are included; health probes, metric scrapes and early
              middleware rejections are excluded. A cumulative observation does
              not establish historical availability.
            </p>
          </>
        ) : (
          <div className="monitor-unavailable">
            <Gauge size={22} />
            <strong className="small-text">
              {telemetry.isLoading
                ? "Reading backend metrics…"
                : "Metrics unavailable"}
            </strong>
            <p>
              Recorded process counters will appear when the existing metrics
              endpoint can be read.
            </p>
          </div>
        )}
      </section>
      <div className="two-columns">
        {[
          {
            title: "API latency & request volume",
            icon: Gauge,
            note: "Request duration percentiles, rate and error counts require the Prometheus query API.",
          },
          {
            title: "Worker & GPU telemetry",
            icon: Cpu,
            note: "Worker heartbeat and GPU utilization are not exposed by the current backend.",
          },
          {
            title: "Model inference latency",
            icon: Activity,
            note: "Individual prediction latency is returned in the inspection result. Aggregate telemetry is unavailable.",
          },
          {
            title: "Error rate & availability",
            icon: Server,
            note: "Historical error rates and availability require the optional monitoring stack.",
          },
        ].map((s) => (
          <section className="panel" key={s.title}>
            <SectionHead title={s.title} action={<Badge>{range}</Badge>} />
            <div className="monitor-unavailable">
              <s.icon size={24} />
              <strong className="small-text">
                Historical telemetry unavailable
              </strong>
              <p>{s.note}</p>
            </div>
          </section>
        ))}
      </div>
      <InsightPanel title="Connect the optional monitoring stack">
        The API exposes real Prometheus metrics at <code>/metrics</code>. Start
        the optional Prometheus/Grafana services to inspect measured time
        series. The selected range applies to historical panels; connectivity
        observations above are current snapshots.
        <div className="button-row" style={{ marginTop: 12 }}>
          <a
            className="text-link"
            href="http://localhost:9090"
            target="_blank"
            rel="noreferrer"
          >
            Prometheus
            <ArrowUpRight size={13} />
          </a>
          <a
            className="text-link"
            href={`${system?.public_api_url || "http://localhost:18000"}/metrics`}
            target="_blank"
            rel="noreferrer"
          >
            API metrics
            <ArrowUpRight size={13} />
          </a>
        </div>
      </InsightPanel>
    </>
  );
}
