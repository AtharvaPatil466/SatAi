import { Building2, Leaf, Mountain, Waves } from "lucide-react";
import type { ComponentType } from "react";

export type RegionKey = "water" | "built_up" | "vegetation" | "terrain";

export interface RegionMeta {
  key: RegionKey;
  label: string;
  /** Backscatter category — textbook SAR interpretation, not measured data. */
  category: string;
  /** Short educational explanation shown in the guide and on each card. */
  guide: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
}

// Conceptual radar-signature reference. These are general SAR interpretation
// principles, NOT satellite measurements and NOT model output.
export const SAR_REGIONS: RegionMeta[] = [
  {
    key: "water",
    label: "Water",
    category: "Low backscatter",
    guide: "Smooth surfaces reflect radar energy away from the sensor.",
    icon: Waves,
  },
  {
    key: "built_up",
    label: "Built-up",
    category: "High backscatter",
    guide: "Buildings can produce strong returns through double-bounce reflection.",
    icon: Building2,
  },
  {
    key: "vegetation",
    label: "Vegetation",
    category: "Volume scattering",
    guide: "Leaves, branches and canopy structure scatter radar energy in multiple directions.",
    icon: Leaf,
  },
  {
    key: "terrain",
    label: "Terrain",
    category: "Geometric effects",
    guide: "Terrain orientation can produce bright slopes, radar shadow and geometric distortion.",
    icon: Mountain,
  },
];
