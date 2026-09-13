import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryPanel } from "./QueryPanel";
import type { PlanResponse } from "@/lib/types";

afterEach(cleanup);

const plan = (overrides: Partial<PlanResponse> = {}): PlanResponse => ({
  planner_version: "phase0-rules-v1",
  rule_id: "default_single_image_vqa",
  requested_capability: null,
  selected_capability: "single_image_vqa",
  executable: true,
  reason: "The request asks about the contents of a single scene.",
  required_inputs: ["scene"],
  missing_inputs: [],
  provider_available: true,
  provider: "qwen2.5vl-3b",
  unavailable_reason: null,
  execution_plan_version: "phase0-exec-v1",
  steps: [{ step_id: "step-1", capability: "single_image_vqa", depends_on: [], required_inputs: ["scene"], provider_available: true, provider: "qwen2.5vl-3b" }],
  unavailable_capabilities: [],
  ...overrides,
});

const noop = () => {};
const route = () => within(screen.getByLabelText("Execution route")).getAllByRole("listitem").map((node) => node.textContent);

function renderPanel(value: PlanResponse | null) {
  render(<QueryPanel question="Locate the building." onQuestion={noop} plan={value} busy={false} hasScene onPlan={noop} onAnalyze={noop} />);
}

describe("QueryPanel: the execution route shows real plan values", () => {
  it("shows the VQA capability and its own provider", () => {
    renderPanel(plan());
    expect(route()).toEqual(["QUESTION", "SINGLE_IMAGE_VQA", "qwen2.5vl-3b"]);
    expect(screen.getByText(/rule default_single_image_vqa · phase0-rules-v1/)).toBeTruthy();
    expect(screen.getByText(/capability selected automatically/)).toBeTruthy();
  });

  it("shows grounding and its own provider, never a fixed capability", () => {
    renderPanel(plan({ rule_id: "grounding_spatial_localization", selected_capability: "grounding", provider: "grounding-dino-swint", steps: [{ step_id: "step-1", capability: "grounding", depends_on: [], required_inputs: ["scene"], provider_available: true, provider: "grounding-dino-swint" }] }));
    expect(route()).toEqual(["QUESTION", "GROUNDING", "grounding-dino-swint"]);
  });

  it("reports an explicitly requested capability as requested", () => {
    renderPanel(plan({ rule_id: "explicit_capability", requested_capability: "grounding", selected_capability: "grounding", provider: "grounding-dino-swint" }));
    expect(screen.getByText(/explicitly requested grounding/)).toBeTruthy();
  });

  it("shows an unavailable capability truthfully instead of falling back to VQA", () => {
    renderPanel(plan({ rule_id: "change_temporal_compare", selected_capability: "change_vqa", executable: false, provider_available: false, provider: null, unavailable_capabilities: ["change_vqa"], unavailable_reason: "No provider is registered for capability: change_vqa" }));
    expect(route()).toEqual(["QUESTION", "CHANGE_VQA", "NO PROVIDER"]);
    expect(screen.getByText("No provider is registered for capability: change_vqa")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Run analysis" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says the planner has not run before a plan exists", () => {
    renderPanel(null);
    expect(screen.queryByLabelText("Execution route")).toBeNull();
    expect(screen.getByText(/planner not run/)).toBeTruthy();
  });
});
