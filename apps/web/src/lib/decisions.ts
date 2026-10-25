import type { Prediction, Source } from "./api";
export type StageState =
  "pending" | "running" | "completed" | "failed" | "requires_review";
export interface Stage {
  state: StageState;
  result: Record<string, unknown>;
  updated_at?: string;
}
export interface CaseSummary {
  id: string;
  title: string;
  status: string;
  severity: string;
  synthetic: boolean;
  component: string;
  batch_code: string;
  job_state: string;
  created_at: string;
  updated_at: string;
}
export interface CaseList {
  items: CaseSummary[];
  overview: Record<string, number>;
  recent_completed: CaseSummary[];
}
export interface Scenario {
  id: string;
  code: string;
  name: string;
  service_level: number;
  shortage_risk: string;
  unserved_units: number;
  ending_inventory: number;
  estimated_delay_days: number;
  holding_cost: number;
  procurement_cost: number;
  reinspection_cost: number;
  deferred_beyond_horizon: number;
  assumptions: Record<string, unknown>;
  curve: { date: string; inventory: number; backlog: number }[];
}
export interface KnowledgeEvidence {
  sources?: (Source & { document_checksum?: string })[];
  possible_causes?: { text: string; citation: number }[];
  investigation_steps?: { text: string; citation: number }[];
  answer?: string;
  mode?: string;
  generation_error?: string;
  embedding_mode?: string;
}
export interface DecisionDetail {
  id: string;
  title: string;
  status: string;
  severity: string;
  synthetic: boolean;
  created_at: string;
  updated_at: string;
  input: { notes: string; rejected_in_inventory: boolean };
  batch: {
    id: string;
    code: string;
    quantity: number;
    component: string;
    version_id: string;
  };
  stages: Record<string, Stage>;
  job: {
    state: string;
    kind: string;
    task_id: string | null;
    error: string | null;
  };
  quality: {
    source: string;
    model_id: string | null;
    image_url: string | null;
    image_checksum: string | null;
    reported_defect: string;
    inspected_quantity: number;
    rejected_quantity: number;
    prediction: Partial<Prediction> & {
      available: boolean;
      reason?: string;
      inference_timestamp?: string;
    };
  };
  impact: null | {
    id: string;
    forecast_id: string;
    evaluation_id: string;
    experiment_id: string;
    recorded_inventory: number;
    usable_inventory: number;
    inventory_as_of: string;
    forecast_demand: number;
    supplier_lead_time_days: number;
    potential_shortage: number;
    assumptions: Record<string, unknown>;
    forecast: {
      model: string;
      forecast: { date: string; predicted: number }[];
    };
  };
  scenarios: Scenario[];
  recommendation: null | {
    id: string;
    evidence_hash: string;
    created_at: string;
    proposed_action: string;
    rationale: string;
    selected_scenario: string;
    supporting_evidence: Record<string, unknown>[];
    model_outputs: Record<string, unknown>;
    explanation: { mode: string; text: string; status: string };
    assumptions: Record<string, unknown>;
    expected_simulated_impact: Record<string, number>;
    uncertainty: string[];
    operational_risks: string[];
    alternative_actions: { code: string; action: string }[];
  };
  reviews: {
    id: string;
    reviewer: string;
    status: string;
    comments: string;
    recommendation_id: string;
    evidence_hash: string;
    created_at: string;
  }[];
  events: {
    id: string;
    stage: string;
    state: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
  audit: {
    id: string;
    action: string;
    actor: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
}
export const decisionStages = [
  ["quality_signal", "Quality signal"],
  ["defect_analysis", "Defect analysis"],
  ["knowledge_retrieval", "Knowledge retrieval"],
  ["production_impact", "Production impact"],
  ["scenario_simulation", "Scenario simulation"],
  ["recommendation", "Recommendation"],
  ["human_approval", "Human approval"],
] as const;
export const stateTone = (state: string) =>
  state === "completed" || state === "Approved" || state === "Closed"
    ? "green"
    : state === "failed" || state === "Rejected" || state === "critical"
      ? "red"
      : state === "requires_review" ||
          state === "Awaiting Review" ||
          state === "high"
        ? "amber"
        : state === "running" || state === "queued"
          ? "cyan"
          : "neutral";
export const stateLabel = (state: string) =>
  state.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
