"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronRight,
  Cpu,
  FlaskConical,
  GitBranch,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  type SystemStatus,
  type Experiment,
  type Forecast,
  type Model,
  type Job,
  type Pipeline,
} from "@/lib/api";
import { compatibleExperiments } from "@/lib/workspace";
import {
  LoadingSkeleton,
  Badge,
  Empty,
  ErrorNotice,
  Metric,
  SectionHead,
  InsightPanel,
  format,
  date,
} from "@/components/ui/workspace";
import { Chart, ModelPerformance } from "@/components/charts";
import { ExperimentTable } from "@/components/experiment-table";
export default function Overview({ system }: { system?: SystemStatus }) {
  const router = useRouter();
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
  });
  const forecasts = useQuery({
    queryKey: ["forecasts"],
    queryFn: () => api<Forecast[]>("/production/forecasts"),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api<Model[]>("/models"),
  });
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/training/jobs"),
    refetchInterval: 10000,
  });
  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Pipeline[]>("/pipelines"),
  });
  const [component, setComponent] = useState("");
  const latest = forecasts.data?.[0];
  const active = models.data?.filter((m) => m.state === "active").length;
  const running = jobs.data?.filter((j) =>
    ["queued", "running", "cancelling"].includes(j.status),
  ).length;
  const production =
    experiments.data?.filter(
      (e) => e.module === "production" && e.metrics.mae != null,
    ) || [];
  const chosen =
    production.find((e) => e.config.component === component) || production[0];
  const matching = chosen
    ? production.filter(
        (e) => e.id === chosen.id || compatibleExperiments([chosen, e]),
      )
    : [];
  const unique = matching.filter(
    (e, i, a) => a.findIndex((x) => x.model === e.model) === i,
  );
  const quality = experiments.data?.find((e) => e.module === "vision");
  const events = [
    ...(experiments.data || []).map((e) => ({
      id: e.id,
      title: "Model evaluation recorded",
      detail: `${e.model} · ${e.module}`,
      time: e.created_at,
      icon: FlaskConical,
      href: `/experiments?inspect=${e.id}`,
      status: "completed",
    })),
    ...(pipelines.data || []).map((p) => ({
      id: p.id,
      title: `Dataset ingestion ${p.status}`,
      detail: `${format(Number(p.report.rows) || 0, 0)} rows · ${p.id.slice(0, 8)}`,
      time: p.created_at,
      icon: GitBranch,
      href: `/pipelines?inspect=${p.id}`,
      status: p.status,
    })),
    ...(jobs.data || []).map((j) => ({
      id: j.id,
      title: `Training job ${j.status}`,
      detail: `${j.kind} · ${j.id.slice(0, 8)}`,
      time: j.created_at,
      icon: Cpu,
      href: "/training",
      status: j.status,
    })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 5);
  if (
    experiments.isLoading ||
    forecasts.isLoading ||
    models.isLoading ||
    jobs.isLoading ||
    pipelines.isLoading
  )
    return <LoadingSkeleton rows={6} />;
  return (
    <>
      <ErrorNotice
        error={
          experiments.error ||
          forecasts.error ||
          models.error ||
          jobs.error ||
          pipelines.error
        }
      />
      <div className="metrics-grid">
        <Metric
          label="Active AI Models"
          value={active ?? "—"}
          detail={
            <>
              <Badge tone={active ? "green" : "neutral"}>
                {active ? "Active checkpoints" : "No deployment"}
              </Badge>
              <div>
                {models.data?.length ?? "—"} registered · artifact health
                checked on use
              </div>
            </>
          }
          icon={Box}
        />
        <Metric
          label="Manufacturing Quality"
          value={
            quality ? `${format(quality.metrics.f1_macro * 100, 1)}%` : "—"
          }
          detail={
            quality ? (
              <>
                <Badge>Macro F1</Badge>Latest recorded vision evaluation
              </>
            ) : (
              <>
                No inspection aggregate available.
                <br />
                Train a model to establish quality metrics.
              </>
            )
          }
          icon={ScanLine}
        />
        <Metric
          label="Forecast Performance"
          value={latest ? format(latest.metrics.mae, 2) : "—"}
          detail={
            latest ? (
              <>
                <Badge tone="cyan">MAE · {latest.component}</Badge>
                <div>3 × 7-day rolling holdouts · {latest.model}</div>
              </>
            ) : (
              "Run a forecasting experiment to measure error."
            )
          }
          icon={Activity}
        />
        <Metric
          label="AI Operations"
          value={running ?? "—"}
          detail={
            <>
              <Badge tone={running ? "cyan" : "neutral"}>
                {running ? "Active training jobs" : "Queue idle"}
              </Badge>
              <div>
                {system?.counts.experiments ?? "—"} experiments ·{" "}
                {pipelines.data?.filter((p) => p.status === "failed").length ??
                  "—"}{" "}
                failed ingestions
              </div>
            </>
          }
          icon={Cpu}
        />
      </div>
      <div className="overview-grid">
        <section className="panel production-panel">
          <SectionHead
            title="Production Intelligence"
            action={
              <Link className="text-link" href="/production">
                Open planner
                <ArrowUpRight size={13} />
              </Link>
            }
          />
          {latest ? (
            <>
              <div className="chart-summary">
                <div>
                  <strong>
                    {format(
                      latest.forecast.reduce(
                        (sum, p) => sum + (p.predicted || 0),
                        0,
                      ),
                      0,
                    )}
                    <span
                      className="muted"
                      style={{ fontSize: 11, marginLeft: 8 }}
                    >
                      units
                    </span>
                  </strong>
                  <small>
                    Projected demand · next {latest.forecast.length} days ·{" "}
                    {latest.component}
                  </small>
                </div>
                <Badge tone={latest.synthetic ? "amber" : "blue"}>
                  {latest.synthetic ? "Synthetic dataset" : "Uploaded dataset"}
                </Badge>
              </div>
              <div className="chart-legend">
                <span>
                  <i />
                  Actual demand
                </span>
                <span>
                  <i className="blue-line" />
                  Forecast
                </span>
                <span className="muted">Units / day</span>
              </div>
              <Chart
                data={[...latest.history.slice(-45), ...latest.forecast]}
              />
              <div className="table-footer">
                <span>{latest.model} · residual bands are uncalibrated</span>
                <span className="mono">
                  MAE {format(latest.metrics.mae)} · WAPE{" "}
                  {format(latest.metrics.wape * 100)}%
                </span>
              </div>
            </>
          ) : (
            <Empty
              icon={Activity}
              title="No forecasts generated yet"
              action={
                <Link className="btn btn-outline" href="/production">
                  Import dataset
                  <ArrowRight size={13} />
                </Link>
              }
            >
              Import production data and run a forecasting experiment.
            </Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead
            title="Model Performance"
            action={<Badge>Lower MAE is better</Badge>}
          />
          <p className="panel-subtitle">
            Identical dataset, component and horizon
          </p>
          {chosen && (
            <label className="field" style={{ margin: "8px 0" }}>
              <span className="sr-only">Compare component</span>
              <select
                aria-label="Compare component"
                value={String(chosen.config.component)}
                onChange={(e) => setComponent(e.target.value)}
              >
                {Array.from(
                  new Set(production.map((e) => String(e.config.component))),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {unique.length > 1 ? (
            <>
              <ModelPerformance
                data={unique.map((e) => ({
                  model: e.model,
                  mae: e.metrics.mae,
                }))}
              />
              <p className="chart-note">
                Measured rolling-origin MAE in demand units. Runs with
                incompatible evaluation settings are excluded.
              </p>
            </>
          ) : (
            <Empty icon={FlaskConical} title="A comparison needs two models">
              Evaluate compatible runs on the same dataset and settings.
            </Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead
            title="Industrial Intelligence Activity"
            action={
              <span className="freshness">
                <span className="online-dot" />
                Recorded events
              </span>
            }
          />
          {events.length ? (
            <div className="activity-list">
              {events.map((e) => (
                <Link className="activity-item" href={e.href} key={e.id}>
                  <div className="activity-icon">
                    <e.icon size={15} />
                  </div>
                  <div>
                    <strong>{e.title}</strong>
                    <p>{e.detail}</p>
                  </div>
                  <span className="activity-time">{date(e.time)}</span>
                  <ChevronRight size={13} className="muted" />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No activity recorded yet">
              Upload a dataset or run an experiment to build your activity
              history.
            </Empty>
          )}
        </section>
        <section className="panel">
          <SectionHead
            title="AI Operations"
            action={
              <Link className="text-link" href="/monitoring">
                Monitor
                <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="operation-row">
            <span>Training queue</span>
            <Badge tone={running ? "cyan" : "neutral"}>
              {running ?? "—"} active
            </Badge>
          </div>
          <div className="operation-row">
            <span>Latest pipeline</span>
            <Badge
              tone={
                pipelines.data?.[0]?.status === "completed"
                  ? "green"
                  : "neutral"
              }
            >
              {pipelines.data?.[0]?.status || "No runs"}
            </Badge>
          </div>
          <div className="operation-row">
            <span>Database</span>
            <Badge tone={system?.database === "connected" ? "green" : "amber"}>
              {system?.database || "Unavailable"}
            </Badge>
          </div>
          <div className="operation-row">
            <span>Redis broker</span>
            <Badge tone={system?.redis === "connected" ? "green" : "amber"}>
              {system?.redis || "Unavailable"}
            </Badge>
          </div>
          <InsightPanel
            title={
              system?.training_enabled
                ? "Training submissions enabled"
                : "Lightweight workspace"
            }
          >
            {system?.training_enabled
              ? "Jobs require an available Celery worker. Broker connectivity alone does not establish worker liveness."
              : "Knowledge retrieval and CPU forecasting are available. Training submissions are disabled by the current runtime configuration."}
          </InsightPanel>
        </section>
        <section className="panel span-all">
          <SectionHead
            title="Recent Experiments"
            action={
              <Link className="text-link" href="/experiments">
                All experiments
                <ArrowRight size={13} />
              </Link>
            }
          />
          {experiments.data?.length ? (
            <ExperimentTable
              data={experiments.data.slice(0, 4)}
              onInspect={(e) => router.push(`/experiments?inspect=${e.id}`)}
            />
          ) : (
            <Empty icon={FlaskConical} title="No experiments recorded">
              Run a forecast or submit a training job to record measured
              results.
            </Empty>
          )}
        </section>
      </div>
      <div className="module-shortcuts">
        {[
          { label: "Knowledge workspace", href: "/knowledge", icon: BookOpen },
          { label: "Visual inspection", href: "/vision", icon: ScanLine },
          { label: "Training Studio", href: "/training", icon: Cpu },
        ].map((m) => (
          <Link key={m.href} href={m.href}>
            <m.icon size={16} />
            {m.label}
            <ArrowUpRight size={14} />
          </Link>
        ))}
      </div>
      <div className="provenance-note">
        <ShieldCheck size={13} />
        <span>
          Recorded results only. Synthetic datasets and software-mechanics
          fixtures do not establish industrial performance.
        </span>
        <span className="freshness" style={{ marginLeft: "auto" }}>
          Fetched{" "}
          {experiments.dataUpdatedAt
            ? new Date(experiments.dataUpdatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>
    </>
  );
}
