import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SceneUploadResponse } from "@/lib/types";
import { SceneMetadata } from "./SceneMetadata";

afterEach(cleanup);

const upload: SceneUploadResponse = {
  scene_id: "scene-1",
  filename: "scene.png",
  format: "PNG",
  width: 1024,
  height: 512,
  sensor: null,
  gsd: "0.3",
  location: null,
  acquisition_date: null,
  dataset: "LoveDA",
  verified_pixels: true,
};

describe("SceneMetadata", () => {
  it("omits unreported sensor metadata", () => {
    render(<SceneMetadata sceneId="scene-1" upload={{ ...upload, sensor: null, gsd: null, dataset: null }} />);
    expect(screen.queryByText("Sensor")).toBeNull();
    expect(screen.queryByText("GSD")).toBeNull();
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("renders reported metadata without a pixel-verification claim", () => {
    render(<SceneMetadata sceneId="scene-1" upload={{ ...upload, sensor: "Sentinel-2", location: "Delhi" }} />);
    expect(screen.getAllByText("Sentinel-2")).toHaveLength(2);
    expect(screen.getAllByText("LoveDA")).toHaveLength(2);
    expect(screen.getByText("scene.png")).toBeTruthy();
    expect(screen.getByText("1024 × 512")).toBeTruthy();
    expect(screen.getByText("Delhi")).toBeTruthy();
    expect(screen.queryByText("VERIFIED PIXELS")).toBeNull();
    expect(screen.queryByText("Status")).toBeNull();
  });

  it.each(["0.3", "0.3 m"])("formats reported upload GSD %s once", gsd => {
    render(<SceneMetadata sceneId="scene-1" upload={{ ...upload, gsd }} />);
    expect(screen.getAllByText("0.3 m")).toHaveLength(2);
    expect(screen.queryByText("0.3 m m")).toBeNull();
  });

  it("formats a reported source GSD when there is no upload", () => {
    render(<SceneMetadata sceneId="scene-1" upload={null} source={{ dataset: "LoveDA", dataset_split: null, source_id: "source-1", sensor: null, gsd: 0.3, location: null, acquisition_date: null }} />);
    expect(screen.getAllByText("0.3 m")).toHaveLength(2);
    expect(screen.queryByText("Sensor")).toBeNull();
  });
});
