"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Box,
  CheckCircle2,
  Circle,
  FileSearch,
  FlaskConical,
  GitBranch,
  ImageIcon,
  LoaderCircle,
  Plus,
  ScanLine,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api, post, type Dataset, type Model } from "@/lib/api";
import {
  decisionStages,
  stateLabel,
  stateTone,
  type CaseList,
  type DecisionDetail,
  type KnowledgeEvidence,
} from "@/lib/decisions";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Badge,
  DetailDrawer,
  Empty,
  ErrorNotice,
  FileUploader,
  FilterBar,
  InsightPanel,
  KeyValues,
  LoadingSkeleton,
  Metric,
  SectionHead,
  date,
  format,
} from "@/components/ui/workspace";

const base = "/decisions/investigations";
const colors = ["var(--accent)", "var(--blue)", "var(--success)", "var(--warning)"];
const isBusy = (state?: string) => state === "queued" || state === "running";
function Evidence({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="decision-evidence" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
function StateIcon({ state }: { state: string }) {
  return state === "completed" ? (
    <CheckCircle2 size={17} />
  ) : state === "failed" ? (
    <XCircle size={17} />
  ) : state === "running" ? (
    <LoaderCircle size={17} className="spin" />
  ) : state === "requires_review" ? (
    <ShieldCheck size={17} />
  ) : (
    <Circle size={17} />
  );
}

export default function DecisionIntelligence() {
  const client = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [newCase, setNewCase] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const list = useQuery({
    queryKey: ["decisions"],
    queryFn: () => api<CaseList>(base),
    refetchInterval: 5000,
  });
  const selectedId = selected || list.data?.items[0]?.id;
  const detail = useQuery({
    queryKey: ["decision", selectedId],
    queryFn: () => api<DecisionDetail>(`${base}/${selectedId}`),
    enabled: !!selectedId,
    refetchInterval: (q) => (isBusy(q.state.data?.job.state) ? 1500 : 5000),
  });
  const capabilities = useQuery({
    queryKey: ["decision-capabilities"],
    queryFn: () =>
      api<{ review_configured: boolean }>("/decisions/capabilities"),
  });
  const accept = (d: DecisionDetail) => {
    setSelected(d.id);
    client.setQueryData(["decision", d.id], d);
    client.invalidateQueries({ queryKey: ["decisions"] });
    client.invalidateQueries({ queryKey: ["experiments"] });
  };
  const demo = useMutation({
    mutationFn: () => post<DecisionDetail>("/decisions/demo", {}),
    onSuccess: (d) => {
      accept(d);
      toast("Synthetic investigation created. Analysis queued.");
    },
  });
  const submit = useMutation({
    mutationFn: () => post<DecisionDetail>(`${base}/${selectedId}/submit`, {}),
    onSuccess: (d) => {
      accept(d);
      toast("Evidence locked and submitted for human review.");
    },
  });
  const d = detail.data;
  const busy = isBusy(d?.job.state);
  const editable = d?.status === "Draft" && !busy;
  const k = d?.stages.knowledge_retrieval.result as
    KnowledgeEvidence | undefined;
  const cases =
    list.data?.items.filter(
      (i) =>
        `${i.title} ${i.component} ${i.batch_code}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!status || i.status === status),
    ) || [];
  return (
    <div className="decision-center">
      <div className="decision-toolbar">
        <div className="decision-promise">
          <ShieldCheck size={15} />
          <span>
            Evidence-led decisions <span className="muted">/</span>{" "}
            Human-controlled approval
          </span>
        </div>
        <div className="button-row">
          <Button
            variant="outline"
            onClick={() => demo.mutate()}
            disabled={demo.isPending}
          >
            {demo.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <FlaskConical size={15} />
            )}
            Run synthetic demo
          </Button>
          <Button onClick={() => setNewCase(true)}>
            <Plus size={15} />
            New investigation
          </Button>
        </div>
      </div>
      <ErrorNotice
        error={
          list.error ||
          detail.error ||
          demo.error ||
          submit.error ||
          capabilities.error
        }
      />
      {list.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : (
        <div className="decision-metrics">
          {[
            [
              "Active investigations",
              "active_investigations",
              "All open review states",
              Workflow,
            ],
            [
              "Critical incidents",
              "critical_incidents",
              "Reported severity · open cases",
              ScanLine,
            ],
            [
              "Components at risk",
              "components_at_risk",
              "Assessed forecast shortage",
              Box,
            ],
            [
              "Pending decisions",
              "pending_decisions",
              "Awaiting human review",
              ShieldCheck,
            ],
            [
              "Completed",
              "completed_investigations",
              "Closed investigations",
              CheckCircle2,
            ],
          ].map(([label, key, note, Icon]) => (
            <Metric
              key={String(key)}
              label={String(label)}
              value={list.data?.overview[String(key)] ?? "—"}
              detail={String(note)}
              icon={Icon as typeof Workflow}
            />
          ))}
        </div>
      )}
      <section className="panel decision-register">
        <SectionHead
          title="Investigation register"
          eyebrow="OPERATIONS / LIVE RECORDS"
          action={<Badge>{list.data?.items.length ?? 0} recent records</Badge>}
        />
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Find investigation, component or batch"
        >
          <select
            aria-label="Filter investigation status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {["Draft", "Awaiting Review", "Approved", "Rejected", "Closed"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </FilterBar>
        {cases.length ? (
          <div className="decision-case-list">
            {cases.map((i) => (
              <button
                className={`decision-case ${selectedId === i.id ? "selected" : ""}`}
                key={i.id}
                onClick={() => setSelected(i.id)}
                aria-pressed={selectedId === i.id}
              >
                <span className="decision-case-symbol">
                  <FileSearch size={19} />
                </span>
                <span className="decision-case-copy">
                  <strong>{i.title}</strong>
                  <small>
                    <code>{i.component}</code> · {i.batch_code} ·{" "}
                    {date(i.updated_at)}
                    {i.synthetic ? " · SYNTHETIC" : ""}
                  </small>
                </span>
                <Badge tone={stateTone(i.status)}>{i.status}</Badge>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={Workflow}
            title={
              search || status
                ? "No matching investigations"
                : "Start an evidence trail"
            }
          >
            Create an investigation from a production dataset, or run the
            clearly labelled synthetic demonstration.
          </Empty>
        )}
        {(list.data?.recent_completed.length ?? 0) > 0 && (
          <Evidence title="Recent completed investigations">
            {list.data!.recent_completed.map((i) => (
              <button
                key={i.id}
                className="text-button"
                onClick={() => setSelected(i.id)}
              >
                {i.title} · {date(i.updated_at)}
              </button>
            ))}
          </Evidence>
        )}
      </section>
      {detail.isLoading && selectedId ? (
        <LoadingSkeleton rows={5} />
      ) : (
        d && (
          <>
            <section className="decision-case-heading">
              <div>
                <span className="eyebrow">
                  INVESTIGATION <code>{d.id.slice(0, 8)}</code>
                </span>
                <h2>{d.title}</h2>
                <div className="button-row">
                  <Badge tone={stateTone(d.status)}>{d.status}</Badge>
                  <Badge tone={stateTone(d.severity)}>
                    {d.severity} severity
                  </Badge>
                  {d.synthetic && (
                    <Badge tone="amber">Synthetic manufacturing data</Badge>
                  )}
                  <span className="muted">Updated {date(d.updated_at)}</span>
                </div>
              </div>
              <Badge tone={stateTone(d.job.state)}>
                {busy && <LoaderCircle size={12} className="spin" />}Job:{" "}
                {d.job.state}
              </Badge>
            </section>
            {d.job.error && <ErrorNotice error={new Error(d.job.error)} />}
            <section className="panel">
              <SectionHead
                title="Industrial intelligence flow"
                eyebrow="SIGNAL → EVIDENCE → DECISION"
                action={
                  <span className="muted">Select a stage to inspect</span>
                }
              />
              <div className="decision-flow">
                {decisionStages.map(([key, label], index) => (
                  <button
                    key={key}
                    onClick={() => setStage(key)}
                    className={`decision-stage ${d.stages[key].state}`}
                  >
                    <span className="decision-stage-top">
                      <code>0{index + 1}</code>
                      <StateIcon state={d.stages[key].state} />
                    </span>
                    <strong>{label}</strong>
                    <small>{stateLabel(d.stages[key].state)}</small>
                  </button>
                ))}
              </div>
              <p className="decision-footnote">
                Progress is read from persisted worker events. A review flag can
                coexist with completed downstream calculations.
              </p>
            </section>
            <div className="decision-two-col">
              <section className="panel">
                <SectionHead
                  title="Quality investigation"
                  eyebrow="01 / INSPECTION EVIDENCE"
                  action={
                    <Badge
                      tone={d.quality.prediction.available ? "cyan" : "amber"}
                    >
                      {d.quality.prediction.available
                        ? "Model prediction"
                        : "Inference unavailable"}
                    </Badge>
                  }
                />
                <div className="decision-quality">
                  <div className="decision-image">
                    {d.quality.image_url ? (
                      <Image
                        unoptimized
                        width={640}
                        height={480}
                        src={`${d.quality.image_url}?v=${d.quality.image_checksum}`}
                        alt={`Inspection for batch ${d.batch.code}`}
                      />
                    ) : (
                      <div>
                        <ImageIcon size={30} />
                        <strong>No inspection image</strong>
                        <span>
                          Attach an image to use a registered vision checkpoint.
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <dl className="decision-facts">
                      <div>
                        <dt>Component / batch</dt>
                        <dd>
                          <code>{d.batch.component}</code>
                          <br />
                          <code>{d.batch.code}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Reported defect</dt>
                        <dd>{d.quality.reported_defect}</dd>
                      </div>
                      <div>
                        <dt>Inspected / rejected</dt>
                        <dd>
                          {d.quality.inspected_quantity} /{" "}
                          <span className="decision-warning">
                            {d.quality.rejected_quantity}
                          </span>{" "}
                          units
                        </dd>
                      </div>
                      <div>
                        <dt>Predicted category</dt>
                        <dd>
                          {d.quality.prediction.available
                            ? d.quality.prediction.predicted_class
                            : "Unavailable"}
                        </dd>
                      </div>
                      <div>
                        <dt>Confidence</dt>
                        <dd>
                          {d.quality.prediction.available
                            ? `${format((d.quality.prediction.confidence ?? 0) * 100)}%`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Model version / inference</dt>
                        <dd>
                          {d.quality.prediction.model_version || "—"}
                          <br />
                          {d.quality.prediction.inference_timestamp
                            ? date(d.quality.prediction.inference_timestamp)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                {!d.quality.prediction.available && (
                  <p className="decision-footnote">
                    {d.quality.prediction.reason}. Reported quantities remain
                    operator observations.
                  </p>
                )}
                {d.quality.prediction.explanation_artifact && (
                  <Evidence title="Model explanation heatmap">
                    <Image
                      unoptimized
                      width={640}
                      height={480}
                      className="decision-heatmap"
                      src={d.quality.prediction.explanation_artifact}
                      alt="Model explanation heatmap; attribution does not establish a root cause"
                    />
                  </Evidence>
                )}
                {editable && (
                  <Evidence title="Attach image and configure analysis">
                    <AnalysisControls key={d.id} detail={d} accept={accept} />
                  </Evidence>
                )}
                <p className="decision-footnote">
                  Batch association and counts are human-declared. An image
                  classification does not measure a batch reject rate.
                </p>
              </section>
              <section className="panel">
                <SectionHead
                  title="Knowledge intelligence"
                  eyebrow="02 / TRACEABLE CONTEXT"
                  action={<Badge>{k?.mode || "Awaiting retrieval"}</Badge>}
                />
                {k?.generation_error && (
                  <ErrorNotice error={new Error(k.generation_error)} />
                )}
                {k?.sources?.length ? (
                  <>
                    <p className="decision-footnote">
                      Retrieved passages · {k.embedding_mode}. Source relevance
                      does not establish causation.
                    </p>
                    <div className="decision-sources">
                      {k.sources.map((s, index) => (
                        <Evidence
                          key={s.chunk_id}
                          title={`[${index + 1}] ${s.filename}${s.page ? ` · p. ${s.page}` : ""}`}
                          open={index === 0}
                        >
                          <blockquote>{s.text}</blockquote>
                          <small className="mono muted">
                            Chunk {s.chunk_id.slice(0, 12)} · score{" "}
                            {format(s.score, 3)}
                          </small>
                          {s.document_checksum && (
                            <p className="decision-hash">
                              SHA256 {s.document_checksum}
                            </p>
                          )}
                        </Evidence>
                      ))}
                    </div>
                    <Evidence
                      title={`Possible causes · hypotheses (${k.possible_causes?.length || 0})`}
                    >
                      <p className="decision-warning">
                        Documented possibilities. No verified root cause.
                      </p>
                      {k.possible_causes?.map((c, i) => (
                        <p key={i}>
                          {c.text}{" "}
                          <span className="decision-citation">
                            [{c.citation}]
                          </span>
                        </p>
                      ))}
                    </Evidence>
                    <Evidence title="Suggested investigation steps">
                      {k.investigation_steps?.map((s, i) => (
                        <p key={i}>
                          {i + 1}. {s.text}{" "}
                          <span className="decision-citation">
                            [{s.citation}]
                          </span>
                        </p>
                      ))}
                    </Evidence>
                    <Evidence title="Explanation context · hypothesis">
                      <p>{k.answer}</p>
                    </Evidence>
                  </>
                ) : (
                  <Empty icon={FileSearch} title="No retrieved evidence yet">
                    Run analysis to search the existing technical document
                    index. Missing evidence will remain explicit.
                  </Empty>
                )}
              </section>
            </div>
            <section className="panel">
              <SectionHead
                title="Production impact"
                eyebrow="03 / DETERMINISTIC STOCK COVERAGE"
                action={
                  d.impact && (
                    <Badge tone="cyan">
                      Calculated · {d.impact.forecast.model}
                    </Badge>
                  )
                }
              />
              {d.impact ? (
                <>
                  <div className="decision-impact-grid">
                    {[
                      [
                        "Recorded stock",
                        d.impact.recorded_inventory,
                        `Snapshot ${d.impact.inventory_as_of}`,
                      ],
                      [
                        "Usable inventory",
                        d.impact.usable_inventory,
                        d.input.rejected_in_inventory
                          ? "Reported rejects subtracted"
                          : "Rejects outside stock snapshot",
                      ],
                      [
                        "Forecast demand",
                        d.impact.forecast_demand,
                        `${d.impact.forecast.forecast.length} days · model output`,
                      ],
                      [
                        "Supplier lead time",
                        d.impact.supplier_lead_time_days,
                        "Recorded days · arrival uncertain",
                      ],
                      [
                        "Potential shortage",
                        d.impact.potential_shortage,
                        "Forecast − usable stock, floor 0",
                      ],
                    ].map(([label, value, note]) => (
                      <div key={String(label)}>
                        <small>{label}</small>
                        <strong>
                          {format(Number(value), 1)}
                          <span>
                            {label === "Supplier lead time"
                              ? " days"
                              : " units"}
                          </span>
                        </strong>
                        <p>{note}</p>
                      </div>
                    ))}
                  </div>
                  <Evidence title="Calculation assumptions and linked evaluation">
                    <KeyValues
                      values={{
                        ...d.impact.assumptions,
                        dataset_version: d.batch.version_id,
                        forecast_id: d.impact.forecast_id,
                        evaluation_id: d.impact.evaluation_id,
                        experiment_id: d.impact.experiment_id,
                      }}
                    />
                  </Evidence>
                </>
              ) : (
                <Empty icon={Box} title="Production assessment pending">
                  Analysis will reuse forecasting and inventory simulation
                  against this component’s exact dataset version.
                </Empty>
              )}
            </section>
            <ScenarioPanel
              key={d.id}
              detail={d}
              editable={!!editable}
              accept={accept}
            />
            <section className="panel decision-recommendation">
              <SectionHead
                title="Decision recommendation"
                eyebrow="05 / EVIDENCE-BOUND PROPOSAL"
                action={<Badge tone="amber">Human approval required</Badge>}
              />
              {d.recommendation ? (
                <>
                  <div className="decision-proposal">
                    <div className="decision-proposal-icon">
                      <GitBranch size={25} />
                    </div>
                    <div>
                      <span className="eyebrow">
                        PROPOSED SCENARIO {d.recommendation.selected_scenario}
                      </span>
                      <h3>{d.recommendation.proposed_action}</h3>
                      <p>{d.recommendation.rationale}</p>
                    </div>
                  </div>
                  <div className="decision-two-col">
                    <div>
                      <Evidence title="Supporting evidence and model outputs">
                        <KeyValues
                          values={{
                            evidence: d.recommendation.supporting_evidence,
                            model_outputs: d.recommendation.model_outputs,
                          }}
                        />
                      </Evidence>
                      <Evidence title="Assumptions and expected simulated impact">
                        <KeyValues
                          values={{
                            assumptions: d.recommendation.assumptions,
                            simulated_impact:
                              d.recommendation.expected_simulated_impact,
                          }}
                        />
                      </Evidence>
                      <Evidence
                        title={`Explanation · ${d.recommendation.explanation.mode}`}
                      >
                        <p>{d.recommendation.explanation.text}</p>
                        <small>{d.recommendation.explanation.status}</small>
                      </Evidence>
                    </div>
                    <div>
                      <Evidence title="Uncertainty and operational risks" open>
                        <ul>
                          {[
                            ...d.recommendation.uncertainty,
                            ...d.recommendation.operational_risks,
                          ].map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </Evidence>
                      <Evidence title="Alternative actions">
                        {d.recommendation.alternative_actions.map((a) => (
                          <p key={a.code}>
                            <strong>{a.code}</strong> · {a.action}
                          </p>
                        ))}
                      </Evidence>
                    </div>
                  </div>
                  <div className="decision-approval-bar">
                    <div>
                      <ShieldCheck size={20} />
                      <span>
                        <strong>
                          {d.status === "Draft"
                            ? "Ready for engineering review"
                            : `Decision status: ${d.status}`}
                        </strong>
                        <small>
                          Approval records a local decision. Equipment, ERP and
                          production controls are not connected.
                        </small>
                      </span>
                    </div>
                    <div className="button-row">
                      {editable && (
                        <Button
                          onClick={() => submit.mutate()}
                          disabled={submit.isPending}
                        >
                          Submit for review
                          <ArrowRight size={15} />
                        </Button>
                      )}
                      {["Awaiting Review", "Approved", "Rejected"].includes(
                        d.status,
                      ) && (
                        <Button onClick={() => setReview(true)}>
                          <ShieldCheck size={15} />
                          {d.status === "Awaiting Review"
                            ? "Review decision"
                            : "Close decision"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <Evidence title="Evidence snapshot and review history">
                    <p className="decision-hash">
                      Recommendation {d.recommendation.id}
                      <br />
                      SHA256 {d.recommendation.evidence_hash}
                    </p>
                    {d.reviews.length ? (
                      d.reviews.map((r) => (
                        <article key={r.id} className="decision-review-record">
                          <Badge tone={stateTone(r.status)}>{r.status}</Badge>
                          <strong>{r.reviewer}</strong>
                          <small>{date(r.created_at)}</small>
                          <p>{r.comments}</p>
                          <small className="mono">
                            Recommendation {r.recommendation_id}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="muted">
                        No authenticated reviewer decision has been recorded.
                      </p>
                    )}
                  </Evidence>
                </>
              ) : (
                <Empty
                  icon={GitBranch}
                  title={
                    busy
                      ? "Building an evidence-backed proposal"
                      : "No current recommendation"
                  }
                >
                  A completed analysis and scenario run is required. Previous
                  snapshots remain in the audit trail when evidence changes.
                </Empty>
              )}
            </section>
            <section className="panel">
              <SectionHead
                title="Investigation timeline"
                eyebrow="06 / PERSISTED EXECUTION & AUDIT"
                action={<Badge>{d.events.length} stage events</Badge>}
              />
              <div className="decision-timeline">
                {d.events
                  .slice()
                  .reverse()
                  .map((e) => (
                    <Evidence
                      key={e.id}
                      title={`${date(e.created_at)} · ${stateLabel(e.stage)} · ${stateLabel(e.state)}`}
                    >
                      <KeyValues values={e.detail} />
                    </Evidence>
                  ))}
              </div>
              <Evidence title={`Audit trail · ${d.audit.length} records`}>
                <div className="decision-timeline">
                  {d.audit.map((a) => (
                    <Evidence
                      key={a.id}
                      title={`${date(a.created_at)} · ${a.action} · ${a.actor}`}
                    >
                      <KeyValues values={a.detail} />
                    </Evidence>
                  ))}
                </div>
              </Evidence>
            </section>
            {stage && (
              <DetailDrawer
                title={
                  decisionStages.find(([key]) => key === stage)?.[1] || stage
                }
                onClose={() => setStage(null)}
                wide
              >
                <Badge tone={stateTone(d.stages[stage].state)}>
                  {stateLabel(d.stages[stage].state)}
                </Badge>
                <p className="muted">
                  {d.stages[stage].updated_at
                    ? date(d.stages[stage].updated_at!)
                    : "This stage has not started."}
                </p>
                <KeyValues values={d.stages[stage].result} />
              </DetailDrawer>
            )}
            {review && (
              <ReviewDrawer
                detail={d}
                configured={!!capabilities.data?.review_configured}
                onClose={() => setReview(false)}
                accept={accept}
              />
            )}
          </>
        )
      )}
      {newCase && (
        <NewInvestigation
          onClose={() => setNewCase(false)}
          accept={(d) => {
            accept(d);
            setNewCase(false);
            toast("Investigation created. Attach evidence and run analysis.");
          }}
        />
      )}
    </div>
  );
}

function AnalysisControls({
  detail: d,
  accept,
}: {
  detail: DecisionDetail;
  accept: (d: DecisionDetail) => void;
}) {
  const [model, setModel] = useState("");
  const [forecast, setForecast] = useState("seasonal_naive");
  const [horizon, setHorizon] = useState(14);
  const [explanation, setExplanation] = useState("extractive");
  const toast = useToast();
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api<Model[]>("/models"),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<DecisionDetail>(`${base}/${d.id}/image`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: (next) => {
      accept(next);
      toast("Inspection image attached. Analyze to refresh evidence.");
    },
  });
  const analyze = useMutation({
    mutationFn: () =>
      post<DecisionDetail>(`${base}/${d.id}/analyze`, {
        model_id: model || null,
        forecast_model: forecast,
        horizon,
        explanation_mode: explanation,
      }),
    onSuccess: (next) => {
      accept(next);
      toast("Analysis queued on the decision worker.");
    },
  });
  return (
    <div className="decision-form">
      <ErrorNotice error={upload.error || analyze.error || models.error} />
      <FileUploader
        accept="image/png,image/jpeg,image/webp"
        title="Attach inspection image"
        description="Image classification requires a registered checkpoint"
        pending={upload.isPending}
        onFile={(file) => upload.mutate(file)}
      />
      <label>
        Vision checkpoint
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">Use active checkpoint if available</option>
          {models.data
            ?.filter((m) => m.module === "vision")
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.version} · {m.state}
              </option>
            ))}
        </select>
      </label>
      <div className="decision-form-grid">
        <label>
          Forecast model
          <select
            value={forecast}
            onChange={(e) => setForecast(e.target.value)}
          >
            <option value="seasonal_naive">Seasonal naive</option>
            <option value="xgboost">XGBoost</option>
            <option value="lstm">LSTM · optional runtime</option>
          </select>
        </label>
        <label>
          Horizon · days
          <input
            type="number"
            min={7}
            max={60}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        Explanation mode
        <select
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        >
          <option value="extractive">Extractive · cited passages</option>
          <option value="base">Base LLM · optional runtime</option>
          <option value="adapter">Adapter LLM · requires checkpoint</option>
        </select>
      </label>
      <Button
        onClick={() => analyze.mutate()}
        disabled={
          upload.isPending || analyze.isPending || horizon < 7 || horizon > 60
        }
      >
        {analyze.isPending ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Activity size={15} />
        )}
        Run integrated analysis
      </Button>
    </div>
  );
}

function ScenarioPanel({
  detail: d,
  editable,
  accept,
}: {
  detail: DecisionDetail;
  editable: boolean;
  accept: (d: DecisionDetail) => void;
}) {
  const toast = useToast();
  const [parameters, setParameters] = useState({
    recovery_yield: 0.25,
    reinspection_days: 2,
    supplier_delay_days: 0,
    schedule_shift_days: 3,
    annual_holding_rate: 0.2,
    reinspection_cost_per_unit: 2,
  });
  const [replacement, setReplacement] = useState("");
  const simulate = useMutation({
    mutationFn: () =>
      post<DecisionDetail>(`${base}/${d.id}/simulate`, {
        ...parameters,
        replacement_quantity: replacement ? Number(replacement) : null,
      }),
    onSuccess: (next) => {
      accept(next);
      toast("Scenario replay queued with your assumptions.");
    },
  });
  const points =
    d.scenarios[0]?.curve.map((point, index) =>
      Object.fromEntries([
        ["date", point.date],
        ...d.scenarios.map((s) => [s.code, s.curve[index]?.inventory]),
      ]),
    ) || [];
  const fields: [keyof typeof parameters, string, number, number, number][] = [
    ["recovery_yield", "Assumed recovery fraction", 0, 1, 0.05],
    ["reinspection_days", "Reinspection arrival · day", 1, 60, 1],
    ["supplier_delay_days", "Additional supplier delay · days", 0, 60, 1],
    ["schedule_shift_days", "Schedule shift · days", 1, 60, 1],
    ["annual_holding_rate", "Annual holding rate · fraction", 0, 2, 0.01],
    [
      "reinspection_cost_per_unit",
      "Reinspection cost / reject",
      0,
      100000,
      0.1,
    ],
  ];
  return (
    <section className="panel">
      <SectionHead
        title="Scenario simulator"
        eyebrow="04 / COMPARE HYPOTHETICAL ACTIONS"
        action={<Badge tone="amber">Simulated outcomes</Badge>}
      />
      <p className="decision-footnote">
        Service uses every original forecast due date. Shifting demand cannot
        improve service by removing demand from the denominator. Delay is a
        censored lower bound within this horizon.
      </p>
      <ErrorNotice error={simulate.error} />
      {d.impact && (
        <Evidence title="Edit scenario assumptions">
          <form
            className="decision-form"
            onSubmit={(e) => {
              e.preventDefault();
              simulate.mutate();
            }}
          >
            <fieldset disabled={!editable || simulate.isPending}>
              <div className="decision-form-grid">
                {fields.map(([key, label, min, max, step]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      required
                      min={min}
                      max={max}
                      step={step}
                      value={parameters[key]}
                      onChange={(e) =>
                        setParameters((p) => ({
                          ...p,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
                <label>
                  Replacement quantity
                  <input
                    type="number"
                    min={1}
                    max={10000000}
                    placeholder="Auto: ceil(forecast − usable stock)"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                  />
                </label>
              </div>
              <p className="decision-footnote">
                Day 0 is the first forecast date. Recovered rejects require
                separate quality release. Costs use dataset currency.
              </p>
              <Button type="submit" disabled={!editable || simulate.isPending}>
                <FlaskConical size={15} />
                Recalculate scenarios
              </Button>
            </fieldset>
          </form>
        </Evidence>
      )}
      {d.scenarios.length ? (
        <>
          <div className="decision-scenarios">
            {d.scenarios.map((s, i) => (
              <article
                key={s.id}
                className={`decision-scenario ${d.recommendation?.selected_scenario === s.code ? "recommended" : ""}`}
              >
                <div className="decision-scenario-top">
                  <span style={{ color: colors[i] }}>SCENARIO {s.code}</span>
                  <Badge tone={s.shortage_risk === "high" ? "amber" : "green"}>
                    {s.shortage_risk} shortage risk
                  </Badge>
                </div>
                <h3>{s.name}</h3>
                <div className="decision-scenario-value">
                  {format(s.service_level * 100, 1)}
                  <span>%</span>
                </div>
                <p className="muted">Original-date service · simulated</p>
                <dl className="decision-facts">
                  <div>
                    <dt>Unserved demand</dt>
                    <dd>{format(s.unserved_units, 1)} units</dd>
                  </div>
                  <div>
                    <dt>Ending inventory</dt>
                    <dd>{format(s.ending_inventory, 1)} units</dd>
                  </div>
                  <div>
                    <dt>Delay lower bound</dt>
                    <dd>{format(s.estimated_delay_days, 2)} days</dd>
                  </div>
                  <div>
                    <dt>Holding cost</dt>
                    <dd>{format(s.holding_cost, 2)}</dd>
                  </div>
                  <div>
                    <dt>Procurement / inspection</dt>
                    <dd>
                      {format(s.procurement_cost)} /{" "}
                      {format(s.reinspection_cost)}
                    </dd>
                  </div>
                  <div>
                    <dt>Deferred beyond horizon</dt>
                    <dd>{format(s.deferred_beyond_horizon, 1)} units</dd>
                  </div>
                </dl>
                <Evidence title="Persisted assumptions">
                  <KeyValues values={s.assumptions} />
                </Evidence>
                {d.recommendation?.selected_scenario === s.code && (
                  <span className="decision-selected-label">
                    <CheckCircle2 size={13} />
                    Rule-selected for review
                  </span>
                )}
              </article>
            ))}
          </div>
          <div className="decision-chart">
            <span className="eyebrow">
              PROJECTED END-OF-DAY INVENTORY · UNITS
            </span>
            <div
              role="img"
              aria-label="Inventory comparison for the four simulated scenarios"
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={points}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => String(v).slice(5)}
                    minTickGap={25}
                    stroke="var(--muted)"
                    fontSize={11}
                  />
                  <YAxis stroke="var(--muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  {d.scenarios.map((s, i) => (
                    <Line
                      key={s.code}
                      name={`Scenario ${s.code}`}
                      dataKey={s.code}
                      stroke={colors[i]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <Empty
          icon={FlaskConical}
          title="Four alternatives, one demand reference"
        >
          Complete production impact analysis to compare usable stock,
          reinspection, replacement and schedule adjustment.
        </Empty>
      )}
    </section>
  );
}

function NewInvestigation({
  onClose,
  accept,
}: {
  onClose: () => void;
  accept: (d: DecisionDetail) => void;
}) {
  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api<Dataset[]>("/production/datasets"),
  });
  const [version, setVersion] = useState("");
  const [component, setComponent] = useState("");
  const dataset =
    datasets.data?.find((d) => d.id === version) || datasets.data?.[0];
  const activeComponent = dataset?.components.includes(component)
    ? component
    : dataset?.components[0];
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      post<DecisionDetail>(base, body),
    onSuccess: accept,
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);
    create.mutate({
      ...body,
      version_id: dataset?.id,
      component: activeComponent,
      batch_quantity: Number(form.get("batch_quantity")),
      inspected_quantity: Number(form.get("inspected_quantity")),
      rejected_quantity: Number(form.get("rejected_quantity")),
      rejected_in_inventory: form.has("rejected_in_inventory"),
    });
  };
  return (
    <DetailDrawer title="New quality investigation" onClose={onClose}>
      <p className="muted">
        Connect an operator-reported quality signal to an existing component
        dataset. Batch associations are declarations.
      </p>
      <ErrorNotice error={datasets.error || create.error} />
      {datasets.isLoading ? (
        <LoadingSkeleton />
      ) : !dataset ? (
        <Empty title="A production dataset is required">
          Import or generate one in Production Intelligence, or use the
          synthetic demo.
        </Empty>
      ) : (
        <form className="decision-form" onSubmit={submit}>
          <label>
            Investigation title
            <input
              name="title"
              required
              minLength={4}
              maxLength={180}
              placeholder="e.g. Surface defect investigation"
            />
          </label>
          <label>
            Production dataset
            <select
              value={dataset.id}
              onChange={(e) => {
                setVersion(e.target.value);
                setComponent("");
              }}
            >
              {datasets.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.synthetic ? " · SYNTHETIC" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Component
            <select
              value={activeComponent}
              onChange={(e) => setComponent(e.target.value)}
            >
              {dataset.components.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Batch identifier
            <input
              name="batch_code"
              required
              pattern="[A-Za-z0-9_.\-]+"
              maxLength={100}
              placeholder="BATCH-001"
            />
          </label>
          <div className="decision-form-grid">
            {[
              ["batch_quantity", "Batch quantity", 1],
              ["inspected_quantity", "Inspected quantity", 1],
              ["rejected_quantity", "Rejected quantity", 0],
            ].map(([name, label, min]) => (
              <label key={String(name)}>
                {label}
                <input
                  name={String(name)}
                  type="number"
                  required
                  min={Number(min)}
                  max={10000000}
                  defaultValue={min}
                />
              </label>
            ))}
          </div>
          <label>
            Reported defect
            <input
              name="reported_defect"
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. pitting"
            />
          </label>
          <label>
            Reported severity
            <select name="severity" defaultValue="medium">
              {["low", "medium", "high", "critical"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="decision-check">
            <input name="rejected_in_inventory" type="checkbox" />
            <span>
              Reported rejected units are included in the recorded inventory
              snapshot and should be subtracted.
            </span>
          </label>
          <label>
            Investigation notes
            <textarea name="notes" maxLength={3000} rows={3} />
          </label>
          {dataset.synthetic && (
            <Badge tone="amber">
              This investigation will be labelled synthetic
            </Badge>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Plus size={15} />
            )}
            Create investigation
          </Button>
        </form>
      )}
    </DetailDrawer>
  );
}

function ReviewDrawer({
  detail: d,
  configured,
  onClose,
  accept,
}: {
  detail: DecisionDetail;
  configured: boolean;
  onClose: () => void;
  accept: (d: DecisionDetail) => void;
}) {
  const [identity, setIdentity] = useState("local-reviewer");
  const [token, setToken] = useState("");
  const [comments, setComments] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [action, setAction] = useState(
    d.status === "Awaiting Review" ? "approve" : "close",
  );
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () =>
      api<DecisionDetail>(`/decisions/${d.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reviewer-ID": identity,
          "X-Review-Token": token,
        },
        body: JSON.stringify({
          action,
          recommendation_id: d.recommendation!.id,
          evidence_hash: d.recommendation!.evidence_hash,
          comments,
          acknowledge_limitations: acknowledge,
        }),
      }),
    onSuccess: (next) => {
      setToken("");
      accept(next);
      toast("Authenticated decision recorded in the audit trail.");
      onClose();
    },
  });
  return (
    <DetailDrawer
      title={
        d.status === "Awaiting Review" ? "Review decision" : "Close decision"
      }
      onClose={onClose}
    >
      <Badge tone={stateTone(d.status)}>{d.status}</Badge>
      <h3>{d.recommendation?.proposed_action}</h3>
      <p className="decision-hash">
        Decision {d.id}
        <br />
        Recommendation {d.recommendation?.id}
        <br />
        Evidence SHA256 {d.recommendation?.evidence_hash}
      </p>
      <InsightPanel title="Local decision record">
        This records your decision inside AutoMind. Any procurement, schedule
        change or quality release requires a separate authorized operational
        process.
      </InsightPanel>
      <ErrorNotice error={mutation.error} />
      {!configured && (
        <ErrorNotice
          error={
            new Error(
              "Reviewer authentication is not configured. Initialize the local reviewer credential before review.",
            )
          }
        />
      )}
      <form
        className="decision-form"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset disabled={!configured || mutation.isPending}>
          <label>
            Reviewer ID
            <input
              required
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Reviewer token
            <input
              required
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="decision-footnote">
            Use the private local reviewer credential. The token stays in memory
            while this drawer is open.
          </p>
          <label>
            Decision
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {d.status === "Awaiting Review" ? (
                <>
                  <option value="approve">
                    Approve recommendation for the record
                  </option>
                  <option value="reject">Reject recommendation</option>
                </>
              ) : (
                <option value="close">Close investigation</option>
              )}
            </select>
          </label>
          <label>
            Reviewer comments
            <textarea
              required
              minLength={8}
              maxLength={3000}
              rows={4}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </label>
          <label className="decision-check">
            <input
              type="checkbox"
              required
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
            />
            <span>
              I have reviewed the evidence, assumptions and uncertainty. I
              understand this records a decision without executing operational
              changes.
            </span>
          </label>
          <Button
            type="submit"
            disabled={!configured || mutation.isPending || !acknowledge}
          >
            <ShieldCheck size={15} />
            Record{" "}
            {action === "close"
              ? "closure"
              : action === "reject"
                ? "rejection"
                : "approval"}
          </Button>
        </fieldset>
      </form>
    </DetailDrawer>
  );
}
