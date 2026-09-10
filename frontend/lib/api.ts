import type { AnalysisRequest, AnalysisResponse, CapabilityStatus, OperationState, PlanResponse, ResolutionReport, SarReport, SceneUploadResponse, TraceHistory, TraceVerification } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorState(reason: unknown): OperationState {
  if (!(reason instanceof ApiError) || reason.status === 0 || reason.status === 503) return "UNAVAILABLE";
  return [404, 413, 422].includes(reason.status) ? "INVALID INPUT" : "EXECUTION ERROR";
}

export function errorMessage(reason: unknown): string {
  return reason instanceof ApiError ? reason.message : "The API could not be reached. Please retry.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store" });
  } catch { throw new ApiError(0, "The API could not be reached. Please retry."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    if (response.status === 502) message = "Execution failed. No answer was generated.";
    else if (response.status === 503) message = typeof body?.detail === "string" ? body.detail : "Capability or model currently unavailable.";
    else if (response.status >= 500) message = "The server could not complete the request. Please retry.";
    else if (typeof body?.detail === "string") message = body.detail;
    else if (Array.isArray(body?.detail)) message = body.detail.map((item: { loc?: unknown[]; msg?: string }) => `${item.loc?.join(".") ?? "Request"}: ${item.msg ?? "Invalid value"}`).join("; ");
    throw new ApiError(response.status, message);
  }
  if (body === null) throw new ApiError(502, "The API returned an invalid response.");
  return body as T;
}

const jsonBody = (body: AnalysisRequest): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function uploadScene(file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<SceneUploadResponse>("/api/scenes", { method: "POST", body });
}
export const sceneImageUrl = (scene: string) => `${API_URL}/api/scenes/${encodeURIComponent(scene)}/image`;
export const sarImageUrl = (scene: string) => `${API_URL}/api/sar/${encodeURIComponent(scene)}/image`;
export const planAnalysis = (body: AnalysisRequest) => request<PlanResponse>("/api/plan", jsonBody(body));
export const analyzeScene = (body: AnalysisRequest) => request<AnalysisResponse>("/api/analyze", jsonBody(body));
export const getCapabilities = () => request<{ capabilities: CapabilityStatus[] }>("/api/capabilities");
export const getResolution = () => request<ResolutionReport>("/api/resolution");
export const getSar = (scene = "mumbai-coastal") => request<SarReport>(`/api/sar/${encodeURIComponent(scene)}`);
export const getTraces = () => request<TraceHistory>("/api/traces");
export const verifyTraces = () => request<TraceVerification>("/api/traces/verify", { method: "POST" });
export const getHealth = () => request<{ status: string; mode: string }>("/api/health");
