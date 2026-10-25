"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Database,
  GitBranch,
  Minus,
} from "lucide-react";
import { api, type Pipeline, type Dataset } from "@/lib/api";
import {
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  FilterBar,
  DetailDrawer,
  KeyValues,
  LoadingSkeleton,
  date,
} from "@/components/ui/workspace";
export default function Pipelines() {
  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Pipeline[]>("/pipelines"),
  });
  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api<Dataset[]>("/production/datasets"),
  });
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const searchParams = useSearchParams();
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const deepId = searchParams.get("inspect");
  const inspect =
    pipelines.data?.find(
      (e) => e.id === (inspectedId || (deepId !== dismissedId ? deepId : null)),
    ) || null;
  const setInspect = (value: Pipeline | null) => {
    setInspectedId(value?.id || null);
    if (!value) setDismissedId(deepId);
  };
  const filtered =
    pipelines.data?.filter(
      (p) =>
        (state === "all" || p.status === state) &&
        `${p.id} ${p.status}`.includes(search),
    ) || [];
  const last = pipelines.data?.find((p) => p.status === "completed");
  return (
    <>
      <section className="panel">
        <SectionHead
          title="Ingestion execution history"
          action={
            <Link className="btn btn-outline btn-sm" href="/production">
              Import dataset
            </Link>
          }
        />
        <div
          className="table-footer"
          style={{ borderTop: 0, paddingTop: 0, marginBottom: 18 }}
        >
          <span>
            Last successful execution:{" "}
            {last ? date(last.created_at) : "No successful runs recorded"}
          </span>
          <span>Durations are not recorded by this API.</span>
        </div>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search execution ID or status…"
        >
          <select
            aria-label="Filter pipeline state"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option>completed</option>
            <option>failed</option>
          </select>
        </FilterBar>
        <ErrorNotice error={pipelines.error || datasets.error} />
        {pipelines.isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Execution</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Duplicates removed</th>
                  <th>Missing after cleaning</th>
                  <th>Created</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="table-action mono"
                        onClick={() => setInspect(p)}
                      >
                        {p.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      <Badge
                        tone={
                          p.status === "completed"
                            ? "green"
                            : p.status === "failed"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td>{String(p.report.rows ?? "—")}</td>
                    <td>{String(p.report.duplicates_removed ?? "—")}</td>
                    <td>{String(p.report.missing_after ?? "—")}</td>
                    <td className="muted">{date(p.created_at)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Inspect execution ${p.id.slice(0, 8)}`}
                        onClick={() => setInspect(p)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={GitBranch} title="No pipeline executions found">
            Import a CSV or generate synthetic production data to record data
            quality checks.
          </Empty>
        )}
      </section>
      <section className="panel">
        <SectionHead
          title="Dataset versions"
          action={<Badge>{datasets.data?.length ?? "—"} versions</Badge>}
        />
        {datasets.data?.length ? (
          <div className="dataset-list">
            {datasets.data.map((d) => (
              <div key={d.id}>
                <Database size={19} className="muted" />
                <div>
                  <strong>{d.name}</strong>
                  <p>
                    {d.rows.toLocaleString()} rows · {d.components.length}{" "}
                    components
                  </p>
                  <code>SHA256 {d.checksum}</code>
                </div>
                <Badge tone={d.synthetic ? "amber" : "blue"}>
                  {d.synthetic ? "Synthetic" : "Uploaded"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No datasets yet">
            Validated dataset versions appear after ingestion.
          </Empty>
        )}
      </section>
      {inspect && (
        <DetailDrawer
          wide
          title={`Execution ${inspect.id.slice(0, 8)}`}
          onClose={() => setInspect(null)}
        >
          <Badge tone={inspect.status === "completed" ? "green" : "red"}>
            {inspect.status}
          </Badge>
          <h3>Ingestion workflow</h3>
          <div className="pipeline-flow">
            {["Ingest", "Validate", "Clean", "Version", "Persist"].map(
              (s, i) => (
                <div key={s}>
                  <div className="pipeline-step">
                    <span>{i + 1}</span>
                    <strong>{s}</strong>
                    {inspect.status === "completed" ? (
                      <Check size={13} />
                    ) : (
                      <Minus size={13} />
                    )}
                  </div>
                  {i < 4 && <ArrowRight size={13} />}
                </div>
              ),
            )}
          </div>
          <p className="chart-note">
            Stages run sequentially. A completed execution confirms the
            ingestion transaction; individual stage timestamps are not recorded.
            For failed runs, the failing stage is not inferred.
          </p>
          <h3>Execution record</h3>
          <KeyValues
            values={{
              id: inspect.id,
              status: inspect.status,
              created_at: inspect.created_at,
              duration: "Not recorded",
              stage_logs: "Not exposed by this API",
            }}
          />
          <h3>Data quality and errors</h3>
          <KeyValues values={inspect.report} />
        </DetailDrawer>
      )}
    </>
  );
}
