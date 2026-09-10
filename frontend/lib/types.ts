export type ExecutionMode = "live" | "cached_result";

export type OperationState = "IDLE" | "LOADING" | "SUCCESS" | "UNAVAILABLE" | "INVALID INPUT" | "EXECUTION ERROR";

export interface AnalysisRequest {
  scene_id: string;
  question: string;
  sensor?: string | null;
  capability?: string | null;
}

export interface SceneUploadResponse {
  scene_id: string;
  filename: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
  sensor: null;
  gsd: null;
  location: null;
  acquisition_date: null;
}

export interface CapabilityStatus {
  name: string;
  available: boolean;
  provider: string | null;
}

export interface PlanResponse {
  planner_version: string;
  rule_id: string;
  requested_capability: string | null;
  selected_capability: string;
  executable: boolean;
  reason: string;
  required_inputs: string[];
  missing_inputs: string[];
  provider_available: boolean;
  provider: string | null;
  unavailable_reason: string | null;
  execution_plan_version: string;
  steps: {
    step_id: string;
    capability: string;
    depends_on: string[];
    required_inputs: string[];
    provider_available: boolean;
    provider: string | null;
  }[];
  unavailable_capabilities: string[];
}

export interface TraceVerification { verified: boolean; message: string }
export interface TraceHistory { records: TraceRecord[]; count: number }

export interface TraceRecord {
  model_name: string;
  model_version: string;
  params: {
    execution_mode: ExecutionMode;
    results_artifact?: string;
    scene_id?: string;
    sensor?: string | null;
    capability?: string;
    requested_capability?: string | null;
    planner_version?: string;
    planner_rule?: string;
  };
  input_summary: { image_paths: string[]; question: string; n_images: number };
  timestamp_iso: string;
  record_hash: string;
  prev_hash: string;
}

export interface AnalysisResponse {
  answer: string;
  execution_mode: ExecutionMode;
  results_artifact: string | null;
  model: { name: string; version: string };
  trace: TraceRecord;
  notice: string;
}

export interface RungMetrics {
  n: number;
  accuracy: number;
  binary_n: number;
  binary_accuracy: number;
  open_n: number;
  open_accuracy: number;
  pred_yes_rate_on_binary: number;
  warning: string | null;
}

export interface ResolutionReport {
  model: string;
  n_samples: number;
  timestamp: string;
  provenance?: string;
  per_rung: Record<string, RungMetrics>;
  degenerate_rungs: string[];
}

export interface SarReport {
  scene: string;
  title: string;
  human_validation: boolean;
  render_available: boolean;
  summaries: Record<"water" | "built_up" | "vegetation" | "terrain", string>;
  annotation: string;
}
