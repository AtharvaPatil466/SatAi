import type { EvidenceRecord } from "./types";

/** The only evidence shape this build can draw. */
export const BOUNDING_BOX = "bounding_box";
export const NORMALIZED_XYXY = "normalized_xyxy";

/** A validated grounding box, in normalized image coordinates. */
export interface GroundingBox {
  /** Index into the raw evidence array; the shared selection key. */
  index: number;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Null unless the provider reported a real number. Never invented. */
  confidence: number | null;
  sourceSceneId: string | null;
}

/** An evidence item this build understands but cannot draw. */
export interface UnsupportedEvidence {
  index: number;
  type: string;
  reason: string;
}

export interface ParsedEvidence {
  boxes: GroundingBox[];
  unsupported: UnsupportedEvidence[];
  /** Total raw items, including ones that produced no box. */
  total: number;
}

const EMPTY: ParsedEvidence = { boxes: [], unsupported: [], total: 0 };

function normalizedNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

function coordinates(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const clamped = value.map(normalizedNumber);
  if (clamped.some((entry) => entry === null)) return null;
  const [x1, y1, x2, y2] = clamped as number[];
  // Tolerate a provider that reports corners in either order; never invent extent.
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/** Validate raw backend evidence into drawable boxes.
 *
 * Anything that is not a `normalized_xyxy` bounding box with four finite
 * coordinates is reported as unsupported rather than guessed at, so an
 * unknown future evidence type degrades to a listed item with no overlay.
 */
export function parseEvidence(evidence: EvidenceRecord[] | null | undefined): ParsedEvidence {
  if (!Array.isArray(evidence) || evidence.length === 0) return EMPTY;
  const boxes: GroundingBox[] = [];
  const unsupported: UnsupportedEvidence[] = [];
  evidence.forEach((item, index) => {
    const type = typeof item?.type === "string" && item.type ? item.type : "unknown";
    if (!item || typeof item !== "object") {
      unsupported.push({ index, type, reason: "Evidence item is not an object." });
      return;
    }
    if (type !== BOUNDING_BOX) {
      unsupported.push({ index, type, reason: `Evidence type "${type}" has no viewer in this build.` });
      return;
    }
    if (item.coordinate_space !== NORMALIZED_XYXY) {
      unsupported.push({ index, type, reason: `Coordinate space "${item.coordinate_space ?? "unspecified"}" is not supported.` });
      return;
    }
    const corners = coordinates(item.coordinates);
    if (!corners) {
      unsupported.push({ index, type, reason: "Coordinates are not four finite numbers." });
      return;
    }
    const [x1, y1, x2, y2] = corners;
    boxes.push({
      index,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "Unlabelled detection",
      x1,
      y1,
      x2,
      y2,
      confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : null,
      sourceSceneId: typeof item.source_scene_id === "string" && item.source_scene_id ? item.source_scene_id : null,
    });
  });
  return { boxes, unsupported, total: evidence.length };
}

/** Percentage geometry for a box drawn over the rendered image bounds.
 *
 * The overlay element is sized to the image's own rendered box, so
 * normalized coordinates map straight to percentages with no letterbox
 * correction and no dependence on the container's aspect ratio.
 */
export function boxStyle(box: GroundingBox): { left: string; top: string; width: string; height: string } {
  const percent = (value: number) => `${(value * 100).toFixed(4)}%`;
  return {
    left: percent(box.x1),
    top: percent(box.y1),
    width: percent(Math.max(0, box.x2 - box.x1)),
    height: percent(Math.max(0, box.y2 - box.y1)),
  };
}

/** Confidence as a percentage string, or null when none was reported. */
export function formatConfidence(confidence: number | null): string | null {
  return confidence === null ? null : `${(confidence * 100).toFixed(1)}%`;
}
