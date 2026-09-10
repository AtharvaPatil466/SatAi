# Phase 0 local runbook

Run commands from the repository root unless a command explicitly enters `frontend`.
The API contract is frozen; this frontend uses the existing API and exact golden fallback.

## Install and run

The repository declares **Python 3.11** in `.python-version`. The integration
and fresh-environment checks on 2026-09-10 used **Python 3.14.3**, Node **24.18.0**
and npm **11.16.0**; the frozen-commit clean-checkout reproduction on 2026-09-11
used **Python 3.14.3**, Node **v25.9.0** and npm **11.12.1**. This does not change
the declared Python version or establish a new cross-version support guarantee.

Choose the Python interpreter installed on your machine; `python3` was 3.14.3
on the verification machine. For the declared version, use `python3.11` instead.

Minimal API, uploads, planning, exact cached demo, resolution and SAR annotations:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt pillow
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Pillow is necessary because the API imports PIL at startup. It is currently
listed in root `requirements.txt`, not `backend/requirements.txt`; the explicit
`pillow` above resolves the minimal-install gap without installing the scientific stack.

For **full project tests, Streamlit, scientific processing and model dependencies**,
install the root requirements into the **same** virtual environment; the full
test suite requires both requirement files:

```sh
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/pip install -r requirements.txt
backend/.venv/bin/python -m pytest -q  # run from the repository root so the
                                       # trace-isolation conftest.py applies
```

Clean-checkout reproduction of frozen commit
`e1c97ebe6937ecac68ce55602c795e144c04e77c` on 2026-09-11 with this combined
install produced **254 passed, 2 warnings** and a successful `npm run build`
with no code changes (observed on Python 3.14.3).

Root requirements alone do not install the API/test dependencies. Backend
requirements plus Pillow do not install the full scientific/test stack.
Dependencies are not fully pinned, so installation may resolve different versions
later. Model weights are separate: arbitrary VQA requires locally cached Qwen
weights and a CUDA GPU. Installing torch does not make an Apple GPU supported.

Frontend, in another terminal:

```sh
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/workspace`. Production:

```sh
cd frontend
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

One API origin is configured with `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`). Set it before dev startup or production build;
changing it after a build does not rewrite the browser bundle. Example for an
isolated backend:

```sh
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
```

## Frozen API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | API health, not model readiness |
| POST | /api/scenes | Multipart upload, field `file` |
| GET | /api/scenes/{scene_id}/image | Stored scene pixels |
| GET | /api/capabilities | Registered providers and capability availability |
| POST | /api/plan | Deterministic plan; no inference or trace writes |
| POST | /api/analyze | Execute or fail truthfully |
| GET | /api/traces | Persisted history loaded by this process, newest first |
| POST | /api/traces/verify | Verify the process's loaded hash chain |
| GET | /api/resolution | Committed measured resolution report |
| GET | /api/sar/{scene} | Human analyst annotation; default UI scene mumbai-coastal |
| GET | /api/sar/{scene}/image | Optional locally processed SAR render |

Both plan and analyze accept:

```json
{"scene_id":"scene_<server-generated-id>","question":"Is there a building in this image?","sensor":"UNKNOWN","capability":"single_image_vqa"}
```

`scene_id` and `question` are required. Question maximum: 2,000 characters.
Omit `capability` for automatic planning; `sensor` and `capability` may be null.
Plans report missing inputs and unavailable providers; an HTTP 200 plan is not
necessarily executable. Provider registration does not test CUDA or model weights.

Uploads accept validated PNG/JPEG bytes, maximum **20 MiB**. The server rejects
empty, corrupt, unsupported and decompression-bomb images, normalizes stored
pixels to PNG, and generates `scene_[0-9a-f]{32}`. Reported format describes the
uploaded image. Sensor, GSD, location and acquisition date are null: display
UNKNOWN / Not provided, never infer them from pixels or filenames.

| Status | Meaning |
|---|---|
| 200 | Successful response; inspect plan/verification fields |
| 201 | Scene uploaded |
| 422 | Invalid input, unknown capability, missing input, or invalid analysis scene |
| 503 | Known unavailable capability, model/timeout availability, artifact or trace unavailability |
| 502 | Execution failure or invalid model response |
| 404 | Scene/SAR image unavailable where defined by its route |
| 413 | Upload exceeds 20 MiB |
| 500 | Scene storage failure |

The frontend displays safe errors and never retains a previous answer after an
input change or failed analysis. A failure to refresh history does not turn a
successful analysis into a fabricated error or discard its returned evidence.

## Offline demonstration

1. Upload the committed PNG at
   `data/ladder/0.3/loveda_Train_Rural_images_png_0_gsd0.3.png`.
2. Confirm the returned scene ID, image, dimensions and unknown metadata.
3. Enter a question, click **Plan**, inspect steps, then **Run analysis**.
   Without the live model runtime, expect 503 and no answer or success trace.
4. Select **Use exact golden demo**, then Plan and Run analysis.
   The exact pair is `loveda_LoveDA_images_png_0_gsd0.3` /
   `Is there a building in this image?`.
5. On this Mac, expect `cached_result`, answer `Yes`, the backend notice and
   `results/qwen2.5vl-3b__ladder__rescored__20260904.json`.
6. Inspect provenance, verify the chain and open execution history.
7. Open Resolution Lab for measured artifact values and degeneracy warnings.
   Open SAR Validation for human interpretation; missing renders stay unavailable.

An uploaded copy of golden pixels has a different ID and is **not** eligible for
the cache. Other questions, grounding or multi-step requests cannot use that
fallback. Live/cached mode is always taken from the response. Golden pixels are
optional for cached analysis; the committed result artifact and writable trace
storage are required. The API forces offline model loading. Dependency
installation needs a package cache or network; the installed golden demo does not.

## Verification and persistence

Real API smoke check (creates scenes and one trace per successful analysis):

```sh
backend/.venv/bin/python scripts/verify_phase0.py
# Isolated server:
backend/.venv/bin/python scripts/verify_phase0.py --api http://127.0.0.1:8001
curl -sS -X POST http://127.0.0.1:8000/api/traces/verify
```

For an existing environment with Playwright, Chromium and Pillow installed:

```sh
python3 frontend/tests/phase0_browser.py --url http://127.0.0.1:3000 --api http://127.0.0.1:8000
```

This browser check targets the no-CUDA demo machine. It exercises real backend
503/cached success, then clearly isolated browser response fixtures for live
rendering, 502 and false verification. It requires no Playwright production
dependency and prints separate results for real and synthetic cases.

`trace.jsonl` and `data/runtime/scenes/` are ignored runtime files. Preserve
them across restarts. Use **one writer process per clone/trace file**; the lock
is process-local, not cross-process. Never run Streamlit and FastAPI writers
against the same trace simultaneously. The root pytest fixture now isolates
project tests in temporary trace files; use pytest rather than direct unittest
commands that bypass this fixture.

For restart proof, stop the backend you own, restart the same command without
changing files, and compare all `GET /api/traces` values and hashes before/after.
Then call verify. Do not write analyses during the comparison. Verification of
an already-running process alone does not re-read disk; fresh-process verification
is required to prove persistence.

## Limitations and freeze

Grounding, change_vqa and optical_sar are unavailable. No new backend architecture,
model, georeferencing, pair-upload workflow or fallback broadening is included.
Full GPU inference was not exercised on this Mac. Scientific SAR summaries are
human interpretation, not automatic classification or optical–SAR fusion.

See [verification evidence](../docs/PHASE0_VERIFICATION.md) for freeze status and
evidence. Phase 0 is frozen at commit `e1c97ebe6937ecac68ce55602c795e144c04e77c`
(`feat/phase0-frontend-integration`, parent `93b21b0`, `main` unchanged); a
clean-checkout reproduction of that commit passed end-to-end on 2026-09-11,
exercising the truthful no-CUDA path and the exact cached golden fallback.
Live CUDA inference was not reproduced and remains out of scope for Phase 0.
