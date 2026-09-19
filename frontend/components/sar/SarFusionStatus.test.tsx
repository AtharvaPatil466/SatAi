import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SarFusionStatus } from "./SarFusionStatus";
import type { SensorNecessityReport, SensorNecessityScene } from "@/lib/types";

afterEach(cleanup);

describe("SarFusionStatus", () => {
  it("shows frozen API metrics as correspondence evidence, not performance", () => {
    const scene = { correct_support_pixels: 117496, mismatched_support_pixels: 19455, correct_to_mismatched_support_ratio: 6.03937, support_reduction_percent_when_mismatched: 83.44199 } as SensorNecessityScene;
    const rule = { ndwi_strictly_greater_than: 0.048095703125, vv_linear_gamma0_terrain_max: 0.053388334810733795, vh_linear_gamma0_terrain_max: 0.00929180160164833, component_connectivity: 8, minimum_component_pixels_inclusive: 64 } as SensorNecessityReport["locked_rule"];
    render(<SarFusionStatus scene={scene} rule={rule} />);
    for (const value of ["117,496", "19,455", "6.04×", "83.44%", "Correct pair:", "Mismatch control:"]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.queryByText(/accuracy|provider/i)).toBeNull();
  });
});
