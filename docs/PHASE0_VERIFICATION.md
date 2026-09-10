# Phase 0 integration verification — 2026-09-10

## Result

**PARTIAL: frontend integration implemented and reproduced; original runtime audit
recovery complete (see "Runtime trace recovery" below); committed freeze still
pending final Git authorization.**

Branch: `feat/phase0-frontend-integration`.
HEAD and main remain `93b21b0ed5ee02b9ff8bda5a568d2fb15cbde6fe`.
Changes are intentionally uncommitted. No backend runtime/API, model, dependency
manifest, Python declaration, or fallback-rule changes were made.

Implemented real upload → plan → analyze, image retrieval, editable questions,
structured plans, safe errors, cached/live distinction, provenance, history,
verification, API-backed capability labels, and truthful imagery metadata.
Native images replace unsupported map coordinates. Local React state replaces
golden-only wiring; no new application dependencies or state architecture.

## Verified results

| Check | Evidence |
|---|---|
| Gate A unknown capability | 422: `Unknown capability: banana_mode` |
| Gate A unavailable grounding | 503: `Required capability is not currently available.` |
| Gate A nonexistent scene | 422: `No local scene pixels or exact committed result match this scene and question. No answer was generated.` |
| Gate A missing question | 422, validation array with `body.question: Field required` |
| Gate A trace invariance | All five records identical after each request |
| Gate A verification | `{"verified":true,"message":"Chain verified (5 records)"}` |
| PNG and JPEG uploads | 201, generated IDs, 1024 × 1024, four null metadata fields |
| Image retrieval | 200; decoded pixels match uploaded image, including JPEG decoding |
| Planning | 200; single VQA step; no trace mutation |
| Uploaded inference | Real 503, no answer or success trace |
| Exact golden analysis | 200, `Yes`, `cached_result`, exact committed prediction checked |
| Success trace | Exactly one new linked record per successful API/browser analysis |
| Browser integration | Upload, image, editable question, plan, 503, cached success, trace, verification passed |
| Browser invalid states | Unavailable grounding, missing second scene, invalid question, bad file type, network failure passed |
| Isolated UI fixtures | 502 sanitization, FastAPI validation array, 503, live rendering, `verified:false` passed |
| Other pages | Persisted history, measured resolution, human SAR annotation, capabilities passed |
| Layout | Desktop screenshot inspected; mobile viewport has no horizontal overflow |
| Final scientific labels | No static “Offline ready”; SAR label/interpretation hidden when human validation is false |
| Full regression, integration clone | **254 passed, 2 warnings**, after test isolation; runtime bytes unchanged |
| Full regression, fresh environment | **254 passed, 2 warnings**, after test isolation |
| Final production builds | Passed in both clones |
| Fresh minimal installation | Backend requirements + Pillow; startup and API smoke passed |
| Fresh full installation | Added root requirements; full regression passed |
| Development startup | Next dev started on 3003 |
| Restart, isolated server | Six complete records unchanged; uploaded image still 200; chain verified |
| Backend contract freeze | Runtime source, schemas, requirements and model code unchanged |

Sample real upload:

```json
{"scene_id":"scene_a957edb2cea84de9b9086186b54e49de","filename":"scene.png","format":"PNG","width":1024,"height":1024,"sensor":null,"gsd":null,"location":null,"acquisition_date":null}
```

Plan provenance: `phase0-rules-v1`, execution plan `phase0-plan-v1`,
`single_image_vqa`, provider `qwen2.5vl-3b`, one `step_1`.
Explicit API checks used `explicit_capability`; the automatic browser path used
`default_single_image_vqa`.

Cached source: `results/qwen2.5vl-3b__ladder__rescored__20260904.json`.
Backend notice: “Live inference unavailable (no CUDA GPU); showing the exact
committed result for this scene and question.”

Live GPU inference and real 502 generation were not exercised. Their UI paths
were tested with isolated browser responses, never production fallback data.

## Runtime trace discrepancy — do not overlook

The initial Gate A five-record chain was valid. During subsequent verification,
the pre-existing Streamlit failure/offline tests appended four cached-demo
records to the real `trace.jsonl`. The running API held an earlier in-memory
chain and subsequent successful API/browser calls appended from that earlier
tip. This verification run therefore encountered and triggered an existing
test-isolation/multiple-writer flaw.

The original clone now has **12 persisted records**, and a fresh process reports:

```text
orchestrator.trace.TraceIntegrityError: Record 10 has an invalid prev_hash
```

The existing port-8000 API still reports a valid **eight-record in-memory**
chain. That is not proof of disk integrity. No further analysis writes were
sent there after discovering the divergence. Its process was not restarted,
and no runtime record was removed, rewritten, rehashed or silently repaired.

Preserved file SHA-256:
`b199858bfc82d1881105ea9242a51a03fc2cc2b54ccebbe773ab75059287a123`.

A read-only recovery check matched the API's eight records exactly to disk lines
**1–5 and 10–12**. In that order, the original records and hashes verify as
`Chain verified (8 records)`. Lines 6–9 are the separate test-written branch.
Recovery can therefore preserve the mixed file as an archive and restore the
eight-record API chain without changing any record/hash, but this has not been
performed or authorized as a runtime-history replacement.

Smallest prevention fix: root `conftest.py` gives each pytest test an isolated
trace path and in-memory state. This covers both Streamlit writes and trace-test
setup reads. Full regression now passes even with the original file preserved;
a before/after byte assertion confirmed it is unchanged. Direct unittest
invocation bypasses this fixture.

The temporary reproduction clone has a separate, valid six-record chain.
Two records came from real API/browser demos; four were added by its first
regression run before isolation was fixed. Subsequent tests left it unchanged.
A quiet restart after regression compared every record value and hash:

```json
{"verified":true,"message":"Chain verified (6 records)"}
```

Restart tip:
`7caeeb348868b58a177a39f7bc322951d4b390a35847a5dd2966262b4d86ea47`.

## Reproduction and commands

Environment: macOS, Python 3.14.3, Node 24.18.0, npm 11.16.0.
Declared Python 3.11 was preserved; a fresh Python 3.11 environment was not tested.

Initial checks ran in `/Users/soham/hackatons /sih2026-clean-phase0`:

```sh
pwd
git status --short
git branch --show-current
git rev-parse HEAD
curl -sS -i --max-time 10 http://127.0.0.1:8000/api/health
git checkout -b feat/phase0-frontend-integration
backend/.venv/bin/python -m pytest -q
backend/.venv/bin/python scripts/verify_phase0.py
python3 frontend/tests/phase0_browser.py
git diff --check
git rev-parse main
```

Initial sandbox health requests could not connect; the same check outside the
network sandbox returned 200. The server was already running.

Fresh reproduction used `/tmp/satquery-phase0-repro.KrMju9`, a local
`git clone --no-hardlinks` of the baseline with the final integration patch
and new files applied. No environment, node_modules, uploads or trace file was
copied from the original clone.

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt pillow
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8001
backend/.venv/bin/python scripts/verify_phase0.py --api http://127.0.0.1:8001
backend/.venv/bin/pip install -r requirements.txt
backend/.venv/bin/python -m pytest -q
```

Frontend commands inside that clone's `frontend`:

```sh
npm ci
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev -- --hostname 127.0.0.1 --port 3003
```

Browser check from the reproduction root:

```sh
python3 frontend/tests/phase0_browser.py --url http://127.0.0.1:3002 --api http://127.0.0.1:8001
```

The installed headless Playwright browser was used because the in-app browser
had no connected browser. Synthetic responses exist only in the test harness.

Only owned test-server PIDs were stopped for restart/rebuild. The quiet restart
stopped isolated backend PID 31378 and launched the same command as PID 31862.
Full JSON histories were compared by value, ignoring object-key order.

## Handoff and exit criteria

All frontend behavior, scientific-label, regression, install, API-contract and
isolated persistence checks above pass. There are two remaining freeze conditions:

- Recover/archive the original mixed runtime trace with an explicitly chosen
  data-preservation procedure, then verify its replacement or recovered chain
  in a fresh process. Do not invent a new authentic history by rehashing records.
- Review and authorize the final Git action. No commit/push was requested.
  Reproduction currently proves baseline plus reviewed patch, not a clean
  checkout of a final committed integration revision.

The working tree is understood: frontend integration, runbooks, two smoke-check
scripts, and the test-isolation fixture. Runtime images/traces remain ignored.
Main history and the backend API architecture are unchanged.

Next engineering task: preserve and resolve the original runtime trace
divergence before freezing Phase 0. No advanced capability work should begin yet.

## Runtime trace recovery — 2026-09-10 (executed and verified)

The mixed 12-record file was archived intact and the already-verified 8-record
chain restored without changing any record content or hash. Recovery restore was
performed earlier this evening; the restart and all post-restart verification
below were executed and observed first-hand afterward.

- **Archive path (verified intact, never modified, never deleted):**
  `data/runtime/trace-archives/trace.mixed-20260910T195046-IST.sha256-b199858b.jsonl`
  - SHA-256 `b199858bfc82d1881105ea9242a51a03fc2cc2b54ccebbe773ab75059287a123`
    (matches the preserved audit hash above); 12 records; replay reproduces
    exactly `Record 10 has an invalid prev_hash` (lines 6–9 are the
    test-written branch).
- **Restored trace path:** `trace.jsonl` (repository root, gitignored)
  - Byte-identical to archive lines 1–5 + 10–12 (the API's verified 8-record
    chain); SHA-256 `871ae1a2da2f72f254793a9c37cf18c0f674b34cc99ee1153b5ae9bc2f4df5ec`;
    byte-level selection from the archive, no rehashing, no edits.
- **Final record count: 8** (`Chain verified (8 records)`).
- **Restart:** original backend PID 33375 (port 8000, this checkout) stopped via
  SIGTERM and relaunched with the identical command and working directory as
  PID 34762 (20:50:30 IST, detached). The unrelated port-8001 process
  (PID 31862, `/tmp/satquery-phase0-repro.KrMju9`) was not touched.
- **Post-restart verification (all first-hand):**
  - `GET /api/traces` → `count = 8`; records identical by JSON value comparison
    to the pre-restart in-memory chain.
  - `POST /api/traces/verify` → `{"verified":true,"message":"Chain verified (8 records)"}`.
  - Restart persistence holds: the fresh process loaded the chain from disk.
  - Post-restart SHA-256 of live trace and archive unchanged (values above).
- No git commit, push, merge, rebase, reset, stash, or clean was performed;
  no files other than this documentation were modified.

Remaining freeze conditions: final Git action review/authorization for the
integration branch; then Phase 0 can be frozen.
