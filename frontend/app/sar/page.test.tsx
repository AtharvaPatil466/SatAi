import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SarPage from "./page";
import * as api from "@/lib/api";
import type { SensorNecessityReport, SensorNecessityScene } from "@/lib/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const scene = (scene_id: string, geographic_description: string, ratio: number): SensorNecessityScene => ({
  scene_id,
  geographic_description,
  bbox: [1, 2, 3, 4],
  s1: {
    product_id: `S1-${scene_id}`,
    timestamp: "2020-05-23T10:03:18Z",
    polarization: ["VV", "VH"],
    orbit_direction: "ascending",
    relative_orbit: 69,
    processing: { acquisition_mode: "IW", resolution: "HIGH", orthorectification: true, dem_instance: "COPERNICUS_30", backscatter_coefficient: "GAMMA0_TERRAIN", stored_units: "linear" },
  },
  s2: { product_id: `S2-${scene_id}`, timestamp: "2020-05-23T02:49:02.273Z", cloud_cover_percent: 4.39 },
  temporal_separation_seconds: 26055.727,
  grid: { width: 1024, height: 744, crs: "EPSG:4326" },
  correct_support_pixels: 117496,
  mismatched_support_pixels: 19455,
  correct_to_mismatched_support_ratio: ratio,
  support_reduction_percent_when_mismatched: 83.4419895,
  support_overlap: { intersection_pixels: 1, union_pixels: 2, iou: 0.5, dice: 0.66 },
  boundary_overlap: { correct_pixels: 1, mismatched_pixels: 1, intersection_pixels: 0, union_pixels: 2, iou: 0, dice: 0 },
  retuned: false,
  renders: Object.fromEntries(["optical", "sar", "correct-fusion", "mismatched-sar"].map((name) => [name, { url: `/api/${scene_id}/${name}`, available: true }])) as SensorNecessityScene["renders"],
});

const report: SensorNecessityReport = {
  benchmark: "Frozen Sensor Necessity",
  status: "frozen",
  classification: "deterministic proxy; not model performance",
  disclaimer: "deterministic proxy benchmark construction; not semantic ground truth and not model performance.",
  locked_rule: { ndwi_formula: "(B03-B08)/(B03+B08)", ndwi_strictly_greater_than: 0.048095703125, vv_linear_gamma0_terrain_max: 0.053388334810733795, vh_linear_gamma0_terrain_max: 0.00929180160164833, fusion: "optical AND SAR at the same pixel", component_connectivity: 8, minimum_component_pixels_inclusive: 64, target: "one-pixel inner boundary" },
  scenes: [
    scene("cdse-yangtze-jiangsu-20200523", "Yangtze River near Jiangsu", 6.039),
    scene("cdse-rotterdam-port-20200530", "Rotterdam port", 8.023),
  ],
};

describe("/sar frozen Sensor Necessity page", () => {
  it("shows API-backed metrics and four scientific panels", async () => {
    vi.spyOn(api, "getSensorNecessity").mockResolvedValue(report);
    render(<SarPage />);
    await waitFor(() => expect(screen.getByText("6.04×")).toBeTruthy());
    for (const title of ["OPTICAL", "SAR", "CORRECT PAIR", "MISMATCH CONTROL"]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Deterministic proxy benchmark · Not model performance")).toBeTruthy();
  });

  it("switches between the two scene IDs returned by the API", async () => {
    vi.spyOn(api, "getSensorNecessity").mockResolvedValue(report);
    render(<SarPage />);
    await waitFor(() => expect(screen.getByText("6.04×")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rotterdam port" }));
    expect(screen.getByText("8.02×")).toBeTruthy();
    expect(screen.getByText("cdse-rotterdam-port-20200530")).toBeTruthy();
  });

  it("fails visibly without substitute results when the API fails", async () => {
    vi.spyOn(api, "getSensorNecessity").mockRejectedValue(new api.ApiError(503, "Frozen manifest unavailable."));
    render(<SarPage />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No substitute results or imagery"));
    expect(screen.queryByText("CORRECT PAIR")).toBeNull();
  });
});
