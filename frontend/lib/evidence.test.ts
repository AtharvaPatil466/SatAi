import { describe, expect, it } from "vitest";
import { boxStyle, formatConfidence, parseEvidence } from "./evidence";
import type { EvidenceRecord } from "./types";

const box = (overrides: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  type: "bounding_box",
  label: "building",
  coordinates: [0.1, 0.2, 0.7, 0.8],
  coordinate_space: "normalized_xyxy",
  confidence: 0.91,
  source_scene_id: null,
  ...overrides,
});

describe("parseEvidence: absent evidence", () => {
  it.each([
    ["undefined (key omitted by response_model_exclude_unset)", undefined],
    ["null", null],
    ["empty list, as VQA providers return", []],
  ])("yields no boxes for %s", (_label, value) => {
    const parsed = parseEvidence(value as EvidenceRecord[] | null | undefined);
    expect(parsed.boxes).toEqual([]);
    expect(parsed.unsupported).toEqual([]);
    expect(parsed.total).toBe(0);
  });
});

describe("parseEvidence: bounding boxes", () => {
  it("parses one box exactly as Grounding DINO emits it", () => {
    const { boxes, unsupported, total } = parseEvidence([box()]);
    expect(unsupported).toEqual([]);
    expect(total).toBe(1);
    expect(boxes).toEqual([
      { index: 0, label: "building", x1: 0.1, y1: 0.2, x2: 0.7, y2: 0.8, confidence: 0.91, sourceSceneId: null },
    ]);
  });

  it("keeps multiple boxes in order with their own indices", () => {
    const { boxes } = parseEvidence([
      box({ label: "bridge", coordinates: [0, 0, 0.5, 0.5], confidence: 0.42 }),
      box({ label: "vehicle", coordinates: [0.5, 0.5, 1, 1], confidence: 0.77 }),
      box({ label: "pier", coordinates: [0.25, 0.25, 0.75, 0.4], confidence: 0.3 }),
    ]);
    expect(boxes.map((item) => [item.index, item.label, item.confidence])).toEqual([
      [0, "bridge", 0.42],
      [1, "vehicle", 0.77],
      [2, "pier", 0.3],
    ]);
  });

  it("clamps out-of-range coordinates and orders reversed corners", () => {
    const { boxes } = parseEvidence([box({ coordinates: [0.9, 1.4, 0.2, -0.3] })]);
    expect(boxes[0]).toMatchObject({ x1: 0.2, y1: 0, x2: 0.9, y2: 1 });
  });

  it("reports no confidence rather than inventing one", () => {
    expect(parseEvidence([box({ confidence: null })]).boxes[0].confidence).toBeNull();
    expect(parseEvidence([box({ confidence: undefined })]).boxes[0].confidence).toBeNull();
    expect(parseEvidence([box({ confidence: Number.NaN })]).boxes[0].confidence).toBeNull();
  });
});

describe("parseEvidence: unsupported shapes fail gracefully", () => {
  it.each([
    ["an unknown evidence type", box({ type: "segmentation_mask" })],
    ["an unsupported coordinate space", box({ coordinate_space: "pixel_xyxy" })],
    ["a missing coordinate space", box({ coordinate_space: undefined })],
    ["three coordinates", box({ coordinates: [0.1, 0.2, 0.3] })],
    ["non-numeric coordinates", box({ coordinates: ["a", "b", "c", "d"] })],
    ["coordinates that are not an array", box({ coordinates: { x1: 0 } })],
  ])("lists %s as unsupported and draws nothing", (_label, item) => {
    const { boxes, unsupported, total } = parseEvidence([item]);
    expect(boxes).toEqual([]);
    expect(total).toBe(1);
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0].index).toBe(0);
    expect(unsupported[0].reason).toBeTruthy();
  });

  it("still draws the valid boxes in a mixed payload", () => {
    const { boxes, unsupported } = parseEvidence([
      box({ label: "valid" }),
      box({ type: "polygon" }),
      box({ label: "also valid", coordinates: [0, 0, 1, 1] }),
    ]);
    expect(boxes.map((item) => item.label)).toEqual(["valid", "also valid"]);
    expect(boxes.map((item) => item.index)).toEqual([0, 2]);
    expect(unsupported.map((item) => item.index)).toEqual([1]);
  });
});

describe("boxStyle: normalized coordinates map to the rendered image bounds", () => {
  it("converts normalized xyxy into percentage offsets and extents", () => {
    const [target] = parseEvidence([box({ coordinates: [0.1, 0.2, 0.7, 0.8] })]).boxes;
    expect(boxStyle(target)).toEqual({ left: "10.0000%", top: "20.0000%", width: "60.0000%", height: "60.0000%" });
  });

  it("spans the whole image for a full-frame box", () => {
    const [target] = parseEvidence([box({ coordinates: [0, 0, 1, 1] })]).boxes;
    expect(boxStyle(target)).toEqual({ left: "0.0000%", top: "0.0000%", width: "100.0000%", height: "100.0000%" });
  });

  it("is independent of image aspect ratio, so a scaled image keeps alignment", () => {
    const [target] = parseEvidence([box({ coordinates: [0.25, 0.5, 0.5, 0.75] })]).boxes;
    // Percentages are relative to the image's own rendered box, so the same
    // style is correct for a 4000x4000 scene and a 640x480 thumbnail alike.
    expect(boxStyle(target)).toEqual({ left: "25.0000%", top: "50.0000%", width: "25.0000%", height: "25.0000%" });
  });

  it("produces a zero-extent box rather than a negative one", () => {
    const [target] = parseEvidence([box({ coordinates: [0.5, 0.5, 0.5, 0.5] })]).boxes;
    expect(boxStyle(target)).toMatchObject({ width: "0.0000%", height: "0.0000%" });
  });
});

describe("formatConfidence", () => {
  it("formats a reported confidence", () => expect(formatConfidence(0.91)).toBe("91.0%"));
  it("returns null when none was reported", () => expect(formatConfidence(null)).toBeNull());
});
