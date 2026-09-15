import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { downloadPdf } from "@/lib/report";
import { EvidencePanel } from "./EvidencePanel";
import type { EvidenceRecord, TraceRecord } from "@/lib/types";

afterEach(cleanup);

const trace: TraceRecord = {
  model_name: "grounding-dino-swint",
  model_version: "test-grounding",
  params: { execution_mode: "live", scene_id: "scene_0123", capability: "grounding", planner_version: "phase0-rules-v1", planner_rule: "grounding_spatial_localization" },
  input_summary: { image_paths: ["data/ladder/0.3/scene.png"], question: "Locate the building.", n_images: 1 },
  timestamp_iso: "2026-09-04T10:00:00+00:00",
  record_hash: "a".repeat(64),
  prev_hash: "b".repeat(64),
};

const cachedTrace: TraceRecord = {
  ...trace,
  model_name: "qwen2.5vl-3b",
  model_version: "cached",
  params: { execution_mode: "cached_result", results_artifact: "results/qwen2.5vl-3b__ladder__rescored__20260904.json", capability: "single_image_vqa" },
  input_summary: { image_paths: [], question: "Is there a building in this image?", n_images: 1 },
};

const boxRecord = (label: string, coordinates: number[], confidence: number | null = 0.91): EvidenceRecord => ({
  type: "bounding_box", label, coordinates, coordinate_space: "normalized_xyxy", confidence, source_scene_id: null,
});

const evidenceItems = () => within(screen.getByTestId("grounding-evidence-list")).getAllByRole("button");

describe("EvidencePanel: execution provenance is never lost", () => {
  it("renders provenance and the raw trace drawer with no evidence prop, as /executions does", () => {
    render(<EvidencePanel trace={trace} />);
    expect(screen.getByText("Execution provenance")).toBeTruthy();
    expect(screen.getByText(/grounding-dino-swint/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByText(trace.record_hash)).toBeTruthy();
    expect(screen.getByText("Locate the building.")).toBeTruthy();
    expect(screen.getByText(/technical record/i)).toBeTruthy();
    // Visual evidence is an analysis concern, absent from a bare trace listing.
    expect(screen.queryByText("Visual evidence")).toBeNull();
  });

  it("keeps provenance visible alongside grounding evidence", () => {
    render(<EvidencePanel trace={trace} evidence={[boxRecord("building", [0.1, 0.2, 0.7, 0.8])]} />);
    expect(screen.getByText("Evidence")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByText("Execution provenance")).toBeTruthy();
    expect(screen.getByText(trace.record_hash)).toBeTruthy();
    expect(screen.getByText(/grounding_spatial_localization · phase0-rules-v1/)).toBeTruthy();
  });
});

describe("EvidencePanel: grounding evidence list", () => {
  it("lists one box with its label, real confidence, and coordinates", () => {
    render(<EvidencePanel trace={trace} evidence={[boxRecord("building", [0.1, 0.2, 0.7, 0.8])]} />);
    const [item] = evidenceItems();
    expect(item.textContent).toContain("building");
    expect(item.textContent).toContain("confidence 91.0%");
    expect(item.textContent).toContain("xyxy [0.1000, 0.2000, 0.7000, 0.8000]");
    expect(item.textContent).toContain("normalized_xyxy");
  });

  it("lists multiple boxes in the order the model returned them", () => {
    render(<EvidencePanel trace={trace} evidence={[
      boxRecord("bridge", [0, 0, 0.5, 0.5], 0.42),
      boxRecord("vehicle", [0.5, 0.5, 1, 1], 0.77),
    ]} />);
    const items = evidenceItems();
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("bridge");
    expect(items[1].textContent).toContain("vehicle");
    expect(screen.getByText("2 / 2 drawable")).toBeTruthy();
  });

  it("omits confidence when the provider did not report it", () => {
    render(<EvidencePanel trace={trace} evidence={[boxRecord("pier", [0.2, 0.1, 0.4, 0.3], null)]} />);
    expect(evidenceItems()[0].textContent).not.toContain("confidence");
    expect(evidenceItems()[0].textContent).not.toContain("%");
  });

  it("explains an unsupported evidence type instead of drawing it", () => {
    render(<EvidencePanel trace={trace} evidence={[{ type: "segmentation_mask", label: "water" }]} />);
    expect(screen.queryByTestId("grounding-evidence-list")).toBeNull();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("segmentation_mask");
    expect(note.textContent).toContain("not rendered");
  });
});

describe("EvidencePanel: evidence absent", () => {
  it("states that a cached VQA result carried no grounding evidence and still shows its provenance", () => {
    render(<EvidencePanel trace={cachedTrace} evidence={null} />);
    expect(screen.getByText(/no spatial evidence was produced/i)).toBeTruthy();
    expect(screen.queryByTestId("grounding-evidence-list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByText("cached_result")).toBeTruthy();
    expect(screen.getByText("single_image_vqa")).toBeTruthy();
    expect(screen.getByText("Is there a building in this image?")).toBeTruthy();
  });

  it("handles a provider that reported an explicitly empty evidence list", () => {
    render(<EvidencePanel trace={cachedTrace} evidence={[]} />);
    expect(screen.getByText(/no spatial evidence was produced/i)).toBeTruthy();
    expect(screen.queryByText("0 / 0 drawable")).toBeNull();
  });
});

describe("EvidencePanel: selection is shared with the imagery overlay", () => {
  it("marks the selected item and reports selection changes", () => {
    const onSelect = vi.fn();
    const evidence = [boxRecord("bridge", [0, 0, 0.5, 0.5]), boxRecord("vehicle", [0.5, 0.5, 1, 1])];
    const { rerender } = render(<EvidencePanel trace={trace} evidence={evidence} selected={null} onSelect={onSelect} />);
    expect(evidenceItems().map((node) => node.getAttribute("aria-pressed"))).toEqual(["false", "false"]);

    fireEvent.click(evidenceItems()[1]);
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<EvidencePanel trace={trace} evidence={evidence} selected={1} onSelect={onSelect} />);
    expect(evidenceItems().map((node) => node.getAttribute("aria-pressed"))).toEqual(["false", "true"]);

    fireEvent.click(evidenceItems()[1]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("keeps evidence indices aligned with the raw payload when some items are undrawable", () => {
    const onSelect = vi.fn();
    render(<EvidencePanel trace={trace} evidence={[
      { type: "segmentation_mask", label: "water" },
      boxRecord("vehicle", [0.5, 0.5, 1, 1]),
    ]} selected={null} onSelect={onSelect} />);
    fireEvent.click(evidenceItems()[0]);
    // The drawable item is index 1 of the raw payload, which is what the
    // imagery overlay keys its boxes on.
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("focuses the selected evidence without modifying its coordinates", () => {
    const onSelect = vi.fn();
    const onFocus = vi.fn();
    render(<EvidencePanel trace={trace} evidence={[boxRecord("ship", [0.1, 0.2, 0.3, 0.4])]} selected={null} onSelect={onSelect} onFocus={onFocus} />);
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(onFocus).toHaveBeenCalledWith(0);
    expect(evidenceItems()[0].textContent).toContain("xyxy [0.1000, 0.2000, 0.3000, 0.4000]");
  });
});


describe("Report integrity and download resources", () => {
  it("a hash alone stays unchecked, while successful verification remains verified", () => {
    const { rerender } = render(<EvidencePanel trace={trace} evidence={[]} />);
    expect(screen.getByText("Unchecked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /view execution/i }));
    expect(screen.getByText("Verification not performed.")).toBeTruthy();
    rerender(<EvidencePanel trace={trace} evidence={[]} verification={{ verified: true, message: "Chain verified." }} />);
    expect(screen.getAllByText("VERIFIED")).toHaveLength(2);
    expect(screen.getByText("Chain verified.")).toBeTruthy();
    expect(screen.queryByText("Verification not performed.")).toBeNull();
  });

  it.each([false, true])("releases download resources, including click failure=%s", fail => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    const create = vi.fn().mockReturnValue("blob:report-fixture");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { if (fail) throw new Error("Download blocked"); });
    try {
      const download = () => downloadPdf(new Uint8Array([1]), "fixture.pdf");
      if (fail) expect(download).toThrow("Download blocked"); else download();
      expect(create).toHaveBeenCalledTimes(1);
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith("blob:report-fixture");
    } finally { click.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
