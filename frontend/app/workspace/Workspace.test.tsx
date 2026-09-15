import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Workspace } from "./Workspace";
import type { AnalysisResponse, PlanResponse, TraceVerification } from "@/lib/types";

const report = vi.hoisted(() => ({ generatePdf: vi.fn(), downloadPdf: vi.fn() }));
vi.mock("@/lib/report", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/report")>()), ...report }));

const api = vi.hoisted(() => ({
  planAnalysis: vi.fn(), analyzeScene: vi.fn(), uploadScene: vi.fn(), verifyTraces: vi.fn(),
  getSceneCatalog: vi.fn(), getSceneAsset: vi.fn(),
}));

vi.mock("@/lib/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const executablePlan: PlanResponse = {
  planner_version: "phase0-rules-v1", rule_id: "default_single_image_vqa", requested_capability: null,
  selected_capability: "single_image_vqa", executable: true, reason: "Single scene question.",
  required_inputs: ["scene"], missing_inputs: [], provider_available: true, provider: "qwen2.5vl-3b",
  unavailable_reason: null, execution_plan_version: "phase0-exec-v1",
  steps: [{ step_id: "step-1", capability: "single_image_vqa", depends_on: [], required_inputs: ["scene"], provider_available: true, provider: "qwen2.5vl-3b" }],
  unavailable_capabilities: [],
};

const trace = {
  model_name: "qwen2.5vl-3b", model_version: "Qwen/Qwen2.5-VL-3B-Instruct",
  params: { execution_mode: "cached_result" as const, results_artifact: "results/real.json", scene_id: "scene-1", capability: "single_image_vqa", planner_version: "phase0-rules-v1", planner_rule: "default_single_image_vqa" },
  input_summary: { image_paths: [], question: "Is there a building in this image?", n_images: 1 },
  timestamp_iso: "2026-09-04T10:00:00+00:00", record_hash: "a".repeat(64), prev_hash: "",
};

const result: AnalysisResponse = {
  answer: "Yes, a building is visible.", evidence: [], execution_mode: "cached_result",
  results_artifact: "results/real.json", model: { name: "qwen2.5vl-3b", version: "Qwen/Qwen2.5-VL-3B-Instruct" },
  trace, notice: "Exact cached result.",
};

function prepare() {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: /prepared scene/i }));
}

function submit() { fireEvent.click(screen.getByRole("button", { name: /^analyze$/i })); }

beforeEach(() => {
  vi.clearAllMocks();
  report.generatePdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  api.getSceneCatalog.mockReturnValue(new Promise(() => {}));
  api.planAnalysis.mockResolvedValue(executablePlan);
  api.analyzeScene.mockResolvedValue(result);
  api.verifyTraces.mockResolvedValue({ verified: true, message: "Audit chain verified." } satisfies TraceVerification);
});
afterEach(cleanup);

describe("Workspace analysis orchestration", () => {
  it("performs plan then analyze in the correct order from one action", async () => {
    const calls: string[] = [];
    api.planAnalysis.mockImplementation(async () => { calls.push("plan"); return executablePlan; });
    api.analyzeScene.mockImplementation(async () => { calls.push("analyze"); return result; });
    prepare(); submit();
    await screen.findByText("Yes, a building is visible.");
    expect(calls).toEqual(["plan", "analyze"]);
    expect(api.planAnalysis).toHaveBeenCalledWith(expect.objectContaining({ scene_id: "loveda_LoveDA_images_png_0_gsd0.3", question: "Is there a building in this image?" }));
    expect(api.analyzeScene).toHaveBeenCalledWith(api.planAnalysis.mock.calls[0][0]);
  });

  it("never analyzes a non-executable plan and shows its real reason", async () => {
    api.planAnalysis.mockResolvedValue({ ...executablePlan, executable: false, provider_available: false, provider: null, unavailable_capabilities: ["single_image_vqa"], unavailable_reason: "No provider is registered." });
    prepare(); submit();
    expect(await screen.findByText("No provider is registered.")).toBeTruthy();
    expect(api.analyzeScene).not.toHaveBeenCalled();
  });

  it("blocks duplicate analysis while planning is pending", async () => {
    let resolvePlan!: (value: PlanResponse) => void;
    api.planAnalysis.mockReturnValue(new Promise(resolve => { resolvePlan = resolve; }));
    prepare();
    const form = screen.getByRole("button", { name: /^analyze$/i }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(api.planAnalysis).toHaveBeenCalledTimes(1);
    resolvePlan(executablePlan);
    await screen.findByText("Yes, a building is visible.");
  });

  it("starts with an intentional empty state and no invented analysis", () => {
    render(<Workspace />);
    expect(screen.getByText(/ask a question about the loaded satellite scene/i)).toBeTruthy();
    expect(screen.getByText(/answers, spatial evidence, and provenance/i)).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText("Answer")).toBeNull();
  });

  it("opens execution details from real response data and verifies through the existing path", async () => {
    prepare(); submit();
    await screen.findByText("Yes, a building is visible.");
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByRole("dialog", { name: "Audit record" })).toBeTruthy();
    expect(screen.getByText("default_single_image_vqa · phase0-rules-v1")).toBeTruthy();
    expect(screen.getByText(trace.record_hash)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^verify trace$/i }));
    await waitFor(() => expect(api.verifyTraces).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText("VERIFIED")).length).toBeGreaterThan(0);
  });

  it("clears a stale result when the question changes", async () => {
    prepare(); submit();
    await screen.findByText("Yes, a building is visible.");
    fireEvent.change(screen.getByLabelText("Ask SatQuery"), { target: { value: "Where is the building?" } });
    expect(screen.queryByText("Yes, a building is visible.")).toBeNull();
    expect(screen.getByText(/ask a question about the loaded satellite scene/i)).toBeTruthy();
  });
});


describe("Workspace report export", () => {
  it("exports the displayed result with its scene metadata without planning, analyzing or verifying again", async () => {
    prepare();
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
    submit();
    await screen.findByText(result.answer);
    fireEvent.click(screen.getByRole("button", { name: "Download report" }));
    await waitFor(() => expect(report.downloadPdf).toHaveBeenCalledTimes(1));
    expect(report.generatePdf.mock.calls[0][0]).toMatchObject({ sceneId: "loveda_LoveDA_images_png_0_gsd0.3", question: "Is there a building in this image?", answer: result.answer });
    expect(report.generatePdf.mock.calls[0][0].fields).toContainEqual({ label: "Dataset", value: "LoveDA" });
    expect(api.planAnalysis).toHaveBeenCalledTimes(1);
    expect(api.analyzeScene).toHaveBeenCalledTimes(1);
    expect(api.verifyTraces).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Ask SatQuery"), { target: { value: "Different question" } });
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
  });

  it("blocks duplicate exports and recovers from an inline export error", async () => {
    let reject!: (error: Error) => void;
    report.generatePdf.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    prepare(); submit(); await screen.findByText(result.answer);
    const button = screen.getByRole("button", { name: "Download report" });
    fireEvent.click(button); fireEvent.click(button);
    expect(report.generatePdf).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);
    reject(new Error("Report export failed. Please retry."));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Report export failed. Please retry.");
    fireEvent.click(screen.getByRole("button", { name: "Download report" }));
    await waitFor(() => expect(report.downloadPdf).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cannot change scene or question during planning/analysis, preserving response association", async () => {
    let resolve!: (value: AnalysisResponse) => void;
    api.analyzeScene.mockReturnValue(new Promise(done => { resolve = done; }));
    prepare(); submit();
    await waitFor(() => expect(api.analyzeScene).toHaveBeenCalledTimes(1));
    const question = screen.getByLabelText("Ask SatQuery") as HTMLTextAreaElement;
    expect(question.disabled).toBe(true);
    fireEvent.change(question, { target: { value: "Outdated response attack" } });
    fireEvent.click(screen.getByRole("button", { name: /prepared scene/i }));
    expect(question.value).toBe("Is there a building in this image?");
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
    resolve(result); await screen.findByText(result.answer);
    fireEvent.click(screen.getByRole("button", { name: "Download report" }));
    await waitFor(() => expect(report.downloadPdf).toHaveBeenCalledTimes(1));
    expect(report.generatePdf.mock.calls[0][0].question).toBe(question.value);
  });

  it.each(["error", "unavailable"])("offers no export for %s", async state => {
    if (state === "error") api.analyzeScene.mockRejectedValue(new Error("failed"));
    else api.planAnalysis.mockResolvedValue({ ...executablePlan, executable: false, unavailable_reason: "Unavailable fixture." });
    prepare(); submit();
    await waitFor(() => expect(screen.getByRole("button", { name: /^analyze$/i })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
  });
});
