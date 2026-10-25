export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export interface SystemStatus {
  version: string;
  public_api_url?: string;
  database: string;
  redis: string;
  database_backend: string;
  embedding_mode: string;
  llm_mode: string;
  training_enabled: boolean;
  counts: {
    documents: number;
    datasets: number;
    experiments: number;
    models: number;
  };
  modules: { name: string; state: string; detail: string }[];
}
export interface Document {
  id: string;
  filename: string;
  chunks: number;
  size: number;
  created_at: string;
}
export interface Source {
  chunk_id: string;
  filename: string;
  page: number | null;
  text: string;
  score: number;
}
export interface Answer {
  answer: string;
  sources: Source[];
  mode: string;
  embedding_mode: string;
  latency_ms: number;
  sufficient_evidence: boolean;
}
export interface Dataset {
  id: string;
  name: string;
  synthetic: boolean;
  rows: number;
  components: string[];
  checksum: string;
  quality: Record<string, number | boolean>;
}
export interface Point {
  date: string;
  actual?: number;
  predicted?: number;
  lower?: number;
  upper?: number;
  inventory?: number;
}
export interface Forecast {
  id: string;
  model: string;
  component: string;
  synthetic: boolean;
  metrics: Record<string, number>;
  baseline_metrics: Record<string, number>;
  history: Point[];
  backtest: Point[];
  forecast: Point[];
  latency_ms: number;
  explanation: { method?: string; features?: Record<string, number> };
}
export interface Simulation {
  simulation: boolean;
  reorder_point: number;
  safety_stock: number;
  order_quantity: number;
  current_inventory: number;
  shortage_risk: string;
  recommendation: string;
  proposed: Record<string, number>;
  baseline: Record<string, number>;
  assumptions: Record<string, string | number>;
}
export interface Experiment {
  id: string;
  module: string;
  model: string;
  metrics: Record<string, number>;
  config: Record<string, unknown>;
  dataset_version_id: string | null;
  created_at: string;
  duration_seconds: number;
  artifacts?: Record<string, string>;
  mlflow_run_id: string | null;
  provenance: Record<string, unknown>;
}
export interface Pipeline {
  id: string;
  status: string;
  created_at: string;
  report: Record<string, number | boolean>;
}
export interface Job {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  result: Record<string, unknown> | null;
  config: Record<string, unknown>;
  created_at: string;
}
export interface Model {
  id: string;
  name: string;
  module: string;
  version: string;
  state: string;
  metadata: Record<string, unknown>;
}
export interface VisionModels {
  models: Model[];
  architectures: string[];
  status: string;
}
export interface Prediction {
  predicted_class: string;
  confidence: number;
  model_version: string;
  latency_ms: number;
  explanation_artifact: string | null;
  explanation_method: string;
}
