import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { parseEvidence } from "./evidence";
import { resultStateFromExecution } from "./result-state";
import type { AnalysisResponse, CatalogScene, PlanResponse, SceneUploadResponse } from "./types";

export const CACHED_EXPLANATION = "This result was retrieved from a previously generated result artifact.";
export interface ReportContext {
  sceneId: string;
  question: string;
  source: CatalogScene["source"] | null;
  upload: SceneUploadResponse | null;
  plan: PlanResponse | null;
}
export interface ReportField { label: string; value: string; mono?: boolean }
export interface ReportPayload {
  generatedAt: string;
  sceneId: string;
  question: string;
  answer: string;
  fields: ReportField[];
  evidence: string[];
}
const known = (value: string | number | null | undefined): string =>
  value == null || /^(?:\s*|unknown|unspecified|n\/a|none|null)$/i.test(String(value).trim()) ? "Unknown" : String(value);

export function createReportPayload(result: AnalysisResponse, context: ReportContext, now = new Date()): ReportPayload {
  if (!context.sceneId || !context.question.trim() || !result.answer.trim() || resultStateFromExecution(result.execution_mode, result.results_artifact) === "unverified") {
    throw new Error("A valid completed analysis is required.");
  }
  const { source, upload, plan } = context;
  const trace = result.trace;
  const fields: ReportField[] = [
    { label: "Scene ID", value: context.sceneId },
    { label: "Dataset", value: known(source?.dataset) },
    { label: "Source", value: known(source?.source_id ?? upload?.filename) },
    { label: "Sensor", value: known(source?.sensor ?? upload?.sensor ?? trace.params.sensor) },
    { label: "GSD", value: known(source?.gsd ?? upload?.gsd) },
    { label: "Acquisition date", value: known(source?.acquisition_date ?? upload?.acquisition_date) },
    { label: "Model", value: known(result.model.name) },
    { label: "Model version", value: known(result.model.version) },
    { label: "Provider", value: known(trace.model_name) },
    { label: "Capability", value: known(trace.params.capability) },
    { label: "Execution mode", value: result.execution_mode === "cached_result" ? "Cached real result" : "Live" },
  ];
  const optional = (label: string, value: string | null | undefined, mono = false) => {
    if (value) fields.push({ label, value, mono });
  };
  if (result.execution_mode === "cached_result") optional("Cached result", CACHED_EXPLANATION);
  optional("Planner version", trace.params.planner_version ?? plan?.planner_version);
  optional("Planner rule", trace.params.planner_rule ?? plan?.rule_id);
  if (plan) {
    optional("Planner reason", plan.reason);
    optional("Planned provider", plan.provider);
    optional("Execution plan version", plan.execution_plan_version);
    if (plan.steps.length) optional("Execution plan", JSON.stringify(plan.steps, null, 2));
  }
  optional("Trace time", trace.timestamp_iso);
  optional("Record hash", trace.record_hash, true);
  optional("Previous hash", trace.prev_hash, true);
  optional("Cached artifact", result.results_artifact ?? trace.params.results_artifact);
  optional("Source scene", trace.params.source_scene_id);
  optional("Evaluated expression", trace.params.evaluated_expression);
  optional("Source run", trace.params.source_run_id);
  optional("Source Git SHA", trace.params.source_git_sha, true);
  optional("Source working tree SHA-256", trace.params.source_working_tree_sha256, true);
  fields.push({ label: "Integrity", value: "UNCHECKED" }, { label: "Verification", value: "Verification not performed." });
  const parsed = parseEvidence(result.evidence);
  const evidence = parsed.total === 0 ? ["No spatial evidence was produced for this analysis."] : [
    ...parsed.boxes.map(box => {
      // Preserve the returned coordinates, rather than the viewer's clamped geometry.
      const raw = result.evidence![box.index];
      return `Item ${box.index + 1}: ${box.label}\nCoordinates: ${JSON.stringify(raw.coordinates)}\nCoordinate space: normalized_xyxy (fractions of image width and height)${box.sourceSceneId ? `\nSource scene: ${box.sourceSceneId}` : ""}`;
    }),
    ...parsed.unsupported.map(item => `Item ${item.index + 1}: Evidence was returned but cannot be represented in this report. ${item.reason}`),
  ];
  return { generatedAt: now.toISOString(), sceneId: context.sceneId, question: context.question, answer: result.answer, fields, evidence };
}

export function reportFilename(sceneId: string, generatedAt: string): string {
  const scene = sceneId.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "scene";
  return `satquery-report-${scene}-${new Date(generatedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.pdf`;
}

export async function generatePdf(payload: ReportPayload): Promise<Uint8Array> {
  const response = await fetch("/fonts/DejaVuSans.ttf");
  if (!response.ok) throw new Error("Report font could not be loaded. Please retry.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const supported = new Set(font.getCharacterSet());
  const allText = [payload.question, payload.answer, ...payload.fields.flatMap(f => [f.label, f.value]), ...payload.evidence];
  for (const character of allText.join("")) {
    if (!/[\r\n\t]/.test(character) && !supported.has(character.codePointAt(0)!)) {
      throw new Error(`Report font cannot represent U+${character.codePointAt(0)!.toString(16).toUpperCase()}. No text was replaced.`);
    }
  }
  pdf.setTitle("SATQUERY AI — Geospatial Analysis Report");
  pdf.setCreationDate(new Date(payload.generatedAt));
  const blue = rgb(0.12, 0.32, 0.72), ink = rgb(0.12, 0.17, 0.24);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const nextPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
  function text(value: string, size = 10, face: PDFFont = font, accent = false) {
    const lineHeight = size * 1.5;
    for (const paragraph of value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
      let line = "";
      const draw = () => {
        if (y - lineHeight < 48) nextPage();
        page.drawText(line, { x: 46, y, size, font: face, color: accent ? blue : ink });
        y -= lineHeight;
      };
      for (const token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
        if (face.widthOfTextAtSize(line + token, size) <= 503) { line += token; continue; }
        if (line) { draw(); line = ""; }
        for (const character of token) {
          if (face.widthOfTextAtSize(line + character, size) > 503) { draw(); line = ""; }
          line += character;
        }
      }
      draw();
    }
    y -= 7;
  }
  function heading(label: string) {
    if (y < 105) nextPage();
    text(label, 11, font, true);
  }
  text("SATQUERY AI", 23, font, true);
  text("Geospatial Analysis Report", 15);
  text(`Generated (UTC): ${payload.generatedAt}`, 9);
  heading("Analyzed question"); text(payload.question, 12);
  heading("Answer"); text(payload.answer, 17);
  heading("Scene and execution details");
  for (const field of payload.fields) {
    heading(field.label);
    text(field.value, 10, field.mono && /^[\x20-\x7e\r\n]*$/.test(field.value) ? mono : font);
  }
  heading("Spatial evidence"); payload.evidence.forEach(item => text(item));
  heading("Interpretation note");
  text("Unknown metadata is intentionally left unknown. Execution provenance records how a result was obtained; it is not spatial evidence. Report generation does not run analysis or verify the trace.");
  pdf.getPages().forEach((p, index) => p.drawText(`${index + 1} / ${pdf.getPageCount()}`, { x: 510, y: 24, size: 8, font, color: ink }));
  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  try {
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to consume the click before releasing its Blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
