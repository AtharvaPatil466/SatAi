// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { createReportPayload, generatePdf, reportFilename, type ReportContext } from "./report";
import type { AnalysisResponse } from "./types";

// Existing response fixture from the workspace orchestration tests; no inference is run.
const result: AnalysisResponse = {
  answer: "Yes, a building is visible.", evidence: [], execution_mode: "cached_result",
  results_artifact: "results/real.json", model: { name: "qwen2.5vl-3b", version: "Qwen/Qwen2.5-VL-3B-Instruct" },
  trace: {
    model_name: "qwen2.5vl-3b", model_version: "Qwen/Qwen2.5-VL-3B-Instruct",
    params: { execution_mode: "cached_result", capability: "single_image_vqa", planner_version: "phase0-rules-v1", planner_rule: "default_single_image_vqa", sensor: "UNKNOWN" },
    input_summary: { image_paths: [], question: "Is there a building in this image?", n_images: 1 },
    timestamp_iso: "2026-09-04T10:00:00+00:00", record_hash: "a".repeat(64), prev_hash: "b".repeat(64),
  }, notice: "Confidence calibration pending.",
};
const context: ReportContext = { sceneId: "loveda_LoveDA_images_png_0_gsd0.3", question: result.trace.input_summary.question, upload: null, plan: null, source: { dataset: "LoveDA", dataset_split: null, source_id: "loveda_LoveDA_images_png_0_gsd0.3", sensor: null, gsd: 0.3, location: null, acquisition_date: null } };
const now = new Date("2026-09-15T10:11:12Z");
const payload = () => createReportPayload(result, context, now);
const fields = () => Object.fromEntries(payload().fields.map(f => [f.label, f.value]));
afterEach(() => vi.unstubAllGlobals());

describe("report payload", () => {
  it("preserves exact question/answer, matching metadata, and separate UTC report/trace times", () => {
    expect(payload()).toMatchObject({ question: context.question, answer: result.answer, sceneId: context.sceneId, generatedAt: now.toISOString() });
    expect(fields()).toMatchObject({ Dataset: "LoveDA", GSD: "0.3", Sensor: "Unknown", "Acquisition date": "Unknown", "Trace time": result.trace.timestamp_iso });
    expect(JSON.stringify(payload())).not.toMatch(/confidence/i);
  });
  it("keeps cached/live distinctions and optional provenance", () => {
    expect(fields()).toMatchObject({ "Execution mode": "Cached real result", "Cached artifact": "results/real.json", "Planner version": "phase0-rules-v1", "Planner rule": "default_single_image_vqa" });
    const live = createReportPayload({ ...result, execution_mode: "live", results_artifact: null }, { ...context, source: null }, now);
    expect(live.fields).toContainEqual({ label: "Execution mode", value: "Live" });
    expect(live.fields.some(f => f.label === "Cached result" || f.label === "Cached artifact")).toBe(false);
    expect(live.fields).toContainEqual({ label: "Dataset", value: "Unknown" });
  });
  it("always exports unchecked integrity and actual hashes", () => {
    expect(fields()).toMatchObject({ Integrity: "UNCHECKED", Verification: "Verification not performed.", "Record hash": result.trace.record_hash, "Previous hash": result.trace.prev_hash });
  });
  it("distinguishes absent, supported and unsupported evidence without changing coordinates", () => {
    expect(payload().evidence).toEqual(["No spatial evidence was produced for this analysis."]);
    const next = createReportPayload({ ...result, evidence: [{ type: "mask" }, { type: "bounding_box", label: "Building", coordinates: [-0.1, 0.2, 0.7, 1.2], coordinate_space: "normalized_xyxy" }] }, context, now);
    expect(next.evidence.join("\n")).toContain("cannot be represented");
    expect(next.evidence.join("\n")).toContain("[-0.1,0.2,0.7,1.2]");
    expect(next.evidence.join("\n")).toContain("fractions of image width and height");
    expect(next.evidence.join("\n")).not.toContain("No spatial evidence");
  });
  it("includes actual upload metadata and execution plan", () => {
    const next = createReportPayload(result, { ...context, source: null, upload: { scene_id: context.sceneId, filename: "upload.png", format: "PNG", width: 10, height: 10, sensor: "optical", gsd: "2m", acquisition_date: "2025-01-01", location: null }, plan: { planner_version: "v1", rule_id: "rule", execution_plan_version: "exec-v1", reason: "Actual reason", provider: "actual-provider", steps: [{ step_id: "one", capability: "grounding", provider: "actual-provider", depends_on: [], required_inputs: ["scene"], provider_available: true }], executable: true, requested_capability: null, selected_capability: "grounding", required_inputs: [], missing_inputs: [], unavailable_capabilities: [], unavailable_reason: null, provider_available: true } }, now);
    expect(next.fields).toEqual(expect.arrayContaining([{ label: "Sensor", value: "optical" }, { label: "Acquisition date", value: "2025-01-01" }]));
    expect(next.fields.find(f => f.label === "Execution plan")?.value).toContain('"step_id": "one"');
  });
  it("rejects incomplete results", () => {
    expect(() => createReportPayload({ ...result, answer: "" }, context)).toThrow("valid completed");
    expect(() => createReportPayload({ ...result, results_artifact: null }, context)).toThrow("valid completed");
  });
  it("sanitizes filenames and converts timestamps to UTC", () => {
    expect(reportFilename("../../a/b:<雪>", "2026-09-15T15:41:12+05:30")).toBe("satquery-report-a-b-20260915T101112Z.pdf");
    expect(reportFilename("...", now.toISOString())).toContain("report-scene-");
  });
});

describe("PDF rendering", () => {
  function mockFont() {
    const bytes = readFileSync("public/fonts/DejaVuSans.ttf");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }
  it("renders representative and long Unicode fixture reports with page breaks; only fetches the font", async () => {
    const fetcher = mockFont();
    const normal = await generatePdf(payload());
    const longPayload = { ...payload(), question: "Is café vegetation ≥ 30%? αβ — naïve. ".repeat(100), answer: "Visible buildings and vegetation. ".repeat(300) + " END OF FULL ANSWER" };
    const long = await generatePdf(longPayload);
    const normalPdf = await PDFDocument.load(normal);
    const longPdf = await PDFDocument.load(long);
    expect(normalPdf.getPageCount()).toBeGreaterThan(0);
    expect(longPdf.getPageCount()).toBeGreaterThan(normalPdf.getPageCount());
    expect(fetcher.mock.calls).toEqual([["/fonts/DejaVuSans.ttf"], ["/fonts/DejaVuSans.ttf"]]);
    if (process.env.SATQUERY_REPORT_QA_DIR) {
      mkdirSync(process.env.SATQUERY_REPORT_QA_DIR, { recursive: true });
      writeFileSync(`${process.env.SATQUERY_REPORT_QA_DIR}/fixture-report.pdf`, normal);
      writeFileSync(`${process.env.SATQUERY_REPORT_QA_DIR}/long-fixture-report.pdf`, long);
    }
  });
  it("fails clearly for missing fonts and unsupported Unicode, never replacing text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(generatePdf(payload())).rejects.toThrow("font could not be loaded");
    mockFont();
    await expect(generatePdf({ ...payload(), answer: "雪" })).rejects.toThrow("No text was replaced");
  });
});
