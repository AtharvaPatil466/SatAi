import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SarViewer } from "./SarViewer";

const noop = vi.fn();

describe("SarViewer — genuine render path", () => {
  it("renders the real Sentinel-1 image when render_available is true", () => {
    const { container } = render(
      <SarViewer scene="mumbai-coastal" available active={null} onActive={noop} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("/api/sar/mumbai-coastal/image");
    // The reference visualization must NOT appear on the genuine path.
    expect(screen.queryByText(/SAR Interpretation Guide/i)).toBeNull();
    expect(screen.queryByText(/NOT SATELLITE IMAGERY/i)).toBeNull();
  });
});

describe("SarViewer — reference visualization fallback", () => {
  it("renders the interpretation guide when render_available is false", () => {
    render(<SarViewer scene="mumbai-coastal" available={false} active={null} onActive={noop} />);
    expect(screen.getByText(/Sentinel-1 · SAR Interpretation Guide/i)).toBeInTheDocument();
    expect(screen.getByText("Reference visualization")).toBeInTheDocument();
    // All four conceptual regions are present.
    expect(screen.getByText("Water")).toBeInTheDocument();
    expect(screen.getByText("Built-up")).toBeInTheDocument();
    expect(screen.getByText("Vegetation")).toBeInTheDocument();
    expect(screen.getByText("Terrain")).toBeInTheDocument();
  });

  it("shows the explicit NOT SATELLITE IMAGERY disclosure", () => {
    render(<SarViewer scene="mumbai-coastal" available={false} active={null} onActive={noop} />);
    expect(screen.getByText(/Reference visualization — not satellite imagery/i)).toBeInTheDocument();
    expect(
      screen.getByText(/processed Sentinel-1 render is not available in this local environment/i),
    ).toBeInTheDocument();
  });

  it("requests no image URL on the fallback path", () => {
    const { container } = render(
      <SarViewer scene="mumbai-coastal" available={false} active={null} onActive={noop} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[src*="/api/sar"]')).toBeNull();
    // Only conceptual SVG textures — no external asset references.
    expect(container.querySelector('[src*="http"]')).toBeNull();
  });
});
