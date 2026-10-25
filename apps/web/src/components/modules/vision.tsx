"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cpu,
  LoaderCircle,
  Move,
  RotateCcw,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  api,
  type VisionModels,
  type Prediction,
  type Experiment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  LoadingSkeleton,
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  FileUploader,
  Metric,
  format,
} from "@/components/ui/workspace";
export default function Vision() {
  const models = useQuery({
    queryKey: ["vision-models"],
    queryFn: () => api<VisionModels>("/vision/models"),
  });
  const evaluations = useQuery({
    queryKey: ["vision-evaluations"],
    queryFn: () => api<Experiment[]>("/vision/evaluations"),
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [model, setModel] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [split, setSplit] = useState(50);
  const [evaluationId, setEvaluationId] = useState("");
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const [dimensions, setDimensions] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const predict = useMutation({
    mutationFn: () => {
      const body = new FormData();
      if (file) body.append("file", file);
      if (model) body.append("model_id", model);
      return api<Prediction>("/vision/predict", { method: "POST", body });
    },
  });
  function selectFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDimensions("");
    predict.reset();
  }
  const available = !!models.data?.models.some(
    (m) => m.id === model || (!model && m.state === "active"),
  );
  const evaluation =
    evaluations.data?.find((e) => e.id === evaluationId) ||
    evaluations.data?.[0];
  const measured = evaluation?.metrics as Record<string, unknown> | undefined;
  const matrix = measured?.confusion_matrix as number[][] | undefined;
  const perClass = measured?.per_class as
    | Record<
        string,
        {
          precision: number;
          recall: number;
          "f1-score": number;
          support: number;
        }
      >
    | undefined;
  const classes = Object.keys(perClass || {}).filter(
    (k) => !["accuracy", "macro avg", "weighted avg", "micro avg"].includes(k),
  );
  if (models.isLoading || evaluations.isLoading)
    return <LoadingSkeleton rows={6} />;
  return (
    <>
      <div className="info-banner">
        <ScanLine size={20} />
        <div>
          <strong>
            {models.data?.status === "model_not_trained"
              ? "No trained inspection model available"
              : "Checkpoint-based visual inspection"}
          </strong>
          <p>
            Inspect an image with a registered checkpoint. Model attribution is
            generated from that prediction.
          </p>
        </div>
        <Link className="btn btn-outline btn-sm" href="/training">
          Open Training Studio
        </Link>
      </div>
      <ErrorNotice error={models.error || evaluations.error || predict.error} />
      <div className="two-columns">
        <section className="panel">
          <SectionHead
            title="Image Inspection"
            action={<Badge>PNG · JPEG · WebP</Badge>}
          />
          {!preview ? (
            <FileUploader
              accept="image/png,image/jpeg,image/webp"
              onFile={selectFile}
              title="Drop a surface image here"
              description="or browse an inspection image"
            />
          ) : (
            <>
              <div
                className="image-stage"
                aria-label="Inspection image viewport"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ox: offset.x,
                    oy: offset.y,
                  };
                }}
                onPointerMove={(e) => {
                  if (drag.current)
                    setOffset({
                      x: drag.current.ox + e.clientX - drag.current.x,
                      y: drag.current.oy + e.clientY - drag.current.y,
                    });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <Image
                  unoptimized
                  width={640}
                  height={480}
                  src={preview}
                  alt="Uploaded inspection image"
                  style={{
                    transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
                  }}
                  onLoad={(e) =>
                    setDimensions(
                      `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`,
                    )
                  }
                />
              </div>
              <div className="image-controls">
                <button
                  className="icon-button"
                  aria-label="Zoom out"
                  disabled={zoom <= 0.5}
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                >
                  <ZoomOut size={17} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  className="icon-button"
                  aria-label="Zoom in"
                  disabled={zoom >= 4}
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                >
                  <ZoomIn size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Reset image view"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <Move size={14} className="muted" />
                <span>Drag to pan</span>
              </div>
              <div className="image-metadata">
                <span>{file?.name}</span>
                <span>{format((file?.size || 0) / 1024, 1)} KB</span>
                <span>{dimensions}</span>
              </div>
              <FileUploader
                accept="image/png,image/jpeg,image/webp"
                onFile={selectFile}
                title="Replace image"
                description="Select another inspection image"
              />
            </>
          )}
          <label className="field">
            Inspection model
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                predict.reset();
              }}
            >
              <option value="">Active registered model</option>
              {models.data?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.version} · {m.state}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => predict.mutate()}
            disabled={!file || !available || predict.isPending}
          >
            {predict.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ScanLine size={15} />
            )}
            Run inspection
          </Button>
          {!available && (
            <p className="chart-note">
              No checkpoint is selected. Train and activate a model to enable
              inspection.
            </p>
          )}
        </section>
        <section className="panel">
          <SectionHead
            title="AI Analysis"
            action={
              <Badge
                tone={
                  predict.isPending
                    ? "cyan"
                    : predict.data
                      ? "green"
                      : "neutral"
                }
              >
                {predict.isPending
                  ? "Processing"
                  : predict.data
                    ? "Completed"
                    : "Awaiting image"}
              </Badge>
            }
          />
          {predict.data ? (
            <div className="prediction">
              <Badge tone="green">Checkpoint inference</Badge>
              <h2>{predict.data.predicted_class}</h2>
              <div className="prediction-confidence">
                {format(predict.data.confidence * 100, 1)}%
                <small>model confidence</small>
              </div>
              <p className="mono">
                {predict.data.model_version} · {format(predict.data.latency_ms)}{" "}
                ms
              </p>
              <p className="chart-note">
                Confidence is a softmax score, not a calibrated guarantee of
                correctness.
              </p>
              {predict.data.explanation_artifact && (
                <>
                  <h3 style={{ marginTop: 24 }}>Prediction explainability</h3>
                  <div className="explanation-comparison">
                    <Image
                      unoptimized
                      width={640}
                      height={480}
                      src={preview}
                      alt="Original inspection image"
                    />
                    <Image
                      unoptimized
                      width={640}
                      height={480}
                      src={predict.data.explanation_artifact}
                      alt={`${predict.data.explanation_method} attribution overlay`}
                      style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `${split}%`,
                        top: 0,
                        bottom: 0,
                        borderLeft: "2px solid var(--accent)",
                      }}
                    />
                  </div>
                  <div className="explanation-labels">
                    <span>Attribution overlay</span>
                    <span>Original</span>
                  </div>
                  <label className="field">
                    Compare original and attribution
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      onChange={(e) => setSplit(Number(e.target.value))}
                    />
                  </label>
                  <p>{predict.data.explanation_method}</p>
                </>
              )}
            </div>
          ) : (
            <Empty
              icon={ScanLine}
              title="An inspection needs evidence"
              action={
                <Link className="text-link" href="/models">
                  Review Model Registry
                </Link>
              }
            >
              Upload an image and select a trained model to see its defect
              category, confidence, version, measured latency and supported
              attribution.
            </Empty>
          )}
        </section>
      </div>
      <section className="panel">
        <SectionHead
          title="Model Evaluation"
          action={
            evaluations.data?.length ? (
              <select
                aria-label="Select vision evaluation"
                value={evaluation?.id || ""}
                onChange={(e) => setEvaluationId(e.target.value)}
              >
                {evaluations.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.model} · {e.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : (
              <Badge>No recorded evaluations</Badge>
            )
          }
        />
        {evaluation ? (
          <>
            <div className="metrics-grid">
              <Metric
                icon={ScanLine}
                label="Accuracy"
                value={`${format(Number(measured?.accuracy) * 100)}%`}
                detail="Recorded held-out evaluation"
              />
              <Metric
                icon={ScanLine}
                label="Precision"
                value={format(Number(measured?.precision_macro), 3)}
                detail="Macro average"
              />
              <Metric
                icon={ScanLine}
                label="Recall"
                value={format(Number(measured?.recall_macro), 3)}
                detail="Macro average"
              />
              <Metric
                icon={ScanLine}
                label="F1-score"
                value={format(Number(measured?.f1_macro), 3)}
                detail="Macro average"
              />
            </div>
            {matrix && (
              <div className="table-wrap">
                <table className="confusion-matrix">
                  <caption
                    className="muted small-text"
                    style={{ textAlign: "left", marginBottom: 12 }}
                  >
                    Confusion matrix · rows = actual · columns = predicted
                  </caption>
                  <thead>
                    <tr>
                      <th>Actual / predicted</th>
                      {matrix.map((_, i) => (
                        <th key={i}>{classes[i] || `Class ${i}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, i) => (
                      <tr key={i}>
                        <th>{classes[i] || `Class ${i}`}</th>
                        {row.map((n, j) => (
                          <td
                            key={j}
                            style={{
                              background:
                                i === j ? "var(--accent-light)" : undefined,
                            }}
                          >
                            {n}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {perClass && (
              <div className="table-wrap" style={{ marginTop: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c}>
                        <td>{c}</td>
                        <td>{format(perClass[c].precision, 3)}</td>
                        <td>{format(perClass[c].recall, 3)}</td>
                        <td>{format(perClass[c]["f1-score"], 3)}</td>
                        <td>{perClass[c].support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="chart-note">
              Metrics reflect the recorded dataset and evaluation protocol.
              Fixture results do not establish industrial accuracy. Compare
              compatible evaluations in the{" "}
              <Link className="text-link" href="/experiments">
                Experiment Laboratory
              </Link>
              .
            </p>
          </>
        ) : (
          <Empty icon={Cpu} title="No measured vision results">
            Train and evaluate a model to populate precision, recall, F1,
            class-level metrics and the confusion matrix.
          </Empty>
        )}
      </section>
      <section className="panel">
        <SectionHead title="Supported architectures" />
        <div className="architecture-grid">
          {[
            { name: "ResNet-50", note: "Residual CNN · Grad-CAM" },
            { name: "EfficientNet-B0", note: "Efficient CNN · Grad-CAM" },
            {
              name: "Vision Transformer",
              note: "Patch-token gradient attribution",
            },
          ].map((a) => (
            <div key={a.name}>
              <Cpu size={20} />
              <h3>{a.name}</h3>
              <p>{a.note}</p>
              <Badge>Training configuration</Badge>
            </div>
          ))}
        </div>
        <p className="chart-note">
          Architecture support does not imply a trained checkpoint or measured
          industrial performance.
        </p>
      </section>
    </>
  );
}
