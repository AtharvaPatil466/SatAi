# SatQuery AI — Threat Model (Phase 0) & Hardening Checklist (Phase 9)

Audited 13 Sep 2026 against `main` @ `93b21b0`. Backend probed live on :8000.
Deployment assumed: one rented GPU box, single node, no multi-tenancy, WiFi off for the
demo, optional public URL for remote judges. Two technical people, no maintainer after
December. Everything below is scoped to a **one-time hardening pass**, not a programme.

---

## Part A — Threat Model (one page)

| # | Threat | Likelihood | Impact | Existing mitigation (code) | Gap |
|---|---|---|---|---|---|
| 1 | **Malicious / corrupt upload** — decompression bomb, polyglot, EXIF payload, SVG-as-PNG, 500 MB file | Med (a judge will try it) | Low | `ingest_scene()` `backend/services.py:144-202`: `DecompressionBombWarning` promoted to error, PNG/JPEG allowlist on `source.format`, `verify()` then re-open-and-`load()`, canonical re-encode to PNG (drops EXIF + appended payloads), atomic temp+`replace()`, `uuid4` filename so no user string reaches a path; 20 MiB cap at `backend/routes/analyze.py:34`. Verified live: junk → 422, SVG renamed `.png` → 422, 21 MiB → 413, filename `../../../../etc/evil.png` → stored under `scene_<uuid4>.png`, metadata `evil.png` | **None on validation.** Gap is *volume*, not content — see #4 |
| 2 | **Venue network failure / WiFi off** | High (it is the plan) | High — no demo | `HF_HUB_OFFLINE=1`/`TRANSFORMERS_OFFLINE=1` set before the registry import (`backend/services.py:19-20`); zero outbound HTTP anywhere in `backend/` or `orchestrator/`; maplibre style is inline, no remote tiles (`frontend/components/imagery/ImageryViewer.tsx:19`) | Never rehearsed with the interface actually down. Next/npm dev server and font loading unverified offline → checklist H1 |
| 3 | **Model crash / hang mid-question** | Med | High if unhandled | 120 s timeout (`services.py:57`, `router.py:97`); golden cached-result fallback on timeout/no-GPU/exec failure (`services.py:333-345`); every exception mapped to a sanitized 502/503 (`routes/analyze.py:73-98`) | Fallback only covers the one golden scene+question pair (`services.py:52-53`). Any other question that crashes the model returns 503 with no answer |
| 4 | **Disk pressure** | Med | High — a full disk kills inference *and* trace append | 20 MiB per-upload cap | **No auth, no rate limit, no upload count cap, no cleanup** of `data/runtime/scenes/`. ~50 requests = 1 GB. Localhost-only today; real the moment #5 happens → finding F3 |
| 5 | **Exposed public URL** | Conditional | High — everything above becomes remote | uvicorn binds 127.0.0.1 by default (Makefile has no `--host`), so exposure requires a deliberate tunnel/flag. CORS rejects non-local origins (verified: `evil.example.com`, `localhost:3000.evil.com` → no ACAO header) | **No authentication on any endpoint.** CORS is not a control — `curl` ignores it. Requires the conditional access-control item → checklist H4 |
| 6 | **Curious or hostile judge poking the UI** | High | Low | Question capped at 2000 chars (`schemas.py:12`); unknown capability → 422; no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in `frontend/`; model answer and SAR annotation render as React text children (`AnalysisResult.tsx:8`, `SarInterpretation.tsx:17`), trace as `JSON.stringify` in `<pre>`; `app/error.tsx` never renders `error.message` | Error bodies leak absolute host paths → finding F2. Serialized 1-worker inference queue makes the demo trivially stallable → finding F3 |
| 7 | **Self-inflicted damage** — teammate deletes/moves an artifact mid-demo | Med (highest real risk here) | High | `load_results()` is `@lru_cache(maxsize=1)` so a delete after first read is survivable in-process; missing artifact → 503, not a crash | `uvicorn --reload` in the Makefile restarts the process on **any** file touch, which drops the lru_cache and re-reads a now-missing file mid-answer. And the resulting 503 prints the full path to the judge's screen (F2) → checklist H2, H3 |
| 8 | **Tampered / disputed audit ledger** | Low | Med — provenance is a scored claim | Hash-chained append-only ledger, fails closed on load (`orchestrator/trace.py:33-90`). Verified today: naive field edit → `TraceIntegrityError: Record 1 hash mismatch` | Tamper-**evident**, not tamper-**proof** → finding F4 |

Out of scope by decision, restated so it is not re-litigated in December: formal CSP
authoring programme, recurring pen-test cadence, security review board.

---

## Part B — Ranked findings

Severity is judged against **this** deployment (one box, one-time demo), not a
production SaaS. Nothing here is inflated; two items are explicitly latent.

### F1 — `_slug()` path traversal in the SAR render route — **HIGH (latent, not reachable today)**

`backend/services.py:406`
```python
def _slug(value: str) -> str:
    return "-".join(value.lower().replace("–", "-").split())
```
Lowercases and collapses whitespace. It does **not** strip `/`, `\` or `..`.
Confirmed: `_slug('../../etc/passwd')` → `'../../etc/passwd'`, verbatim.
`sar_render_path()` (`services.py:456-459`) feeds that straight into
`SAR_RENDER_DIR / f"{key.replace('-','_')}.png"` with no membership check.

Reachability today: blocked **incidentally**, by Starlette's `{scene}` path converter
refusing to match `/`. Verified live — `GET /api/sar/%2e%2e%2f%2e%2e%2fREADME/image`
returns the router-level `{"detail":"Not Found"}`, so the handler never runs.

Trigger conditions that activate it: changing the route to `{scene:path}`; adding any
new caller that passes an unconstrained string to `sar_render_path()`; or fronting the
app with a proxy that normalises `%2f` before uvicorn. Activated impact: arbitrary
`.png` read anywhere on the box.

Note the inconsistency: `local_scene_image()` (`services.py:129-141`) — same file, same
job — checks `/`, `\`, `..` **and** a `scene_[0-9a-f]{32}` regex. One path is careful,
the other leans on the router. Fix `_slug`'s caller the way `local_scene_image` already
does — validate against the known set rather than sanitising the string:

```python
SAR_SCENE_KEYS = frozenset({"mumbai-coastal", ...})   # or: set(sections)

def sar_render_path(scene: str) -> Path | None:
    key = {"mumbai": "mumbai-coastal"}.get(_slug(scene), _slug(scene))
    if key not in SAR_SCENE_KEYS:
        return None
    ...
```
An allowlist cannot be defeated by encoding tricks; a sanitiser can. `sar_annotation()`
is already effectively safe because its key must exist in the parsed markdown sections
(`services.py:419-421`) — `sar_render_path()` is the one with no gate.

### F2 — Absolute filesystem paths leaked in error responses — **MEDIUM (reachable today)**

`backend/routes/resolution.py:12` and `backend/routes/sar.py:14` both return
`detail=str(exc)`, and the `ArtifactError` messages interpolate the underlying `OSError`.
Verified by exercising the real functions against a missing file:
```
RESOLUTION 503 detail: Required resolution artifact is unavailable:
  [Errno 2] No such file or directory: '/Users/atharva/SIH/results/definitely_missing.json'
SAR 404 detail:        SAR analyst annotation is unavailable:
  [Errno 2] No such file or directory: '/Users/atharva/SIH/data/sar_gate/missing.md'
```
`frontend/lib/api.ts:13` puts `body.detail` straight into the thrown `Error`, so this
reaches the judge's screen. This is exactly threat #7 and #5 meeting: it fires precisely
when something has gone wrong on stage. It also contradicts the plan's own "sanitized
public errors" decision and the pattern `routes/analyze.py:73-98` already applies —
`backend/test_api.py` has tests (`test_generic_model_exception_returns_sanitized_502`,
`test_unexpected_service_exception_returns_sanitized_502`) asserting paths are redacted
on `/analyze`, and those two routes were simply missed.

Fix: constant strings in the two handlers, exception detail to the server log only.

### F3 — No auth + unbounded uploads + single-worker inference queue — **MEDIUM if publicly exposed, LOW on localhost**

No authentication exists on any endpoint. Three amplifiers:
- `POST /api/scenes` (`routes/analyze.py:32`) writes a file per call with no count cap,
  no rate limit and no cleanup of `data/runtime/scenes/`.
- `_INFERENCE_EXECUTOR = ThreadPoolExecutor(max_workers=1)` (`router.py:14`) serialises
  all inference; each caller waits up to 120 s (`router.py:97`).
- The abandon `Event` is only checked *before* inference starts (`router.py:29-32`), so
  a timed-out request does not free the GPU — it just stops being waited on. Queued
  requests therefore accumulate.

Ten concurrent `/api/analyze` calls stall the demo for minutes; a loop on `/api/scenes`
fills the disk. Localhost-only this is a non-issue. It is the whole risk of exposure.

### F4 — Audit ledger is tamper-evident, not tamper-proof — **MEDIUM (accuracy of a scored claim)**

Empirically established today against a scratchpad copy of `trace.jsonl` (repo file
untouched and byte-identical afterwards):

| Test | Result |
|---|---|
| baseline | `(True, 'Chain verified (18 records)')` |
| edit one field in record 1 | `TraceIntegrityError: Record 1 hash mismatch` — **fails closed, as claimed** |
| rewrite every record and recompute the whole chain | `(True, 'Chain verified (18 records)')` — **forged history verifies clean** |
| corrupt the file on disk *after* the process loaded it | `(True, ...)` — verifies memory, not disk |

What it **does** guarantee: no record can be altered, deleted or reordered *in place*
without detection; the chain survives restart because `_ensure_loaded()` re-verifies from
disk (`trace.py:53-90`) and refuses to serve anything on failure (`routes/traces.py:17`).
That is a real and demoable integrity property.

What it does **not** guarantee:
1. **Authenticity.** `_record_hash` (`trace.py:20-22`) is plain SHA-256 over content +
   prev_hash, with no secret. Anyone who can write `trace.jsonl` can rebuild a fully
   valid chain around whatever history they prefer. `hmac.compare_digest` is used for
   *comparison* only (`trace.py:44,47`) — there is no keyed MAC.
2. **Freshness.** `_ensure_loaded()` short-circuits on `_LOADED_PATH == path`, so
   `POST /api/traces/verify` after startup re-verifies the in-memory list. Post-startup
   on-disk tampering is invisible until restart.
3. **Existence.** `trace.jsonl` is gitignored (`.gitignore:7`), so nothing anchors the
   chain head outside the box. A deleted ledger verifies clean as "0 records".

Say "tamper-evident, fails closed" when demoing it — not "tamper-proof". Cheap upgrade
if a judge presses: screenshot the head `record_hash` before the demo (checklist H8).
HMAC with a key would be the real fix and is **not** worth it here — the key would have
to live on the same box as the ledger.

### F5 — CORS `allow_origin_regex` accepts any local origin — **LOW**

`backend/main.py:16`: `r"https?://(localhost|127\.0\.0\.1):\d+"` alongside the explicit
localhost:3000 allowlist. Starlette uses `fullmatch`, confirmed live — `http://localhost:3000.evil.com`
and `http://attacker-localhost:3000` get no ACAO header; `https://127.0.0.1:9999` and
`http://localhost:1` do (including on the `OPTIONS /api/analyze` preflight).

If the box is publicly exposed this changes nothing: an attacker's `curl` never consults
CORS, and `allow_credentials=False` means there is no ambient session to steal. The
regex's only effect is letting any page served from any local port read API responses —
irrelevant on a dedicated demo box. Tighten it (H5) because it is a two-line change, not
because it is dangerous. It would become a genuine issue only if authentication were
added later, which it will not be.

### F6 — `accelerate 1.14.0` path traversal, no fix published — **LOW (not reachable from any API input)**

CVE-2026-69112 / PYSEC-2026-3804: `load_checkpoint_in_model` / `load_checkpoint_and_dispatch`
do not sanitise `weight_map` entries from a sharded checkpoint index, allowing `../`
reads or a named-pipe hang. Reached via `device_map="auto"` in
`models/qwen_vl/model.py:38-42`. Exploiting it requires **controlling the checkpoint
index on disk** — i.e. already having write access to the box. `HF_HUB_OFFLINE=1` /
`TRANSFORMERS_OFFLINE=1` (`services.py:19-20`) additionally stop a fresh, possibly
tampered checkpoint being pulled at demo time. No fix version exists, so there is nothing
to upgrade to. Accept, document, move on.

### F7 — Dependency pin drift — **LOW (reproducibility, not a vulnerability)**

`backend/requirements.txt` pins `python-multipart==0.0.22`; the venv has `0.0.32`. It
says `transformers>=4.49`; the venv has `5.16.1` — a major-version jump away from what
the code was written against. The demo runs on the venv, not the file, so this is a
"rebuild the box and it behaves differently" risk. Freeze it (H6).

### F8 — Reflected user input in a JSON error body — **LOW (note only, not XSS)**

`sar_annotation()` echoes the raw scene string: verified,
`GET /api/sar/nonexistent` → `{"detail":"No analyst annotation exists for SAR scene 'nonexistent'."}`.
Content-type is `application/json`, React escapes it on render, and there is no
`dangerouslySetInnerHTML` anywhere in the frontend. Not exploitable. Recorded so a
future reader does not have to re-derive that conclusion.

### Confirmed clean — no action

- **`ingest_scene()`**: the established reading is correct, and every claim held under
  live probing (see threat #1). Best-built code in the repo; do not touch it.
- **Unsafe deserialisation**: none. `eval/smoke.py:80` uses `torch.load(..., weights_only=True)`;
  `eval/smoke.py:34` and `scripts/train.py:21` use `yaml.safe_load`. No `pickle`, no
  `marshal`, no `trust_remote_code`. None of it is on the request path.
- **SSRF**: none. No outbound request is constructed anywhere in `backend/` or
  `orchestrator/`. `urllib`/`subprocess` appear only in offline dataset-prep scripts
  (`data/download_ladder_data.py`, `eval/suites/rsvqa.py`) that are not imported by the API.
- **Unsanitised model output rendered as HTML**: none, per threat #6.
- **Command injection**: no `shell=True`, no `os.system` anywhere.
- **Credential handling**: Earthdata creds are read from `~/.netrc` outside the repo
  (`data/sar_gate/order_scenes.py:49-64`), never stored in-tree.

### Scan results

**Secrets — CLEAN.** Tracked files: zero hits for `api_key|secret|token|password|bearer|
private_key|client_secret` assignments, and zero for provider-token shapes
(`sk-`, `ghp_`, `AKIA`, `xox[baprs]-`, `hf_`, `eyJ`). Git history, all 79 commits
(`git log -p --all`): zero real secrets — every hit is a test fixture *asserting*
redaction (`assert "secret-token" not in response.text`), a placeholder
(`password YOUR_PASSWORD`), or a since-removed decorative login form. No `.env`, `.pem`,
`.key` or credential file has ever been committed; only `frontend/.env.example`
(`NEXT_PUBLIC_API_URL=http://localhost:8000`) is tracked. Built `.next` bundle: clean —
the only `process.env` reference in application code is `NEXT_PUBLIC_API_URL`
(`frontend/lib/api.ts:3`). External hostnames present in the bundle are vendor doc-strings
inside library code, not runtime fetches.

**Dependencies — one item worth knowing, the rest is noise.**
- `npm audit` in `frontend/`: **0 vulnerabilities**, all severities.
- `pip-audit` (installed into `backend/.venv`): 15 findings across 3 packages, 8 unique.
  - `accelerate 1.14.0` — 1 finding, the only one in the runtime dependency chain → F6, LOW, no fix available.
  - `pip 24.2` — 7 findings (CVE-2025-8869, CVE-2026-1703, -3219, -6357, -8643, -13346).
    Every one is **install-time only** and needs a malicious wheel or a malicious package
    index. Nothing is installed during the demo. **Noise for this deployment**; upgrade
    pip anyway before the freeze since it costs one command (H6).
  - `pytest 8.4.2` — 1 finding (CVE-2025-71176), local `/tmp/pytest-of-{user}` DoS.
    Test-time only, not on the demo path. **Noise.**
- `pip list --outdated`: 16 packages behind, all minor. Nothing security-relevant beyond
  the above. **Do not chase these** — upgrading `transformers` or `torch` three months
  before a finale is a larger risk than any CVE listed here.

---

## Part C — Phase 9 hardening checklist

Every item has a command or procedure that verifies it. Run the whole list once, in
order, before the code freeze. Tick means *verified*, not *intended*.

### Code changes (do these first — they are the only ones that alter behaviour)

- [ ] **H1. Sanitise the two leaking error handlers.** (fixes F2)
  Replace `detail=str(exc)` with a constant in `backend/routes/resolution.py:12` and
  `backend/routes/sar.py:14`; log the exception server-side.
  *Verify:* temporarily rename `results/qwen2.5vl-3b__ladder__rescored__20260904.json`, then
  `curl -s localhost:8000/api/resolution | grep -c '/Users/'` → must print `0`. Rename it back.

- [ ] **H2. Allowlist the SAR scene key.** (fixes F1)
  Gate `sar_render_path()` on a known-key set, as in F1. Do not try to sanitise the string.
  *Verify:* `backend/.venv/bin/python -c "import sys;sys.path.insert(0,'.');from backend.services import sar_render_path;print(sar_render_path('../../README'))"` → must print `None`.
  Then `curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/api/sar/mumbai/image` → still `200`.

- [ ] **H3. Add a regression test for each.** Two tests in `backend/test_api.py`, next to
  the existing `test_unexpected_service_exception_returns_sanitized_502`: one asserting
  no `/Users/` in a 503 body, one asserting a traversal scene returns 404/None.
  *Verify:* `backend/.venv/bin/python -m pytest backend/test_api.py -q` → all pass.

### Conditional — **only if the demo is served on a public URL**

- [ ] **H4. Put access control in front of the app.** Skip this entire item if the demo
  stays on localhost. Pick exactly one, whichever is faster on the day:
  - *IP allowlist* (preferred if the judges' egress IP is known in advance) — at the
    tunnel/reverse-proxy layer, not in application code.
  - *Shared credential* — HTTP Basic on the reverse proxy, one password, rotated to a
    throwaway value for the event, given to judges verbally. Never commit it; never put
    it in the frontend bundle.

  Do **not** implement auth inside FastAPI: it is new untested code on the critical path
  three months before a finale, and it would not cover the Next.js server anyway.
  *Verify:* from a device **not** on the allowlist / without the credential,
  `curl -s -o /dev/null -w '%{http_code}\n' https://<public-url>/api/health` → `401` or `403`.
  Then confirm `200` from an allowed device.

- [ ] **H5. Add basic response headers + tighten CORS** (only meaningful once exposed; F5)
  Set `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY` at the proxy. Drop `allow_origin_regex` from `backend/main.py:16`
  and keep the explicit `allow_origins` list.
  *Verify:* `curl -sI https://<public-url>/api/health | grep -ci nosniff` → `1`; and
  `curl -s -i -H 'Origin: http://localhost:9999' <url>/api/health | grep -ci access-control-allow-origin` → `0`.

- [ ] **H6. Cap upload volume.** (mitigates F3) Simplest sufficient guard: refuse
  `POST /api/scenes` once `data/runtime/scenes/` holds more than N files or M total bytes.
  One check at the top of the handler; no rate-limit library.
  *Verify:* loop 60 uploads of a valid small PNG; the last must return a 4xx, and
  `du -sh data/runtime/scenes` must stay bounded.

### Freeze and environment (run once, immediately before the freeze)

- [ ] **H7. One dependency vulnerability scan, recorded.** This is the single scan the
  plan budgets for — this document *is* its first run; re-run it at freeze.
  *Verify:* `backend/.venv/bin/pip-audit --desc > scratch/pip-audit-freeze.txt; cd frontend && npm audit`
  Accept `accelerate` (F6, no fix exists) and the pip/pytest findings (install- and
  test-time only) in writing. Do not upgrade `torch` or `transformers`.

- [ ] **H8. Pin the environment to what actually runs.**
  *Verify:* `backend/.venv/bin/pip freeze > backend/requirements.lock.txt`, then
  `diff <(grep -oE '^[a-zA-Z0-9_.-]+' backend/requirements.txt | sort) <(grep -oE '^[a-zA-Z0-9_.-]+' backend/requirements.lock.txt | sort)`
  — confirm the `python-multipart` and `transformers` drift (F7) is resolved or explicitly accepted.
  Then `backend/.venv/bin/pip install --upgrade pip` and re-run H7.

- [ ] **H9. Drop `--reload` from the demo run command.** (threat #7) The Makefile's
  `uvicorn --reload` restarts the server on any file touch — a teammate saving a file
  mid-answer drops the process and the `load_results` cache.
  *Verify:* start with `backend/.venv/bin/uvicorn backend.main:app --port 8000` (no `--reload`),
  `touch backend/services.py`, confirm the server does not restart, then confirm
  `curl -s localhost:8000/api/health` still returns `ready`.

- [ ] **H10. Confirm the bind address is deliberate.**
  *Verify:* `lsof -nP -iTCP:8000 -sTCP:LISTEN` and `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
  Expect `127.0.0.1` unless H4 is done. If either shows `*:` / `0.0.0.0`, H4 is mandatory.

- [ ] **H11. Secrets stay out of Git, logs and the bundle.**
  *Verify:* `git ls-files | grep -iE '\.env$|\.pem$|\.key$|credential|secret'` → empty
  (`frontend/.env.example` is the only permitted `.env*`); and
  `grep -rIE 'AKIA[0-9A-Z]{16}|ghp_|hf_[A-Za-z0-9]{30}|sk-[A-Za-z0-9]{20}' frontend/.next` → no hits.
  Confirm `~/.netrc` is `chmod 600` and is **not** inside the repo.

### Demo-day rehearsal (the highest-value items on this list)

- [ ] **H12. Full offline rehearsal.** Turn WiFi **off**, restart both processes, run the
  complete demo script end to end: analyze, resolution, SAR, executions, trace verify.
  *Verify:* browser devtools Network tab shows zero requests to any non-localhost host.
  This is the single most likely thing to lose the demo (threat #2) and the only way to
  find it is to actually do it.

- [ ] **H13. Hostile-judge dry run.** One teammate spends ten minutes trying to break the
  UI: 2000-char question, emoji, SQL/HTML/script payloads in the question box, rapid
  repeat submissions, a 30 MB file, a `.exe` renamed `.png`, browser back/refresh
  mid-answer.
  *Verify:* no stack trace, no raw path, no blank screen reaches the browser. Anything
  that does, fix or hide before the freeze.

- [ ] **H14. Record the ledger head hash.** (mitigates F4's non-guarantees)
  *Verify:* `tail -1 trace.jsonl | python3 -c "import json,sys;print(json.load(sys.stdin)['record_hash'])"`
  — screenshot it, and note the record count. If a judge questions provenance, that
  screenshot plus a live `POST /api/traces/verify` is the demonstration. Also take one
  known-good backup: `cp trace.jsonl trace.jsonl.frozen`.

- [ ] **H15. Back up the artifacts a teammate could delete.** (threat #7)
  *Verify:* copy `results/`, `data/sar_gate/annotation_template.md`, `data/ladder/0.3/`,
  and `trace.jsonl` to a USB stick and to a second directory on the box; confirm the
  restore procedure by actually restoring one file. Two minutes, and it covers the
  highest-likelihood catastrophic threat in the table.

### Explicitly not doing

CSP authoring, recurring pen-tests, a review board, FastAPI-level authentication, HMAC
keying of the trace ledger, chasing the 16 outdated packages, and any dependency upgrade
of `torch`/`transformers`. Each costs more risk than it removes for a one-off demo that
nobody maintains after December.
