import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ImageryViewer } from "./ImageryViewer";
import type { EvidenceRecord } from "@/lib/types";

afterEach(cleanup);

const SCENE = "loveda_LoveDA_images_png_0_gsd0.3";

const boxRecord = (label: string, coordinates: number[], confidence: number | null = 0.91): EvidenceRecord => ({
  type: "bounding_box",
  label,
  coordinates,
  coordinate_space: "normalized_xyxy",
  confidence,
  source_scene_id: null,
});

/** jsdom never decodes pixels, so natural dimensions are declared explicitly
 *  the way a real decode would report them. */
function loadImage(width: number, height: number) {
  const image = screen.getByRole("img") as HTMLImageElement;
  Object.defineProperty(image, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: height, configurable: true });
  fireEvent.load(image);
  return image;
}

const overlayBoxes = () => within(screen.getByTestId("evidence-overlay")).getAllByRole("button");

const percentages = (node: HTMLElement) => ({
  left: Number.parseFloat(node.style.left),
  top: Number.parseFloat(node.style.top),
  width: Number.parseFloat(node.style.width),
  height: Number.parseFloat(node.style.height),
});

describe("ImageryViewer: scene pixel loading", () => {
  it("requests the real scene image endpoint and never a substitute", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toContain(`/api/scenes/${encodeURIComponent(SCENE)}/image`);
  });

  it("shows the loading state before the image reports pixels", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    expect(screen.getByRole("status").textContent).toContain("Loading scene pixels");
  });

  it("leaves the loading state once naturalWidth and naturalHeight are positive", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    const image = loadImage(1024, 1024);
    expect(image.naturalWidth).toBeGreaterThan(0);
    expect(image.naturalHeight).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("treats a load event with zero natural size as unavailable, not as a blank success", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    loadImage(0, 0);
    expect(screen.getByRole("status").textContent).toContain("Scene image unavailable");
  });

  it("reports an explicit error state when the backend cannot serve the image", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    fireEvent.error(screen.getByRole("img"));
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Scene image unavailable. No substitute imagery is shown.");
    expect(status.textContent).not.toContain("Loading");
  });

  it("shows no imagery and no endless loading state without a scene", () => {
    render(<ImageryViewer sceneId={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ImageryViewer: grounding evidence overlay", () => {
  it("renders no overlay when evidence is absent", () => {
    render(<ImageryViewer sceneId={SCENE} />);
    loadImage(800, 600);
    expect(screen.queryByTestId("evidence-overlay")).toBeNull();
  });

  it("renders no overlay for an empty evidence list, as cached VQA returns", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[]} />);
    loadImage(800, 600);
    expect(screen.queryByTestId("evidence-overlay")).toBeNull();
  });

  it("draws one box at the normalized coordinates the backend reported", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[boxRecord("building", [0.1, 0.2, 0.7, 0.8])]} />);
    loadImage(1024, 768);
    const [drawn] = overlayBoxes();
    // The CSSOM normalizes the percentage text, so compare the resolved values.
    expect(percentages(drawn)).toEqual({ left: 10, top: 20, width: 60, height: 60 });
    expect(drawn.textContent).toContain("building");
    expect(drawn.textContent).toContain("91.0%");
  });

  it("draws every box in a multi-detection payload", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[
      boxRecord("bridge", [0, 0, 0.5, 0.5], 0.42),
      boxRecord("vehicle", [0.5, 0.5, 1, 1], 0.77),
      boxRecord("pier", [0.2, 0.1, 0.4, 0.3], null),
    ]} />);
    loadImage(2000, 2000);
    const drawn = overlayBoxes();
    expect(drawn).toHaveLength(3);
    expect(drawn.map((node) => node.textContent)).toEqual(["bridge · 42.0%", "vehicle · 77.0%", "pier"]);
  });

  it("keeps the image mounted and visible while the overlay is drawn", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[boxRecord("building", [0.1, 0.2, 0.7, 0.8])]} />);
    const image = loadImage(1024, 768);
    expect(screen.getByTestId("evidence-overlay")).toBeTruthy();
    expect(image.isConnected).toBe(true);
    expect(image.className).not.toContain("hidden");
    expect(image.closest("div")?.className).not.toContain("hidden");
  });

  it("draws nothing for an unsupported evidence type instead of guessing", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[{ type: "segmentation_mask", label: "water", mask: "…" }]} />);
    loadImage(1024, 768);
    expect(screen.queryByTestId("evidence-overlay")).toBeNull();
  });

  it("marks the selected box and reports selection back to the workspace", () => {
    const onSelect = vi.fn();
    const evidence = [boxRecord("bridge", [0, 0, 0.5, 0.5]), boxRecord("vehicle", [0.5, 0.5, 1, 1])];
    const { rerender } = render(<ImageryViewer sceneId={SCENE} evidence={evidence} selected={null} onSelect={onSelect} />);
    loadImage(1024, 768);
    expect(overlayBoxes().map((node) => node.getAttribute("aria-pressed"))).toEqual(["false", "false"]);

    fireEvent.click(overlayBoxes()[1]);
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<ImageryViewer sceneId={SCENE} evidence={evidence} selected={1} onSelect={onSelect} />);
    expect(overlayBoxes().map((node) => node.getAttribute("aria-pressed"))).toEqual(["false", "true"]);

    fireEvent.click(overlayBoxes()[1]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("does not draw the overlay while the scene image is unavailable", () => {
    render(<ImageryViewer sceneId={SCENE} evidence={[boxRecord("building", [0.1, 0.2, 0.7, 0.8])]} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByTestId("evidence-overlay")).toBeNull();
  });
});
