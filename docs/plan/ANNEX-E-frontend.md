# SatQuery AI — Frontend Track (Track B) Implementation Plan

**Author date:** 13 Sept 2026 · **Demo:** SIH finale, 8–15 Dec 2026 · **Build window:** 13 working weeks
**Scope:** `/Users/atharva/SIH/frontend` (Next.js 16.3.4 / React 19.2.8 / TS 7.0.2 strict / Tailwind 3.4.19)
**Protected floor:** `/Users/atharva/SIH/demo_gui/app.py` (Streamlit) — never deleted, never allowed to rot.

---

## 0. The finding that should reorder everything

I read the whole frontend (613 lines) and the whole backend surface before writing this. One thing dominates:

**The Streamlit fallback is currently a *more capable product* than the Next.js app.**

| Capability | Streamlit `demo_gui/app.py` | Next.js frontend |
|---|---|---|
| Free-text question | ✅ `st.text_input` | ❌ `readOnly` textarea, one hardcoded string |
| Upload a scene | ✅ `st.file_uploader`, wired to `route()` | ❌ permanently `disabled` button |
| Sensor selection | ✅ `st.selectbox` | ❌ hardcoded `"LoveDA"` in `lib/api.ts` |
| Resolution ladder | ✅ | ✅ (nicer) |
| SAR annotation | ✅ | ✅ (nicer) |
| Trace verify | ✅ | ✅ (nicer) |
| Planner / capabilities / execution plan | ❌ (hardcoded strings) | ❌ (hardcoded strings) |

The Next.js app is prettier and strictly less functional. The *only* honest framing of Phase 1 is:
**reach parity with the floor, then exceed it.** Anything that ships before parity is decoration.

Second finding, equally important: **~1,100 lines of tested orchestrator code has zero pixels.**
`/api/plan` returns a full deterministic planning decision with typed multi-step execution plans,
provider availability, and refusal reasons. `/api/capabilities` returns live provider bindings.
`lib/api.ts` calls neither. The trace records already written to `trace.jsonl` carry
`capability`, `planner_version`, `planner_rule`, `execution_plan_version`, `execution_step_id`,
`execution_step_index`, `execution_step_count` (written by `orchestrator/router.py`) — and
`lib/types.ts`'s `TraceRecord` declares none of them, so `EvidencePanel` renders none of them.

**Surfacing the planner costs about 9 hours and is the highest demo-value-per-hour work in the
entire project.** Grounding overlays cost ~20 hours. The current plan order has these inverted.

---

## 1. Honest workload assessment

### 1.1 Frontend-only estimate

Estimates are for one competent person who already knows this codebase, including debugging,
backend-drift fixes, and one review pass. They are *not* padded and they are *not* optimistic.

| # | Work item | Hours |
|---|---|---:|
| 0 | Week-0 hygiene: ESLint flat config, Prettier, dead deps, Playwright install + 1 smoke test | 6 |
| 1 | `lib/api.ts` + `lib/types.ts` rewrite against `backend/schemas.py` (6 new functions, upload trap, error normaliser) | 5 |
| 2 | **Phase 1** (15–28 Sep): real upload, free-text question, scene state, live `/api/capabilities`, **PlanPanel** | 14 |
| 3 | **Phase 2** (29 Sep–5 Oct): evidence/provenance render, hash-chain ledger view | 12 |
| 4 | **Phase 3** (6–19 Oct): grounding — SVG overlay, image↔box coordinate transform, zoom/pan sync | 20 |
| 5 | **Phase 4** (20 Oct–2 Nov): bi-temporal t1/t2 pair UI, two-scene upload, comparison view | 17 |
| 6 | **Phase 5** (3–16 Nov): optical–SAR fusion UI **if built** | 13 |
| 7 | **Phase 6** (17–23 Nov): agentic orchestration view (mostly reuses PlanPanel + trace steps) | 10 |
| 8 | **Phase 7** (24–30 Nov): Resolution Lab new ladder numbers | 5 |
| 9 | **Phase 9** (1–5 Dec): judge System Status screen, offline bundle, zero-CDN audit | 14 |
| 10 | **Phase 10** (5–7 Dec): rehearsal, projector fixes, breakage | 10 |
| 11 | Accessibility + projector/contrast pass (spread, not one block) | 6 |
| 12 | Continuous: E2E upkeep, Streamlit parity checks, bug triage @ ~2 h/week × 13 | 26 |
| | **Subtotal** | **158** |
| | +15 % backend-drift / integration reality buffer | 24 |
| | **Frontend total** | **≈ 182 h** |

### 1.2 Capacity

One person. 13 weeks. A motivated finalist with other commitments realistically delivers
**20–25 h/week of actual build time** — call it 22. That is **≈ 286 h for all of Track B**.

But the same person also owns infra, testing and hardening across the *whole* system:
environment reproducibility, the GPU box, deployment, CI (there is no `.github/` at all today),
the offline bundle for backend + model weights + data, security/robustness hardening, and the
backend test suite. Conservatively **150–200 h**.

```
Demand:   182 (frontend) + 175 (infra/testing/hardening, midpoint)  =  357 h
Supply:   22 h/week × 13 weeks                                      =  286 h
Overcommitment:                                                        ~1.25×
```

And the 13 weeks are not fungible. 1–7 Dec is bundle + rehearsal and cannot absorb build work.
The **real build window is ~11 weeks ≈ 242 h**, which puts the overcommitment at **~1.5×**.

### 1.3 Verdict

> **No. The full scope does not fit.** It is roughly 1.25–1.5× over capacity before a single
> week is lost to a dead GPU, a failed dependency install, exams, or a backend contract change.
> A plan that claims otherwise is lying to the team.

### 1.4 What that means in practice — cut these, in this order

1. **Phase 5 optical–SAR fusion UI → cut at the hard checkpoint (3 Nov).** Saves 13 h. Take the
   pre-agreed exit; do not hedge with half a UI. Replace with a 1-hour honest "NOT DEPLOYED"
   state (see §5, Phase 5). The `/api/capabilities` endpoint already returns
   `{name: "optical_sar", available: false, provider: null}` — if the UI simply renders that
   endpoint truthfully, the cut costs **zero extra frontend work** and the SAR Validation page
   (human analyst annotation, already built and already labelled "NOT AI MODEL OUTPUT") still
   carries the SAR story. This is the cleanest 13 hours available.
2. **Phase 3 grounding → read-only overlay only.** No interactive box editing, no drawing tools,
   no per-region hover cards. Render the boxes the backend returns, over the image, with a legend.
   20 h → 12 h. Saves 8 h.
3. **Phase 4 bi-temporal → static side-by-side, not a swipe comparator.** A drag-swipe slider is
   the classic demo-day failure on an unfamiliar trackpad/projector. Two images side by side with
   a shared change list is more legible at 1024×768 anyway. 17 h → 10 h. Saves 7 h.
4. **Hand off, don't cut:** the Streamlit parity check and the offline-bundle verification are
   *checklists*, not code. Give them to one of the four non-build team members (see §7). Saves
   ~10 h of Track B time and gives a pitch person a real, ownable job.

Total recovered: **≈ 38 h**, landing frontend at **~144 h** and total Track B at **~319 h** against
a 242–286 h supply. **Still over.** The residual gap is closed only by the priority ordering in §2:
when week 10 is short, the bottom of the list does not ship and nothing above it is jeopardised.

### 1.5 The one thing that would actually fix this

Track B is one person carrying ~12 workstreams. The honest structural fix is not a better plan —
it is **moving infra + offline bundling to Track A** (the backend owner already knows the model,
weights and data paths better than anyone) and leaving Track B with frontend + testing. That
converts a 1.5× overcommitment into roughly 1.0×. Say this to the team now, in week 1, while it is
still a scheduling decision and not an emergency.

---

## 2. Ruthless priority ordering

**Tier 0 — the demo does not happen without these.** Sacrifice anything below to protect them.

1. Streamlit fallback stays runnable and verified every single week (§7).
2. Offline: the judged path makes **zero** network requests. Currently true; must stay true.
3. Zero fabrication. Includes the fabricated map coordinates shipping today (§9, D1).
4. `npm run build` green at every phase boundary; a tagged, known-good commit before each phase.

**Tier 1 — what makes judges believe the project.** In value order:

5. **Free-text question + real upload** (parity with the floor). Without this the judge cannot ask
   *their own* question, and the whole demo reads as a canned video.
6. **PlanPanel** — render `/api/plan`. Shows deterministic capability routing, the multi-step
   execution plan, and — crucially — an *honest refusal* with a named reason when a capability has
   no provider. A system that says "I will not answer that, here is why" is the strongest possible
   answer to the judges' "is this just an LLM hallucinating?" question. ~4 h.
7. **Live `/api/capabilities`** replacing the two hardcoded arrays in `CapabilityStatus.tsx`. ~2 h.
   Guarantees the capability board can never lie, which is the whole zero-fabrication thesis.
8. **Evidence panel showing real trace fields** (capability, planner rule, hash chain). The data
   is already in `trace.jsonl`; the UI throws it away.
9. **Resolution Lab with the new ladder numbers** (Phase 7). Headline ISRO differentiator; the
   chart already exists, so this is cheap — but it must reflect *current* numbers, never stale ones.
10. **System Status screen** (Phase 9). One glance, judge-legible, honest reds.

**Tier 2 — real capability, real cost.**

11. Grounding overlay (read-only).
12. Bi-temporal side-by-side.
13. Agentic orchestration view (only tools actually invoked).

**Tier 3 — polish. Cut without discussion when the week is short.**

14. Swipe comparators, animated transitions, map interactivity beyond pan/zoom, shadcn/ui adoption,
    dark/light theming, mobile layouts below 768 px, any chart that is not the ladder.

**Explicitly out of scope, forever:** auth, multi-user, persistence beyond `trace.jsonl`,
a design system, Storybook, i18n, component unit-test coverage targets.

---

## 3. Immediate fixes — this week (13–20 Sept), ~6 hours

### 3.1 The broken `lint` script

`next lint` was **removed in Next 16**. Confirmed against the bundled docs in this repo:
`frontend/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:1084` —
*"The `next lint` command has been removed. Use Biome or ESLint directly. `next build` no longer
runs linting."* The current failure (`no such directory: .../frontend/lint`) is npm passing `lint`
to `next` as a positional directory argument.

Replacement — ESLint flat config, per `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`:

```bash
cd /Users/atharva/SIH/frontend
npm i -D eslint eslint-config-next
```

`frontend/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

`package.json`: `"lint": "eslint ."` and `"lint:fix": "eslint . --fix"`.

Note `next build` no longer lints, so lint must be run explicitly — it goes in the Makefile
`test` target (§6.4). A codemod exists (`npx @next/codemod@canary next-lint-to-eslint-cli .`) but
for a 613-line app the three steps above are faster and leave nothing to inspect.

### 3.2 Formatter — fixes the one-line-JSX problem

`app/executions/page.tsx:32` is a single ~1,200-character line. This is not a style preference;
it makes every future diff in that file unreviewable and every merge a conflict.

```bash
npm i -D prettier
```

`frontend/.prettierrc.json`:

```json
{ "printWidth": 100, "semi": true, "singleQuote": false, "trailingComma": "all" }
```

Scripts: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.
Add `.prettierignore` with `.next`, `node_modules`, `package-lock.json`, `next-env.d.ts`.

Run `npm run format` **once**, in its own commit, touching nothing else. A 613-line reformat mixed
into a feature commit destroys the review history. Verify `npm run build` after.

Skipping `eslint-config-prettier`: with `printWidth` set and no stylistic ESLint rules enabled in
`eslint-config-next`, the two do not currently conflict. Add it only if a conflict actually appears.

### 3.3 Dead dependencies

`@radix-ui/react-slot` and `class-variance-authority` are imported in zero files.

```bash
npm uninstall @radix-ui/react-slot class-variance-authority
```

**Keep `components.json`.** It is inert configuration (4 lines of aliases) and if a shadcn
component is ever genuinely needed, `npx shadcn add` works against it. Deleting it saves nothing
and costs a re-setup later. `clsx` + `tailwind-merge` stay — `lib/utils.ts:cn()` uses both.

### 3.4 Minimal test setup

**Recommendation: Playwright, and nothing else. No unit-test runner.**

Justification, given zero infrastructure exists today:

- The frontend has **almost no testable logic**. `lib/utils.ts` has two 3-line functions; everything
  else is JSX and `fetch`. A component-unit setup (Vitest + jsdom + Testing Library + a Next
  transform) is ~4 h of configuration to test markup that a human will eyeball on a projector
  anyway. That is negative value for an overloaded person.
- The actual demo risk is **"does the click path work end-to-end against a real backend"** — upload
  a file, ask a question, see a real answer with real provenance. Only a browser-driving test
  answers that. Playwright answers it in one tool with no mocking layer to drift.
- Playwright also gives the projector check for free: `page.setViewportSize({width: 1024, height: 768})`
  plus a screenshot, which is the exact failure mode nobody notices until the finale.

```bash
npm i -D @playwright/test
npx playwright install chromium     # ← DO THIS NOW, WHILE THERE IS INTERNET
```

**Install the browser binary this week.** It is a ~150 MB download. Discovering that requirement at
the venue on a throttled connection is a preventable Tier-0 failure.

`frontend/playwright.config.ts` — start minimal:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

Script: `"e2e": "playwright test"`.

**Ship exactly one test this week** (`e2e/golden.spec.ts`): load `/workspace`, click Ask,
assert a non-empty answer appears **and** that an execution badge is present. That single test is
the tripwire for "the demo path is broken", which is the only thing that matters this week.

**When to add a unit runner:** Phase 3 introduces image↔overlay coordinate transforms — genuine
pure logic where an off-by-one is invisible on screen and wrong on a projector. At that point use
Node's **built-in** runner with type stripping, zero new dependencies:

```bash
node --test --experimental-strip-types lib/*.test.ts   # verify on Node 22.20 before relying on it
```

If type stripping misbehaves, the fallback is to keep the transform in plain `.js` — still zero deps.
Do not install Vitest for two pure functions.

### 3.5 Also this week (30 minutes, Tier 0)

Fix the fabricated coordinates in `components/imagery/ImageryViewer.tsx` — see §9, defect **D1**.
This is a zero-fabrication violation currently shipping, and it is a half-hour fix.

---

## 4. The API client gap — exact specification

### 4.1 Types to add to `lib/types.ts` (mirroring `backend/schemas.py`)

```ts
// Mirrors orchestrator/capabilities.py KNOWN_CAPABILITIES. Keep this union in sync;
// it is the only place the frontend is allowed to name a capability.
export type Capability = "single_image_vqa" | "grounding" | "change_vqa" | "optical_sar";

// backend/schemas.py :: SceneUploadResponse
export interface SceneUploadResponse {
  scene_id: string;              // "scene_<32 hex>"
  filename: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
  sensor: null;                  // backend pins these to None today — typed as null on purpose,
  gsd: null;                     // so the UI can never render an invented value. Widen the type
  location: null;                // only when the backend actually starts returning data.
  acquisition_date: null;
}

// backend/schemas.py :: CapabilityStatus
export interface CapabilityStatusEntry {
  name: Capability;
  available: boolean;
  provider: string | null;
}

// backend/schemas.py :: CapabilitiesResponse
export interface CapabilitiesResponse {
  capabilities: CapabilityStatusEntry[];
}

// backend/schemas.py :: PlanStepSummary
export interface PlanStepSummary {
  step_id: string;               // "step_1", "step_2"
  capability: Capability;
  depends_on: string[];
  required_inputs: string[];     // "single_scene" | "scene_pair" | "optical_scene" | "sar_scene" | "step_1.output"
  provider_available: boolean;
  provider: string | null;
}

// backend/schemas.py :: PlanResponse
export interface PlanResponse {
  planner_version: string;           // "phase0-rules-v1"
  rule_id: string;                   // e.g. "default_single_image_vqa", "temporal_change_then_grounding"
  requested_capability: Capability | null;
  selected_capability: Capability;
  executable: boolean;
  reason: string;
  required_inputs: string[];
  missing_inputs: string[];          // "scene" | "second_scene"
  provider_available: boolean;
  provider: string | null;
  unavailable_reason: string | null;
  execution_plan_version: string;    // "phase0-plan-v1"
  steps: PlanStepSummary[];
  unavailable_capabilities: Capability[];
}

// backend/schemas.py :: AnalyzeRequest — `capability` is currently never sent by the UI.
export interface AnalyzeRequestBody {
  scene_id: string;
  question: string;                  // 1..2000 chars (MAX_QUESTION_LENGTH)
  sensor?: string | null;
  capability?: Capability | null;
}
```

**Extend the existing `TraceRecord.params`** — these fields are written today by
`orchestrator/router.py` and `backend/services.py:_cached_response` and are currently invisible:

```ts
export interface TraceRecord {
  model_name: string;
  model_version: string;
  params: {
    execution_mode: ExecutionMode;
    results_artifact?: string;
    scene_id?: string;
    sensor?: string;
    // present on both the cached and live paths — currently untyped and unrendered:
    capability?: Capability;
    planner_version?: string;
    planner_rule?: string;
    requested_capability?: Capability | null;
    execution_plan_version?: string;
    execution_step_id?: string;
    execution_step_index?: number;
    execution_step_count?: number;
  };
  input_summary: { image_paths: string[]; question: string; n_images: number };
  timestamp_iso: string;
  record_hash: string;
  prev_hash: string;
}
```

### 4.2 Functions to add to `lib/api.ts`

```ts
// POST /api/scenes  (multipart) -> 201 SceneUploadResponse
// 413 oversize (>20 MiB) · 422 InvalidImageUpload · 500 SceneStorageError
export function uploadScene(file: File): Promise<SceneUploadResponse>;

// GET /api/capabilities -> CapabilitiesResponse
export function getCapabilities(): Promise<CapabilitiesResponse>;

// POST /api/plan -> PlanResponse. Invokes no model, writes no trace, touches no GPU.
// Safe to call on every question change (debounced). 422 on invalid/unknown capability.
export function planAnalysis(body: AnalyzeRequestBody): Promise<PlanResponse>;

// POST /api/analyze -> AnalysisResponse. Replaces analyzeGolden(); takes real parameters.
// 422 unavailable/invalid · 502 model failure · 503 capability or artifact unavailable
export function analyze(body: AnalyzeRequestBody): Promise<AnalysisResponse>;

// GET /api/scenes/{scene_id}/image -> URL string, not a fetch. Feeds <img src> / map source.
// 404 when local pixels are absent — callers MUST handle the empty state.
export function sceneImageUrl(sceneId: string): string;
```

`analyzeGolden()` is **deleted**, not kept alongside. Two paths to the same endpoint is exactly how
the demo ends up asking the hardcoded question by accident under pressure.

### 4.3 Three traps in the current `request()` helper — fix before writing any of the above

**T1 — the upload will silently fail.** `request()` sets `"Content-Type": "application/json"`
unconditionally. Sending `FormData` with an explicit `Content-Type` omits the multipart boundary and
FastAPI rejects it. `uploadScene` must let the browser set the header:

```ts
export async function uploadScene(file: File): Promise<SceneUploadResponse> {
  const body = new FormData();
  body.append("file", file);                       // field name must be "file" (routes/analyze.py)
  const response = await fetch(`${API_URL}/api/scenes`, { method: "POST", body, cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<SceneUploadResponse>;
}
```

The cleanest fix is to make `request()` set the JSON header **only when a body is a string**, so
one helper serves both.

**T2 — `detail` is not always a string.** `request()` does `body?.detail ?? ...`. FastAPI's own
422 validation errors return `detail` as an *array of objects*, which renders as `[object Object]`
in `role="alert"` — in front of judges. Normalise:

```ts
async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg ?? "Invalid input").join("; ");
  return `Request failed (${response.status})`;
}
```

**T3 — no timeout.** `analyze` can take up to 120 s (`MODEL_EXECUTION_TIMEOUT_SECONDS`) and the
browser will hang with no feedback if the API dies mid-request. Pass an `AbortSignal.timeout(125_000)`
on `analyze` only (the read endpoints should use ~10 s) and surface the abort as a clean, honest
"No answer was generated" — never as a blank screen.

---

## 5. Per-phase UI build plan

Every phase ends with: `npm run build` green, `npm run lint` clean, the E2E demo path passing, the
Streamlit floor verified, and a git tag `fe-phase-N-green`. If a phase's UI is not done by its end
date, **the phase ships without it** — the tag from the previous phase is the demo.

### Phase 1 — 15–28 Sept · Real scene upload + parity with the floor · 14 h

| Component | Path | Work |
|---|---|---|
| `lib/api.ts`, `lib/types.ts` | `lib/` | Full rewrite per §4. **Do this first; everything blocks on it.** |
| `UploadScene.tsx` | `components/imagery/` | Replace the disabled button. Real `<input type="file" accept="image/png,image/jpeg">` (native — no dropzone library). Client-side 20 MiB pre-check matching `MAX_UPLOAD_BYTES`. Pending / error / success states. On success lift `SceneUploadResponse` to workspace state. |
| `QueryPanel.tsx` | `components/analysis/` | Remove `readOnly`. Controlled textarea, `maxLength={2000}`. Disable submit on empty/whitespace. Call `analyze()` with the **current** scene id. |
| `SceneMetadata.tsx` | `components/imagery/` | Take a scene prop. For uploads render `filename`, `width×height`, `format`, and **"GSD: not recorded"** — never an invented value (the API returns `null` by design). |
| `ImageryViewer.tsx` | `components/imagery/` | **Split.** Georeferenced scenes keep maplibre; ungeoreferenced scenes (all uploads, and the LoveDA golden tile) render a plain `<img>` with pan/zoom. Delete the fabricated coordinate readout (§9 D1). |
| `CapabilityStatus.tsx` | `components/status/` | Delete both hardcoded arrays. Fetch `/api/capabilities`. Render `name`, `available`, `provider`. Loading and unreachable states must be distinguishable from "unavailable". |
| **`PlanPanel.tsx`** *(new)* | `components/analysis/` | Render `/api/plan` **before** analysis runs: selected capability, rule id, planner version, step chain (`step_1 → step_2`), per-step provider availability, and `unavailable_reason` verbatim when non-executable. This is the money shot. |

**Phase 1 demo sentence:** *"Ask it anything about any image you upload. Before it answers, it tells
you which capability it routed to, why, and — if it can't do it — exactly what is missing."*

### Phase 2 — 29 Sept–5 Oct · Evidence, provenance, audit ledger · 12 h

- `EvidencePanel.tsx` — add capability, planner rule, planner version, execution-plan version and
  step position from the now-typed `trace.params`. Render `AnalysisResponse.notice`, which the UI
  currently **discards** (§9 D2). Delete the literal string `"Confidence calibration pending"` from
  `AnalysisResult.tsx` — a placeholder on a projector reads as an unfinished product.
- `LedgerView.tsx` *(new, `components/evidence/`)* — the hash chain as a chain: each record showing
  `prev_hash → record_hash` linkage, so tampering is visibly detectable. Wire `POST /api/traces/verify`.
- `IntegrityBadge.tsx` — currently hardcodes "Hash chained" with no verification behind it. Make it
  reflect actual verify state (`unverified` / `verified` / `failed`), or it is decoration
  masquerading as evidence.
- `app/executions/page.tsx` — reformat (it is the 1,200-char line); add the ledger view.

### Phase 3 — 6–19 Oct · Grounding overlays · 12 h *(reduced from 20; read-only)*

- `GroundingOverlay.tsx` *(new, `components/imagery/`)* — absolutely-positioned SVG over the image.
  Normalised `[x, y, w, h]` in image space → rendered space. One pure transform function, one
  `node --test` file (§3.4). Labels placed to never cover their own box.
- Coordinate types land in `lib/types.ts` **only once the backend actually returns them.** Do not
  invent a shape and build against it — that is how a week disappears to a rename.
- `AnalysisResult.tsx` — typed spatial evidence list, each row hover-linked to its box.
- Honest empty state: capability available but zero regions returned → *"No regions localised"*,
  never an empty overlay that looks like a rendering bug.
- **Cut:** box editing, drawing tools, region hover cards, multi-class legends.

### Phase 4 — 20 Oct–2 Nov · Bi-temporal Change-VQA · 10 h *(reduced from 17; side-by-side)*

- `ScenePairPicker.tsx` *(new)* — two upload slots, t1 / t2, explicit labels. Reuses `UploadScene`.
- `ChangeComparison.tsx` *(new)* — static side-by-side, synchronised pan/zoom, shared change list.
  **No swipe slider** — it fails on unfamiliar trackpads and is illegible at 1024×768.
- `PlanPanel` already handles this: `change_vqa` with `missing_inputs: ["second_scene"]` renders
  correctly the moment only one scene is loaded. Free Phase 4 behaviour from Phase 1 work.
- Chronology must be asserted from metadata, never assumed from upload order. If acquisition dates
  are unknown (they are — the API returns `null`), label them **"Scene A / Scene B"**, not
  "before / after". Calling an arbitrary upload "before" is fabrication.

### Phase 5 — 3–16 Nov · Optical–SAR fusion · **1 h if cut** (13 h if built)

**Recommendation: cut at the 3 Nov checkpoint.**

The clean-cut procedure, which must be decided *before* any Phase 5 code is written:

1. All fusion UI lives in exactly one new directory, `components/fusion/`, and one route,
   `app/fusion/`. Nothing fusion-specific is allowed anywhere else.
2. Cutting = `git rm -r components/fusion app/fusion` + removing one `Sidebar.tsx` nav entry.
   One commit, no archaeology, no dead imports.
3. The "NOT DEPLOYED" state needs **no code at all**: `CapabilityStatus` already renders
   `/api/capabilities`, which returns `{name: "optical_sar", available: false, provider: null}`.
   And `PlanPanel` already refuses fusion questions with the planner's real reason
   (`optical_sar_cross_modal` rule → `unavailable_reason`). The honest state is the *default*.
4. The SAR story survives intact: `/sar` already ships the human analyst annotation behind a
   prominent **"HUMAN SAR VALIDATION — NOT AI MODEL OUTPUT"** banner. That banner is exactly the
   scientific honesty judges reward. Leave it.

**Phase 5 checkpoint rule:** if fusion is not *already working in the backend* on 3 Nov, cut it.
Do not start frontend work on a capability whose provider does not exist.

### Phase 6 — 17–23 Nov · Agentic orchestration · 10 h

- `ExecutionTimeline.tsx` *(new, `components/analysis/`)* — the steps **actually invoked**, sourced
  from `trace.params.execution_step_id` / `execution_step_index` / `execution_step_count`. Not from
  the *plan*. Planned-but-not-executed steps must be visually distinct from executed ones.
- `orchestrator/executor.py` is all-or-nothing (`execute_plan` refuses any plan with an unavailable
  step before invoking anything). The UI must mirror that honestly: *"Plan required 2 steps; step 2
  has no provider; nothing was executed."* That sentence is worth more to judges than a fake
  progress animation.
- **No theatre.** No spinners for steps that never ran, no "thinking..." for a synchronous call,
  no simulated tool chatter. Reuses `PlanPanel`, so most of this is composition.

### Phase 7 — 24–30 Nov · Resolution Lab, new ladder numbers · 5 h

- `ResolutionChart` / `ResolutionTable` / `DegeneracyWarning` already read the artifact generically.
  The work is: verify against the *new* artifact, fix the hardcoded `YAxis domain={[0, 0.6]}` in
  `ResolutionChart.tsx:397` (new numbers may exceed 0.6 and silently clip — **a chart that clips its
  own headline result in front of ISRO judges**), and surface `report.provenance`, which the type
  declares but no component renders.
- Add the artifact filename + run timestamp visibly on the page. Provenance *is* the differentiator.
- Recharts renders SVG with no external assets — offline-safe. Confirmed.

### Phase 9 — 1–5 Dec · Judge System Status + offline bundle · 14 h

- `app/system/page.tsx` rebuild for **projector legibility at 3 metres**: big status tiles (API, DB,
  queue, worker, GPU), each green/amber/red with a plain-language line. No dense tables.
  The current page uses `text-[10px]` and `text-[11px]` in four places — unreadable on a projector.
- `RuntimeStatus.tsx` — extend beyond `/api/health`. Amber for "checking" must never be mistakable
  for green. Requires a backend health endpoint returning component-level status; **agree that
  contract with Track A by 17 Nov**, not in December.
- Offline bundle verification: §6.5.

### Phase 10 — 5–7 Dec · Rehearsal · 10 h

Full run-through on the actual demo hardware at the actual resolution, three times, including the
failure paths (kill the API mid-question; upload a corrupt file; upload a 25 MB file). Fix only what
breaks. **Freeze the frontend on 7 Dec.** No feature lands after the freeze, for any reason.

---

## 6. Testing strategy for one overloaded person

**Principle:** every test must be one you would actually be sad to lose at 2 a.m. on 7 Dec.
Coverage percentage is not a goal here and chasing it would be malpractice given the capacity math.

### 6.1 What earns its keep — 5 E2E tests, that is the whole suite

`frontend/e2e/`:

1. **`golden.spec.ts`** — load `/workspace`, ask a question, assert a non-empty answer **and** an
   execution badge. The demo path. Written in week 1.
2. **`upload.spec.ts`** — upload a real PNG fixture, assert a scene id appears, ask a question about
   it, assert an answer. The Phase 1 acceptance test.
3. **`refusal.spec.ts`** — ask a fusion/change question with one scene; assert the UI shows an
   honest refusal with the planner's reason and **no answer text anywhere on the page**. This is the
   zero-fabrication regression test and it is the most valuable test in the suite.
4. **`offline.spec.ts`** — route-intercept every request; fail the test if any request leaves
   `localhost`. Mirrors `demo_gui/test_offline.py`, which already does exactly this for Streamlit
   via a patched `socket.connect`. Same contract, both floors.
5. **`projector.spec.ts`** — viewport 1024×768, walk every route, assert no horizontal scrollbar
   (`document.documentElement.scrollWidth <= clientWidth`) and screenshot each page for eyeballing.

Five tests, roughly 200 lines, ~6 h total across the project. They cover every Tier-0 risk.

### 6.2 What to skip, deliberately

- Component unit tests. 613 lines of markup; a human sees every pixel on a projector anyway.
- Snapshot tests. They will fail on every Prettier run and teach you to ignore red.
- Mocked-API tests. The failure mode here is **backend drift** — mocks actively hide it.
- Coverage thresholds. Would consume the entire remaining capacity and prevent nothing.

Node's built-in `--test` gets added for exactly one thing: Phase 3 coordinate transforms (§3.4).

### 6.3 When tests run

Before every commit to `main`, and at every phase boundary. Full suite is under a minute.

### 6.4 CI — 30 minutes, do it in week 1

There is no `.github/` in this repo. One workflow running `npm run lint`, `npm run build`, and
`npx playwright test` on push protects the Tier-0 "build is green" rule without any discipline.
Extend the `Makefile` `test` target to match so local and CI cannot diverge:

```make
test:
	python3 -m pytest backend/test_api.py demo_gui -q
	cd frontend && npm run lint && npm run build && npx playwright test
```

Note `demo_gui` joins the default test target — that is the floor being defended automatically (§7).

### 6.5 Offline-bundle verification procedure (Phase 9, run it at least twice)

The frontend is currently clean and must stay that way. Verified while reading: no `next/font`,
no `fonts.googleapis.com`, no CDN URLs, no external map tiles (the maplibre style is a bare
background layer with no sources), maplibre CSS imported from `node_modules`, lucide icons bundled
as JS, Recharts SVG-only. **Do not regress this.** The Tailwind config names `Inter` and
`IBM Plex Mono` but nothing loads them, so they fall back to system fonts — that is safe, but if
anyone ever "fixes" it with a Google Fonts link the offline guarantee dies silently.

Procedure:

1. `npm run build && npm run start` (production build — dev mode masks bundling errors).
2. **Physically disable Wi-Fi and unplug Ethernet.** Not devtools offline mode — the real thing.
3. Walk every route: `/workspace`, `/resolution`, `/sar`, `/executions`, `/system`. Perform a full
   upload → question → answer cycle.
4. DevTools → Network, filtered to third-party. **Expected count: zero.** Any non-localhost request
   is a Tier-0 blocker.
5. `grep -rn "https://\|http://" frontend/app frontend/components frontend/lib` — only
   `NEXT_PUBLIC_API_URL` and its localhost default may appear.
6. Run `offline.spec.ts` (§6.1) as the automated backstop.
7. Confirm `node_modules` is present in the bundle *or* that `npm ci` works from a local cache —
   a frontend that cannot be rebuilt at the venue is a frontend that cannot be fixed at the venue.
8. Repeat on the **actual demo machine**, not the dev laptop.

---

## 7. Streamlit fallback policy — the floor

**Status: `demo_gui/app.py` is 576 lines with 1,100 lines of tests around it
(`test_golden_path.py`, `test_offline.py`, `test_failure_paths.py`, `test_sar_tab.py`,
`test_robustness_tab.py`, `test_capability_status.py`, `test_golden_assets.py`). It is the
best-tested UI in the repository by a wide margin.** Treat that as an asset, not as legacy.

**Policy:**

1. **Never deleted, never refactored, never "migrated".** No shared-code extraction between
   Streamlit and Next.js, ever. Coupling them means a Next.js change can break the floor, which
   defeats the entire point of having one.
2. **Verified weekly, every Friday, automatically.** `python3 -m pytest demo_gui -q` joins the
   Makefile `test` target (§6.4) and CI. A green floor is then a property of the repo, not of
   someone remembering.
3. **Manually run at every phase boundary** (~5 min): `streamlit run demo_gui/app.py`, ask the golden
   question, check the answer, the cached/live badge, and Verify trace. Automated tests do not catch
   a Streamlit version bump that renders a blank page.
4. **Owner: a non-build team member.** This is the single best hand-off available — it is a written
   checklist requiring zero code. Track B owns *fixing* a red floor (it is Tier 0); a pitch-track
   member owns *running the check* and reporting. Name that person in week 1. Recovers ~10 h of
   Track B capacity and gives a pitch person genuine ownership.
5. **The floor only goes up — only in the truthful direction.** The one change permitted to
   `app.py` this cycle: its `AVAILABLE_CAPABILITIES` / `IN_DEVELOPMENT_CAPABILITIES` tuples
   (`app.py:35–46`) are a *third* hardcoded copy of the capability list (Next.js has two more).
   Replace with a call to `orchestrator.capabilities.capabilities_status()` — the module is already
   imported at `app.py:25` and `test_capability_status.py` guards the change. ~1 h, kills a whole
   class of drift, and makes all three surfaces structurally incapable of lying. Nothing else in
   `app.py` gets touched.
6. **Demo-day decision rule, written down and rehearsed now:** if the Next.js app misbehaves during
   the demo, switch to Streamlit within 30 seconds. Both run simultaneously on the demo machine
   (ports 3000 and 8501) with both browser tabs pre-opened. Rehearse the switch in Phase 10 — a
   fallback nobody has practised is not a fallback.
7. **Freeze `app.py` from 24 Nov.** After that it is a museum piece that must boot, nothing more.

---

## 8. Accessibility and demo robustness

The judge is watching a projector, possibly a bad one, from several metres away, in a bright room.
Everything below is a *demo-success* requirement that happens to also be accessibility.

### 8.1 What is already good — preserve it

`role="alert"` on error states, `aria-live="polite"` on `AnalysisResult`, `aria-expanded` on
`TraceDrawer`, `aria-label` on the primary nav and icon-only buttons, a real `<label htmlFor>` on
the question field, focus rings (`focus:ring-2 focus:ring-accent`), semantic `<table>` in
`ResolutionTable`. Do not lose these in refactors — `refusal.spec.ts` and `golden.spec.ts` should
assert against roles, not CSS classes, so a11y regressions fail the build.

### 8.2 What to fix

**Font sizes.** The codebase uses `text-[10px]` (11 occurrences) and `text-[11px]` for hashes,
timestamps, captions and metadata. At 1024×768 projected, 10 px is illegible. **Floor of 12 px for
anything a judge might read; 14 px minimum for anything you will point at.** Hashes may stay small
*if* a `shortHash` form is also shown large — `lib/utils.ts:shortHash()` already exists for this.

**Contrast.** The palette is dark-on-darker. Check the real risks against WCAG AA (4.5:1) on the
`#071019` background:
- `text-slate-500` (`#64748b`) — **fails**, and it is used for metadata everywhere.
- `text-slate-600` in `ResolutionChart` provenance and empty states — **fails badly.**
- `text-accent` `#47d7dd` and `text-success` `#55d68a` on dark — pass comfortably.
- `text-warning` `#f0ad4e` — passes, but is the degeneracy warning, so verify it specifically.
Fix: promote `slate-500` → `slate-400` and `slate-600` → `slate-500` globally. One find-and-replace,
~20 minutes, and it is the difference between a judge reading the provenance line and not.

**1024×768 projector layout.** Real risks found: the `xl:grid-cols-[minmax(0,1.45fr)_...]` workspace
split collapses below 1280 px, so the whole workspace becomes a single narrow column — verify that
reads acceptably, because it is the main demo screen. `ResolutionTable` has `min-w-[700px]` inside an
`overflow-x-auto` (fine, but the scroll affordance must be visible). `ImageryViewer` has
`min-h-[420px] lg:min-h-[600px]` — 600 px plus chrome may not fit 768 px vertically; check it.
`projector.spec.ts` (§6.1) automates the check.

**Never rely on colour alone.** `ExecutionBadge` already pairs colour with text and an icon
("LIVE INFERENCE" / "VERIFIED CACHED RESULT") — correct pattern. `DegeneracyWarning` and
`ResolutionTable` also pair. Keep this rule for every new status element, including System Status
tiles in Phase 9 (red/amber/green **plus** a word).

**Keyboard.** Every demo action reachable by Tab + Enter. If the trackpad misbehaves at the venue,
a keyboard-navigable demo still runs.

**Motion.** `animate-spin` loaders only. No page transitions, no parallax. Honour
`prefers-reduced-motion` if anything more is ever added.

### 8.3 Demo robustness

- Every failure state must be *informative*, not blank: the current
  *"No fabricated answer. {reason}"* pattern in `QueryPanel.tsx:241` is exactly right. Use it
  everywhere. Never show a spinner that can hang forever (§4.3 T3).
- `app/error.tsx` already points users at the Streamlit fallback — keep that, and verify the
  error boundary actually catches by deliberately throwing during Phase 10 rehearsal.
- Pre-warm every route before the demo (Turbopack dev compiles on first visit; use
  `npm run start` against a production build on demo day, never `npm run dev`).

---

## 9. Defects found while reading the code

Listed because each is cheap and each is a live risk, not a style opinion.

**D1 — fabricated geolocation, shipping today (Tier 0, ~30 min).**
`components/imagery/ImageryViewer.tsx` centres the map at `[72.88, 19.08]`, pins the golden scene to
`[[72.82, 19.14], [72.94, 19.14], [72.94, 19.02], [72.82, 19.02]]`, and prints **"19.08° N / 72.88° E"**
as the scene location. Those are Mumbai coordinates. The scene is `loveda_LoveDA_images_png_0_gsd0.3`
— LoveDA imagery is from Nanjing, Changzhou and Wuhan, China. The backend returns no location at all
(`SceneUploadResponse.location` is pinned to `None` *on purpose*). **The UI is displaying an invented
geographic fact to judges**, which violates the zero-fabrication rule as directly as a fake confidence
number would. Fix in week 1: drop the coordinate readout, render ungeoreferenced scenes as a plain
pan/zoom `<img>`, and keep maplibre only for scenes that actually carry georeferencing.

**D2 — real provenance discarded.** `AnalysisResponse.notice` is typed in `lib/types.ts:636` and
returned by every backend path (e.g. *"Live inference unavailable (no CUDA GPU); showing the exact
committed result for this scene and question."*) — and **no component renders it**. Meanwhile
`AnalysisResult.tsx:188` renders the dead placeholder *"Confidence calibration pending"*. The UI is
showing a placeholder where it has a real, honest, judge-impressing sentence available. Swap them.

**D3 — `IntegrityBadge` asserts without verifying.** It hardcodes "Hash chained" with a shield icon
and no verification behind it. A trust signal with nothing behind it is the same category of problem
as a fabricated confidence number. Wire it to `/api/traces/verify` or downgrade the wording.

**D4 — chart clipping risk.** `ResolutionChart.tsx:397` hardcodes `YAxis domain={[0, 0.6]}`. If
Phase 7's new ladder numbers exceed 60 %, the headline differentiator silently clips in front of
ISRO judges. Compute the domain from the data with headroom.

**D5 — brittle image-failure detection.** `ImageryViewer.tsx:326` detects a failed scene load with
`String(event.error?.message ?? "").includes("image")`. That is a string match against a library's
internal error text and will break on any maplibre bump. A plain `<img onError>` (per D1) removes
the problem entirely.

**D6 — `analyzeGolden()` hardcodes `sensor: "LoveDA"`** alongside the scene id. Note that
`orchestrator/planner.py` treats `sensor: "sar"` as a *refusal* trigger
(*"Single-image SAR interpretation is not currently supported"*) — so the sensor field is real,
load-bearing planner input that the UI currently pins to a constant. Expose it (a `<select>`, as
Streamlit already does) and Phase 1 gains a second honest-refusal demo path for free.

---

## 10. Week-one checklist (13–20 Sept)

Ordered. Stop when the week ends; do not skip ahead.

- [ ] Fix `lint`: install `eslint` + `eslint-config-next`, add `eslint.config.mjs`, `"lint": "eslint ."` — 1.5 h
- [ ] Add Prettier (`printWidth: 100`), run `npm run format` in **its own commit**, verify build — 1 h
- [ ] `npm uninstall @radix-ui/react-slot class-variance-authority` (keep `components.json`) — 0.25 h
- [ ] Install Playwright **and `npx playwright install chromium` while there is internet** — 0.5 h
- [ ] Write `e2e/golden.spec.ts` — the demo-path tripwire — 2 h
- [ ] **Fix D1** — remove the fabricated Mumbai coordinates — 0.5 h
- [ ] Add `.github/workflows/ci.yml`: lint + build + e2e + `pytest demo_gui` — 0.5 h
- [ ] Name the person who owns the weekly Streamlit floor check (§7.4) — 0 h, highest ROI in this list
- [ ] Raise §1.5 with the team: move infra to Track A, or accept a 1.5× overcommitment knowingly — 0 h

Then, and only then, start §4 (the API client) — Phase 1 blocks on it entirely.
