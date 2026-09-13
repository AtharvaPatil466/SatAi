import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResolutionComparison } from "./ResolutionComparison";
import type { ResolutionReport } from "@/lib/types";

const report = {
  assets: [
    { gsd: 0.3, available: true, unavailable_reason: null, width: 1024, height: 1024 },
    { gsd: 1, available: false, unavailable_reason: "Missing verified rung.", width: null, height: null },
  ],
} as ResolutionReport;

describe("ResolutionComparison", () => {
  it("shows only verified imagery and fails closed for a missing rung", () => {
    render(<ResolutionComparison report={report} />);

    expect(screen.getByAltText("0.3 metre GSD evaluated LoveDA input")).toBeTruthy();
    expect(screen.getByText("VERIFIED ASSET UNAVAILABLE")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 m" }));
    expect(screen.getByText("Missing verified rung.")).toBeTruthy();
  });
});
