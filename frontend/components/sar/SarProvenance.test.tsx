import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SarProvenance } from "./SarProvenance";
import type { SensorNecessityScene } from "@/lib/types";

afterEach(cleanup);

const scene = {
  s1: { product_id: "S1_PRODUCT", timestamp: "2020-05-23T10:03:18Z", polarization: ["VV", "VH"], orbit_direction: "ascending", relative_orbit: 69, processing: { orthorectification: true, dem_instance: "COPERNICUS_30", backscatter_coefficient: "GAMMA0_TERRAIN", stored_units: "linear" } },
  s2: { product_id: "S2_PRODUCT", timestamp: "2020-05-23T02:49:02.273Z", cloud_cover_percent: 4.39 },
  temporal_separation_seconds: 26055.727,
  grid: { width: 1024, height: 744, crs: "EPSG:4326" },
} as SensorNecessityScene;

describe("SarProvenance", () => {
  it("shows CDSE provenance from both acquisitions without ASF/HyP3 claims", () => {
    render(<SarProvenance scene={scene} />);
    for (const value of ["S1_PRODUCT", "S2_PRODUCT", "VV / VH", "ascending · relative orbit 69", "EPSG:4326 · 1024×744", "4.39%", "GAMMA0_TERRAIN (linear) · orthorectification enabled · DEM COPERNICUS_30"]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.queryByText(/ASF|HyP3/)).toBeNull();
  });
});
