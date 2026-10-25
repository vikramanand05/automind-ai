"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, ArrowUpRight } from "lucide-react";
import { api, type Experiment } from "@/lib/api";
import { compatibleExperiments } from "@/lib/workspace";
import {
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  FilterBar,
  DetailDrawer,
  KeyValues,
  LoadingSkeleton,
} from "@/components/ui/workspace";
import { ExperimentTable } from "@/components/experiment-table";
import { ModelPerformance } from "@/components/charts";
export default function Experiments() {
  const runs = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
  });
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const searchParams = useSearchParams();
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const deepId = searchParams.get("inspect");
  const inspect =
    runs.data?.find(
      (e) => e.id === (inspectedId || (deepId !== dismissedId ? deepId : null)),
    ) || null;
  const setInspect = (value: Experiment | null) => {
    setInspectedId(value?.id || null);
    if (!value) setDismissedId(deepId);
  };
  const filtered =
    runs.data?.filter(
      (e) =>
        (module === "all" || e.module === module) &&
        `${e.model} ${e.id} ${e.dataset_version_id}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const comparison = runs.data?.filter((e) => selected.includes(e.id)) || [];
  const compatible = compatibleExperiments(comparison);
  const metric =
    comparison[0]?.module === "production"
      ? "mae"
      : comparison[0]?.module === "vision"
        ? "f1_macro"
        : "retrieval_recall_at_4";
  return (
    <>
      <div className="info-banner">
        <FlaskConical size={20} />
        <div>
          <strong>Every result has a provenance trail</strong>
          <p>
            Select compatible runs to compare metrics. Null or unrecorded
            evaluation values remain unavailable.
          </p>
        </div>
        <a
          href="http://localhost:5000"
          className="btn btn-outline"
          target="_blank"
          rel="noreferrer"
        >
          MLflow
          <ArrowUpRight size={13} />
        </a>
      </div>
      <ErrorNotice error={runs.error} />
      <section className="panel">
        <SectionHead
          title="Recorded experiments"
          action={<Badge>{runs.data?.length ?? "—"} runs</Badge>}
        />
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search model, run ID or dataset…"
        >
          <select
            aria-label="Filter experiment module"
            value={module}
            onChange={(e) => setModule(e.target.value)}
          >
            <option value="all">All modules</option>
            {Array.from(new Set(runs.data?.map((e) => e.module))).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </FilterBar>
        {runs.isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length ? (
          <ExperimentTable
            data={filtered}
            onInspect={setInspect}
            selected={selected}
            onSelect={(id) =>
              setSelected((s) =>
                s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
              )
            }
          />
        ) : (
          <Empty
            icon={FlaskConical}
            title={
              search || module !== "all"
                ? "No matching experiments"
                : "No experiments recorded"
            }
          >
            Run a forecast or training job to record metrics and artifacts.
          </Empty>
        )}
        <div className="table-footer">
          <span>
            {filtered.length} of {runs.data?.length || 0} records
          </span>
          <span>Select rows to compare · Column headers sort</span>
        </div>
      </section>
      {selected.length > 0 && (
        <section className="panel">
          <SectionHead
            title="Experiment comparison"
            action={
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            }
          />
          {selected.length < 2 ? (
            <p className="muted small-text">
              Select at least two compatible runs.
            </p>
          ) : compatible ? (
            <>
              <ModelPerformance
                data={comparison.map((e) => ({
                  model: `${e.model} · ${e.id.slice(0, 4)}`,
                  [metric]: e.metrics[metric],
                }))}
                metric={metric}
              />
              <p className="chart-note">
                Same dataset and evaluation configuration ·{" "}
                {metric.replaceAll("_", " ")}. Unrecorded metrics are omitted.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      {Object.keys(comparison[0].metrics)
                        .filter((k) =>
                          comparison.every(
                            (e) => typeof e.metrics[k] === "number",
                          ),
                        )
                        .map((k) => (
                          <th key={k}>{k}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.model} <code>{e.id.slice(0, 8)}</code>
                        </td>
                        {Object.keys(comparison[0].metrics)
                          .filter((k) =>
                            comparison.every(
                              (e) => typeof e.metrics[k] === "number",
                            ),
                          )
                          .map((k) => (
                            <td className="mono" key={k}>
                              {e.metrics[k].toFixed(4)}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="error" role="status">
              These runs use different datasets or evaluation settings. Select
              compatible experiments to compare.
            </div>
          )}
        </section>
      )}
      {inspect && (
        <DetailDrawer title={inspect.model} onClose={() => setInspect(null)}>
          <Badge tone="cyan">{inspect.module}</Badge>
          <h3>Run overview</h3>
          <KeyValues
            values={{
              experiment_id: inspect.id,
              created_at: inspect.created_at,
              dataset_version: inspect.dataset_version_id,
              duration_seconds: inspect.duration_seconds,
              mlflow_run_id: inspect.mlflow_run_id,
            }}
          />
          <h3>Measured evaluation</h3>
          <KeyValues values={inspect.metrics} />
          <h3>Hyperparameters</h3>
          <KeyValues values={inspect.config} />
          <h3>Provenance and hardware</h3>
          <KeyValues values={inspect.provenance} />
          <h3>Artifact references</h3>
          {Object.keys(inspect.artifacts || {}).length ? (
            <KeyValues values={inspect.artifacts || {}} />
          ) : (
            <p className="muted small-text">
              No artifacts recorded for this run.
            </p>
          )}
        </DetailDrawer>
      )}
    </>
  );
}
