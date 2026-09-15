import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryPanel } from "./QueryPanel";

afterEach(cleanup);

const renderPanel = (overrides: Partial<React.ComponentProps<typeof QueryPanel>> = {}) => {
  const props: React.ComponentProps<typeof QueryPanel> = {
    question: "Locate the building.",
    onQuestion: vi.fn(),
    phase: "READY",
    hasScene: true,
    onAnalyze: vi.fn(),
    ...overrides,
  };
  render(<QueryPanel {...props} />);
  return props;
};

describe("QueryPanel", () => {
  it("offers one primary Analyze action", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /analyze/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^plan$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /run analysis/i })).toBeNull();
  });

  it("disables submission without a scene or question", () => {
    renderPanel({ hasScene: false });
    expect((screen.getByRole("button", { name: /analyze/i }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderPanel({ question: "" });
    expect((screen.getByRole("button", { name: /analyze/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports only the real client phase and blocks edits while pending", () => {
    renderPanel({ phase: "PLANNING" });
    expect(screen.getByRole("status").textContent).toBe("PLANNING");
    expect((screen.getByLabelText("Ask SatQuery") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /planning/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits through the form and supports the documented keyboard shortcut", () => {
    const props = renderPanel();
    fireEvent.submit(screen.getByRole("button", { name: /analyze/i }).closest("form")!);
    fireEvent.keyDown(screen.getByLabelText("Ask SatQuery"), { key: "Enter", ctrlKey: true });
    expect(props.onAnalyze).toHaveBeenCalledTimes(2);
  });
});
