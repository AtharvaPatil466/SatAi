import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SarViewer } from "./SarViewer";

afterEach(cleanup);

describe("SarViewer fail-closed behavior", () => {
  it("uses the exact render URL returned by the backend", () => {
    render(<SarViewer title="OPTICAL" detail="Real S2" render={{ url: "/api/sar/sensor-necessity/scene/render/optical", available: true }} />);
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/sar/sensor-necessity/scene/render/optical");
  });

  it("shows no image or substitute when availability is false", () => {
    render(<SarViewer title="SAR" detail="Real S1" render={{ url: "/unavailable", available: false }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No placeholder or substitute");
  });

  it("fails closed when image retrieval errors", () => {
    render(<SarViewer title="CORRECT PAIR" detail="Aligned" render={{ url: "/render", available: true }} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("status").textContent).toContain("No substitute imagery");
  });

  it("marks the mismatch as a negative control", () => {
    render(<SarViewer title="MISMATCH CONTROL" detail="Translated" render={{ url: "/render", available: true }} control />);
    expect(screen.getByText("NEGATIVE CONTROL")).toBeTruthy();
  });
});
