"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, FlaskConical, LoaderCircle, Plus, X } from "lucide-react";
import { api, post, type Job, type Experiment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  LoadingSkeleton,
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  KeyValues,
  InsightPanel,
  format,
} from "@/components/ui/workspace";
import { TrainingProgress } from "@/components/charts";
import { useToast } from "@/components/providers";
type Config = {
  name: string;
  kind: string;
  dataset: string;
  available: boolean;
  parameters: Record<string, number>;
};
const limits: Record<string, [number, number]> = {
  learning_rate: [0.00000001, 0.1],
  batch_size: [1, 64],
  gradient_accumulation: [1, 128],
  epochs: [1, 1000],
  max_sequence_length: [32, 4096],
  lora_rank: [1, 128],
  lora_alpha: [1, 512],
  dropout: [0, 0.5],
  seed: [0, 2147483647],
  patience: [1, 100],
  hidden_size: [1, 512],
  horizon: [1, 60],
};
export default function Training({ enabled }: { enabled: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/training/jobs"),
    refetchInterval: 5000,
  });
  const catalog = useQuery({
    queryKey: ["training-configurations"],
    queryFn: () => api<Config[]>("/training/configurations"),
  });
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
  });
  const [kind, setKind] = useState("lora");
  const [config, setConfig] = useState("lora-cpu");
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [dataset, setDataset] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selectedConfig = catalog.data?.find((c) => c.name === config);
  const datasets = Array.from(
    new Set(catalog.data?.filter((c) => c.kind === kind).map((c) => c.dataset)),
  );
  const selectedJob =
    jobs.data?.find((j) => j.id === selectedId) || jobs.data?.[0];
  const submit = useMutation({
    mutationFn: () =>
      post<Job>("/training/jobs", {
        kind,
        config_name: config,
        dataset: dataset || selectedConfig?.dataset,
        parameters,
      }),
    onSuccess: (j) => {
      client.invalidateQueries({ queryKey: ["jobs"] });
      setSelectedId(j.id);
      toast("Training job submitted to the queue.");
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => post(`/training/jobs/${id}/cancel`, {}),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["jobs"] });
      toast(
        "Cancellation requested. The worker stops at its next safe checkpoint.",
      );
    },
  });
  const history = Array.isArray(selectedJob?.result?.history)
    ? (selectedJob.result.history as Record<string, unknown>[])
    : [];
  const params = Object.entries(selectedConfig?.parameters || {});
  const main = params.filter(([k]) =>
    [
      "learning_rate",
      "batch_size",
      "epochs",
      "lora_rank",
      "lora_alpha",
    ].includes(k),
  );
  const advanced = params.filter(([k]) => !main.some(([m]) => m === k));
  const field = ([key, value]: [string, number]) => (
    <label className="field" key={key}>
      {key.replaceAll("_", " ")}
      <input
        type="number"
        step={["learning_rate", "dropout"].includes(key) ? "any" : 1}
        min={limits[key]?.[0]}
        max={limits[key]?.[1]}
        required
        value={parameters[key] ?? value}
        onChange={(e) =>
          setParameters((p) => ({ ...p, [key]: Number(e.target.value) }))
        }
      />
    </label>
  );
  if (catalog.isLoading || jobs.isLoading) return <LoadingSkeleton rows={6} />;
  return (
    <>
      <div className="info-banner">
        <Cpu size={20} />
        <div>
          <strong>
            {enabled
              ? "Training submissions enabled"
              : "Training is disabled in lightweight mode"}
          </strong>
          <p>
            Configurations remain editable. Actual execution requires the
            optional ML runtime and an available Celery worker.
          </p>
        </div>
        <Badge tone={enabled ? "green" : "amber"}>
          {enabled ? "Worker required" : "Read / configure"}
        </Badge>
      </div>
      <ErrorNotice
        error={
          jobs.error ||
          catalog.error ||
          experiments.error ||
          submit.error ||
          cancel.error
        }
      />
      <div className="training-layout">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <SectionHead
            title="Training Configuration"
            action={<Badge>Versioned</Badge>}
          />
          <label className="field">
            Training task
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setParameters({});
                setDataset("");
                setConfig(
                  e.target.value === "lora"
                    ? "lora-cpu"
                    : e.target.value === "vision"
                      ? "vision-resnet50"
                      : "forecast-lstm",
                );
              }}
            >
              <option value="lora">Language adaptation</option>
              <option value="vision">Surface defect classification</option>
              <option value="forecast">Demand forecasting · LSTM</option>
            </select>
          </label>
          <label className="field">
            Versioned configuration
            <select
              value={config}
              onChange={(e) => {
                setConfig(e.target.value);
                setParameters({});
                setDataset("");
              }}
            >
              {(catalog.data?.filter((c) => c.kind === kind) || []).map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {kind === "lora" ? "Base model (preset)" : "Architecture (preset)"}
            <select
              aria-label="Base model preset"
              value="preset"
              onChange={() => {}}
            >
              <option value="preset">
                {kind === "lora"
                  ? "SmolLM2 · 135M Instruct"
                  : kind === "vision"
                    ? config.replace("vision-", "")
                    : "LSTM"}
              </option>
            </select>
            <span className="field-hint">
              Fixed by the approved configuration.
            </span>
          </label>
          <label className="field">
            Dataset
            <select
              value={dataset || selectedConfig?.dataset || ""}
              onChange={(e) => setDataset(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {selectedConfig && !selectedConfig.available && (
            <p className="chart-note">
              Configured dataset not present. Add the documented local data
              before execution.
            </p>
          )}
          <div className="two-columns">{main.map(field)}</div>
          <details className="advanced-settings">
            <summary>
              Advanced parameters{" "}
              <span className="muted">/ {advanced.length} settings</span>
            </summary>
            <div className="two-columns">{advanced.map(field)}</div>
            <label className="field">
              Quantization
              <input
                readOnly
                value={
                  config === "qlora-gpu"
                    ? "4-bit · CUDA required"
                    : "None · preset configuration"
                }
              />
            </label>
          </details>
          <div className="config-preview">
            <span className="eyebrow">Configuration source</span>
            <code>experiments/configurations/{config}.yaml</code>
            <p>Source YAML and overrides are recorded with each job.</p>
          </div>
          <Button
            type="submit"
            disabled={!enabled || submit.isPending || !selectedConfig}
          >
            {submit.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Plus size={15} />
            )}
            Submit training job
          </Button>
        </form>
        <section className="panel">
          <SectionHead
            title="Training Progress"
            action={<Badge>{jobs.data?.length ?? "—"} jobs</Badge>}
          />
          <div className="training-state">
            <Cpu size={24} />
            <div>
              <strong>
                {selectedJob
                  ? `${selectedJob.kind} · ${selectedJob.status}`
                  : "No active training run"}
              </strong>
              <small>
                {selectedJob
                  ? selectedJob.id.slice(0, 18)
                  : "Submit a configuration to begin"}
              </small>
            </div>
          </div>
          {selectedJob ? (
            <>
              <div className="training-status">
                <div>
                  <span>Recorded state</span>
                  <Badge
                    tone={
                      selectedJob.status === "completed"
                        ? "green"
                        : selectedJob.status === "failed"
                          ? "red"
                          : "cyan"
                    }
                  >
                    {selectedJob.status}
                  </Badge>
                </div>
                <div>
                  <span>Current step / ETA</span>
                  <span>Not exposed</span>
                </div>
                <div>
                  <span>Recorded epochs</span>
                  <span className="mono">
                    {history.length ? history.length : "—"}
                  </span>
                </div>
              </div>
              {selectedJob.error && (
                <div className="error" role="alert">
                  {selectedJob.error}
                </div>
              )}
              {history.length ? (
                <TrainingProgress history={history} />
              ) : (
                <div className="telemetry-empty">
                  Live step, loss, learning-rate and completion estimates are
                  not exposed by the job API. Completed runs display their
                  recorded history when available.
                </div>
              )}
              {["running", "queued"].includes(selectedJob.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  style={{ marginTop: 16 }}
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(selectedJob.id)}
                >
                  <X size={14} />
                  Cancel job
                </Button>
              )}
            </>
          ) : (
            <Empty icon={Cpu} title="No training jobs yet">
              Submit a versioned configuration to track actual execution state,
              checkpoints and measured results.
            </Empty>
          )}
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Execution queue</h3>
          {jobs.data?.map((j) => (
            <button
              className={`job-card ${selectedJob?.id === j.id ? "selected" : ""}`}
              key={j.id}
              onClick={() => setSelectedId(j.id)}
            >
              <div>
                <Cpu size={14} />
                <strong>{j.kind}</strong>
                <Badge
                  tone={
                    j.status === "completed"
                      ? "green"
                      : j.status === "failed"
                        ? "red"
                        : "neutral"
                  }
                >
                  {j.status}
                </Badge>
              </div>
              <code>{j.id.slice(0, 24)}</code>
            </button>
          ))}
        </section>
        <aside className="panel training-details">
          <SectionHead title="Experiment Details" />
          <KeyValues
            values={
              selectedJob
                ? {
                    job_id: selectedJob.id,
                    created_at: selectedJob.created_at,
                    configuration: selectedJob.config,
                    result: selectedJob.result,
                  }
                : {
                    training_method:
                      config === "qlora-gpu"
                        ? "QLoRA"
                        : kind === "lora"
                          ? "LoRA"
                          : kind,
                    base_model:
                      kind === "lora"
                        ? "HuggingFaceTB/SmolLM2-135M-Instruct"
                        : "Defined by preset",
                    quantization: config === "qlora-gpu" ? "4-bit" : "None",
                    dataset_version: "Recorded at execution",
                    hardware: "Recorded in experiment provenance",
                    duration: "Available after recorded execution",
                  }
            }
          />
          <InsightPanel title="Controlled model lifecycle">
            Completed training registers a candidate. Activate a checkpoint from
            the registry after reviewing its evaluation.
            <Link
              href="/models"
              className="text-link"
              style={{ marginTop: 10 }}
            >
              Open Model Registry
            </Link>
          </InsightPanel>
        </aside>
      </div>
      <section className="panel">
        <SectionHead
          title="Language adaptation comparison"
          action={
            <Link className="text-link" href="/experiments">
              Experiment Laboratory
            </Link>
          }
        />
        <p className="panel-subtitle">
          Base · Fine-tuned · RAG · Fine-tuned + RAG
        </p>
        {experiments.data?.some(
          (e) => e.module === "knowledge" && e.config.evaluation_protocol,
        ) ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recorded model</th>
                  <th>Evaluation protocol</th>
                  <th>Correctness</th>
                  <th>Groundedness</th>
                </tr>
              </thead>
              <tbody>
                {experiments.data
                  .filter(
                    (e) =>
                      e.module === "knowledge" && e.config.evaluation_protocol,
                  )
                  .map((e) => (
                    <tr key={e.id}>
                      <td>{e.model}</td>
                      <td>{String(e.config.evaluation_protocol)}</td>
                      <td>{format(e.metrics.manual_correctness)}</td>
                      <td>{format(e.metrics.manual_groundedness)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={FlaskConical}
            title="Four-way quality evaluation not recorded"
          >
            Run the documented evaluation protocol and independent human
            annotations. No placeholder quality scores are displayed.
          </Empty>
        )}
      </section>
    </>
  );
}
