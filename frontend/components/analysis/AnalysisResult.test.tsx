import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnalysisResult } from "./AnalysisResult";
import type { AnalysisResponse } from "@/lib/types";

afterEach(cleanup);

const response = (mode: "live" | "cached_result", artifact: string | null): AnalysisResponse => ({
  answer: "Buildings are visible.",
  evidence: [],
  execution_mode: mode,
  results_artifact: artifact,
  model: { name: "qwen2.5vl-3b", version: "Qwen/Qwen2.5-VL-3B-Instruct" },
  notice: "Confidence calibration pending. results/real.json",
  trace: {
    model_name: "qwen2.5vl-3b", model_version: "Qwen/Qwen2.5-VL-3B-Instruct",
    params: { execution_mode: mode, results_artifact: artifact ?? undefined, capability: "single_image_vqa" },
    input_summary: { image_paths: [], question: "Are buildings visible?", n_images: 1 },
    timestamp_iso: "2026-09-04T10:00:00+00:00", record_hash: "a".repeat(64), prev_hash: "",
  },
});

describe("AnalysisResult truthfulness", () => {
  it("distinguishes cached-real output from live execution", () => {
    const { rerender } = render(<AnalysisResult result={response("cached_result", "results/real.json")} />);
    expect(screen.getByText("Cached real result")).toBeTruthy();
    expect(screen.getByText("CACHED RESULT")).toBeTruthy();
    rerender(<AnalysisResult result={response("live", null)} />);
    expect(screen.getByText("REAL / LIVE")).toBeTruthy();
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("does not render a confidence field", () => {
    render(<AnalysisResult result={response("live", null)} />);
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText(/results\/real.json/)).toBeNull();
  });
});
