import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Workspace } from "./Workspace";
import type { AnalysisResponse, PlanResponse, TraceVerification } from "@/lib/types";

const report = vi.hoisted(() => ({ generatePdf: vi.fn(), downloadPdf: vi.fn() }));
vi.mock("@/lib/report", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/report")>()), ...report }));

const api = vi.hoisted(() => ({
  planAnalysis: vi.fn(), analyzeScene: vi.fn(), uploadScene: vi.fn(), verifyTraces: vi.fn(),
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

const sceneId = "scene_0123456789abcdef0123456789abcdef";
const question = "Are there any large structures near the river?";

const trace = {
  model_name: "qwen2.5vl-3b", model_version: "Qwen/Qwen2.5-VL-3B-Instruct",
  params: { execution_mode: "live" as const, scene_id: sceneId, capability: "single_image_vqa", planner_version: "phase0-rules-v1", planner_rule: "default_single_image_vqa" },
  input_summary: { image_paths: [`data/runtime/scenes/${sceneId}.png`], question, n_images: 1 },
  timestamp_iso: "2026-09-04T10:00:00+00:00", record_hash: "a".repeat(64), prev_hash: "",
};

const result: AnalysisResponse = {
  answer: "A large structure is visible near the river.", evidence: [], execution_mode: "live",
  results_artifact: null, model: { name: "qwen2.5vl-3b", version: "Qwen/Qwen2.5-VL-3B-Instruct" },
  trace, notice: "Live inference completed.",
};

async function prepare() {
  render(<Workspace />);
  fireEvent.click(screen.getByText(/load scene/i));
  fireEvent.change(screen.getByLabelText("Satellite image file"), { target: { files: [new File(["pixels"], "manual.png", { type: "image/png" })] } });
  await screen.findByAltText(`Scene ${sceneId}`);
  fireEvent.change(screen.getByLabelText("Ask SatQuery"), { target: { value: question } });
}

function submit() { fireEvent.click(screen.getByRole("button", { name: /^analyze$/i })); }

beforeEach(() => {
  vi.clearAllMocks();
  report.generatePdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  api.uploadScene.mockResolvedValue({ scene_id: sceneId, filename: "manual.png", format: "PNG", width: 1024, height: 1024, sensor: null, gsd: null, location: null, acquisition_date: null });
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
    await prepare(); submit();
    await screen.findByText(result.answer);
    expect(calls).toEqual(["plan", "analyze"]);
    expect(api.planAnalysis).toHaveBeenCalledWith(expect.objectContaining({ scene_id: sceneId, question }));
    expect(api.analyzeScene).toHaveBeenCalledWith(api.planAnalysis.mock.calls[0][0]);
  });

  it("never analyzes a non-executable plan and shows its real reason", async () => {
    await prepare();
    api.planAnalysis.mockResolvedValue({ ...executablePlan, executable: false, provider_available: false, provider: null, unavailable_capabilities: ["single_image_vqa"], unavailable_reason: "No provider is registered." });
    submit();
    expect(await screen.findByText("No provider is registered.")).toBeTruthy();
    expect(api.analyzeScene).not.toHaveBeenCalled();
  });

  it("blocks duplicate analysis while planning is pending", async () => {
    let resolvePlan!: (value: PlanResponse) => void;
    await prepare();
    api.planAnalysis.mockReturnValue(new Promise(resolve => { resolvePlan = resolve; }));
    const form = screen.getByRole("button", { name: /^analyze$/i }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(api.planAnalysis).toHaveBeenCalledTimes(1);
    resolvePlan(executablePlan);
    await screen.findByText(result.answer);
  });

  it("starts with an intentional empty state and no invented analysis", () => {
    render(<Workspace />);
    expect(screen.getByText(/load scene/i)).toBeTruthy();
    expect(screen.queryByText(/verified scene pack|prepared scene/i)).toBeNull();
    expect(screen.getByText(/ask a question about the loaded satellite scene/i)).toBeTruthy();
    expect(screen.getByText(/answers, spatial evidence, and provenance/i)).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText("Answer")).toBeNull();
  });

  it("opens execution details from real response data and verifies through the existing path", async () => {
    await prepare(); submit();
    await screen.findByText(result.answer);
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByRole("dialog", { name: "Audit record" })).toBeTruthy();
    expect(screen.getByText("default_single_image_vqa · phase0-rules-v1")).toBeTruthy();
    expect(screen.getByText(trace.record_hash)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^verify trace$/i }));
    await waitFor(() => expect(api.verifyTraces).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText("VERIFIED")).length).toBeGreaterThan(0);
  });

  it("clears a stale result when the question changes", async () => {
    await prepare(); submit();
    await screen.findByText(result.answer);
    fireEvent.change(screen.getByLabelText("Ask SatQuery"), { target: { value: "Where is the building?" } });
    expect(screen.queryByText(result.answer)).toBeNull();
    expect(screen.getByText(/ask a question about the loaded satellite scene/i)).toBeTruthy();
  });
});

describe("Workspace scene upload", () => {
  it("uses a styled upload control that opens the hidden file input", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByText(/load scene/i));
    const input = screen.getByLabelText("Satellite image file") as HTMLInputElement;
    const clicked = vi.fn();
    input.addEventListener("click", clicked);
    fireEvent.click(screen.getByText("Upload satellite image"));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(input.className).toContain("sr-only");
  });

  it("shows upload progress and closes the picker after a successful upload", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.uploadScene>>) => void;
    api.uploadScene.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<Workspace />);
    fireEvent.click(screen.getByText(/load scene/i));
    const details = screen.getByText(/load scene/i).closest("details")!;
    const input = screen.getByLabelText("Satellite image file");
    fireEvent.change(input, { target: { files: [new File(["pixels"], "manual.png", { type: "image/png" })] } });
    expect(await screen.findByText("Uploading image...")).toBeTruthy();
    expect(api.uploadScene).toHaveBeenCalledTimes(1);
    resolve({ scene_id: sceneId, filename: "manual.png", format: "PNG", width: 1024, height: 1024, sensor: null, gsd: null, location: null, acquisition_date: null });
    await waitFor(() => expect(details.open).toBe(false));
    expect(screen.getByAltText(`Scene ${sceneId}`)).toBeTruthy();
    expect(screen.queryByText(/verified scene pack|prepared scene/i)).toBeNull();
    expect(document.activeElement).toBe(details.querySelector("summary"));
  });

  it("keeps the picker open and shows the error after a failed upload", async () => {
    api.uploadScene.mockRejectedValue(new Error("offline"));
    render(<Workspace />);
    fireEvent.click(screen.getByText(/load scene/i));
    const details = screen.getByText(/load scene/i).closest("details")!;
    fireEvent.change(screen.getByLabelText("Satellite image file"), { target: { files: [new File(["pixels"], "manual.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The API could not be reached. Please retry.");
    expect(details.open).toBe(true);
  });

  it("allows any non-empty question after upload and plans only on submission", async () => {
    await prepare();
    expect((screen.getByRole("button", { name: /^analyze$/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(api.planAnalysis).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(api.planAnalysis).toHaveBeenCalledWith(expect.objectContaining({ scene_id: sceneId, question })));
  });
});


describe("Workspace report export", () => {
  it("exports the displayed result with its scene metadata without planning, analyzing or verifying again", async () => {
    await prepare();
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
    submit();
    await screen.findByText(result.answer);
    fireEvent.click(screen.getByRole("button", { name: "Download report" }));
    await waitFor(() => expect(report.downloadPdf).toHaveBeenCalledTimes(1));
    expect(report.generatePdf.mock.calls[0][0]).toMatchObject({ sceneId, question, answer: result.answer });
    expect(report.generatePdf.mock.calls[0][0].fields).toContainEqual({ label: "Dataset", value: "Unknown" });
    expect(api.planAnalysis).toHaveBeenCalledTimes(1);
    expect(api.analyzeScene).toHaveBeenCalledTimes(1);
    expect(api.verifyTraces).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Ask SatQuery"), { target: { value: "Different question" } });
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
  });

  it("blocks duplicate exports and recovers from an inline export error", async () => {
    let reject!: (error: Error) => void;
    report.generatePdf.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    await prepare(); submit(); await screen.findByText(result.answer);
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
    await prepare(); submit();
    await waitFor(() => expect(api.analyzeScene).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText("Ask SatQuery") as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    expect((screen.getByLabelText("Satellite image file") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "Outdated response attack" } });
    expect(input.value).toBe(question);
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
    resolve(result); await screen.findByText(result.answer);
    fireEvent.click(screen.getByRole("button", { name: "Download report" }));
    await waitFor(() => expect(report.downloadPdf).toHaveBeenCalledTimes(1));
    expect(report.generatePdf.mock.calls[0][0].question).toBe(input.value);
  });

  it.each(["error", "unavailable"])("offers no export for %s", async state => {
    if (state === "error") api.analyzeScene.mockRejectedValue(new Error("failed"));
    await prepare();
    if (state === "unavailable") api.planAnalysis.mockResolvedValue({ ...executablePlan, executable: false, unavailable_reason: "Unavailable fixture." });
    submit();
    await waitFor(() => expect(screen.getByRole("button", { name: /^analyze$/i })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Download report" })).toBeNull();
  });
});
