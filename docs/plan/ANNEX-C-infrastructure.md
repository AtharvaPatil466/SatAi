# SatQuery AI — Infrastructure & Backend Plan (Phases 1, 6, 9)

Author: Track B (infra/testing). Date: 13 Sept 2026. Horizon: 13 working weeks to SIH finale (8–15 Dec 2026).

**Everything in this document that makes a claim about current behaviour was executed against the repo on 13 Sept 2026.** Probe scripts live in the scratchpad (`probe.py`, `dbprobe.py`, `killprobe.py`, `sqlprobe.py`). Where I say "verified", there is a command output behind it. Where I am guessing, I say "unverified".

---

## 0. Executive summary — what actually needs building

| # | Item | Status today | Cost |
|---|---|---|---|
| 1 | Durable job engine (SQLite) | Does not exist. Inference off-event-loop **already exists** in `router.py`. | **14 h** |
| 2 | SHA-256 artifact integrity | Does not exist. | **3 h** |
| 3 | Hostile-input suite | **All 6 categories already reject correctly.** Needs to be *extracted into a named, re-runnable file* + 3 real gaps closed. | **4 h** |
| 4 | CI | Does not exist. Verified: the gating 169 tests run in **2.6 s** on a 6-package venv. | **2 h** |
| 5 | Phase 6 orchestration hardening | **~85 % already built and tested.** 3 real gaps, one of them a one-line unbounded-timeout fix. | **6 h** (was budgeted ~5 days) |
| 6 | Phase 9 fault injection + load + offline | Does not exist. Highest residual risk. | **16 h** |
| 7 | Docker + Compose, 2 profiles | Does not exist. | **8 h** |
| 8 | Structured logging + `/api/system/status` | Does not exist. **The System Status *screen* already exists** (`frontend/app/system/page.tsx`) and only needs a data source. | **5 h** |

**Total ≈ 58 h of Track-B infra work across 13 weeks.** That is the entire ask. Anything beyond it is elegance, and this team cannot afford elegance.

### The four things the master plan gets wrong about current state

1. **It schedules "move inference off the event loop" as Phase 1 work. It is done.** `orchestrator/router.py:14` holds a module-level `ThreadPoolExecutor(max_workers=1)` with an abandonment `Event` and a 120 s timeout, and `backend/test_api.py:636` (`test_model_timeout_bounds_request_without_success_trace`) proves the timeout path writes no success trace. The job engine must **wrap** this, not replace it.
2. **It schedules the hostile-input suite as new defensive work.** All six attack categories are already rejected — including a *real* 400-million-pixel, 389 KB PNG bomb, which I built and fired (`probe.py`). The work is packaging, not defending.
3. **It schedules "build a judge-visible System Status screen."** The screen exists and renders capability status and runtime health. It needs one backend endpoint, not a screen.
4. **It assumes `trace.jsonl` will migrate into SQLite in Phase 1.** It should not. See §1.7 — migrating it costs ~8 h, risks the one verified-working audit artifact in the project, and buys nothing a `trace_record_hash` column does not.

One thing the plan assumes exists that does **not**: any CI whatsoever. Every phase's exit criterion says "full hostile-input suite still passes," and today the only way to check that is a human remembering to type `pytest`. That is the single cheapest high-value gap in the project — **2 hours**.

---

# PHASE 1 (15–28 Sept) — Durable job engine + artifact integrity

## 1.1 The governing constraint: do not break the working synchronous path

`POST /api/analyze` works today, end to end, with a cached-result floor when the GPU is absent. It is the current demo floor. **It stays.** The job engine is added *alongside* it:

```
POST /api/analyze   (unchanged, synchronous)   ← Phase 0 floor, never removed
POST /api/jobs      (new, returns 202 + job_id)
GET  /api/jobs/{id} (new, poll)
POST /api/jobs/{id}/cancel
```

If the job engine is broken on demo day, the demo falls back to `/api/analyze`. That is the floor rule, implemented as a routing choice rather than as a promise.

## 1.2 The single most important integration fact

`orchestrator/router.py` already serialises **all** inference through one thread:

```python
# orchestrator/router.py:13-14
# ponytail: one worker protects the singleton model; process workers are needed for cancellation.
_INFERENCE_EXECUTOR = ThreadPoolExecutor(max_workers=1)
```

The GPU model is a process-singleton (`orchestrator/registry.py:29`, `QwenVLModel` lazily loads weights on first `infer`). **One worker is already the correct and enforced concurrency limit.**

Therefore the job worker is **one daemon thread** that calls the existing `backend.services.analyze_scene()` unchanged. It adds *durability and queueing*; it adds **zero** new concurrency primitives. A second pool would contend with `_INFERENCE_EXECUTOR` for the singleton model and buy nothing.

```
HTTP thread ──enqueue──▶ SQLite job table ──claim──▶ job worker thread (1)
                                                        │
                                                        ▼
                                          services.analyze_scene()   ← unchanged
                                                        ▼
                                          executor.execute_plan()    ← unchanged
                                                        ▼
                                          router.route(timeout=120)  ← unchanged
                                                        ▼
                                          _INFERENCE_EXECUTOR (1)    ← already exists
```

## 1.3 Schema DDL

`backend/db.py` — new file, ~90 lines total including the helpers below.

```sql
-- Applied once at process start, idempotently.
PRAGMA journal_mode = WAL;        -- verified: persists across connections
PRAGMA synchronous  = NORMAL;     -- WAL + NORMAL survives process kill, not host power loss
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scene (
  scene_id      TEXT PRIMARY KEY,          -- 'scene_<uuid4hex>', already generated by ingest_scene()
  sha256        TEXT NOT NULL,             -- of the CANONICAL stored PNG, not the upload bytes
  byte_size     INTEGER NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('PNG','JPEG')),
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job (
  job_id            TEXT PRIMARY KEY,      -- 'job_<uuid4hex>'
  idempotency_key   TEXT NOT NULL UNIQUE,
  state             TEXT NOT NULL CHECK (state IN
                      ('ACCEPTED','VALIDATING','QUEUED','RUNNING',
                       'SUCCEEDED','FAILED','TIMED_OUT','CANCELLED')),
  scene_id          TEXT NOT NULL REFERENCES scene(scene_id),
  question          TEXT NOT NULL,
  sensor            TEXT,
  capability        TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 2,
  cancel_requested  INTEGER NOT NULL DEFAULT 0,
  worker_epoch      TEXT,                  -- uuid4 of the worker process that claimed it
  request_id        TEXT NOT NULL,         -- joins the job to the structured log stream
  result_json       TEXT,                  -- the exact AnalyzeResponse body, verbatim
  trace_record_hash TEXT,                  -- join key into trace.jsonl; see §1.7
  error_code        TEXT,                  -- closed vocabulary, §1.9
  created_at        TEXT NOT NULL,
  started_at        TEXT,
  finished_at       TEXT,
  deadline_at       TEXT
);

CREATE INDEX IF NOT EXISTS job_pending ON job(state) WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS job_created ON job(created_at DESC);
```

**Verified** (`sqlprobe.py`): the `CHECK` constraint is enforced by SQLite — an illegal state transition raises `IntegrityError` rather than silently corrupting the table. That is a database constraint doing the work of application code, which is the cheapest place to put it.

**Verified** (`dbprobe.py`): SQLite 3.45.3 in the target interpreter, so `ON CONFLICT` (≥3.24) and `RETURNING` (≥3.35) are both available. 8 threads × 200 commits = 1600 writes in **0.22 s, zero `SQLITE_BUSY` errors** under WAL + `busy_timeout=5000`. Backpressure will never be database contention on this workload.

## 1.4 Connection handling — the one SQLite gotcha

```python
# backend/db.py
import sqlite3, threading
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "runtime" / "satquery.db"
_local = threading.local()

def connect() -> sqlite3.Connection:
    """One connection per thread. sqlite3 connections are not thread-safe;
    WAL makes many connections to one file cheap, so per-thread is the lazy
    correct answer and needs no pool."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.executescript(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"
            "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;"
        )
        _local.conn = conn
    return conn
```

`isolation_level=None` turns off Python's implicit transaction management so `BEGIN IMMEDIATE` means what it says. This matters for §1.5.

## 1.5 Enqueue: idempotency + backpressure in one transaction

Both checks must happen under the same write lock or they race. `BEGIN IMMEDIATE` takes the write lock up front, so one statement sequence covers both.

```python
# backend/jobs.py
import hashlib, json, uuid
from datetime import datetime, timezone

QUEUE_CAPACITY  = 16          # single node, no multi-tenancy; 16 >> any judging panel
PENDING_STATES  = ("ACCEPTED", "VALIDATING", "QUEUED", "RUNNING")
JOB_DEADLINE_S  = 300.0       # outer bound; router's 120 s is the inner per-inference bound

class QueueFull(RuntimeError): ...

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def default_idempotency_key(scene_id, question, sensor, capability) -> str:
    """A resubmitted identical request is the same job, not a second one.
    Clients may override with an Idempotency-Key header."""
    payload = json.dumps(
        [scene_id, question.strip(), sensor, capability], sort_keys=True
    )
    return hashlib.sha256(payload.encode()).hexdigest()

def enqueue(*, scene_id, question, sensor, capability, request_id,
            idempotency_key=None) -> tuple[str, str, bool]:
    """Returns (job_id, state, was_replay). Raises QueueFull."""
    key = idempotency_key or default_idempotency_key(
        scene_id, question, sensor, capability)
    conn = connect()
    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute(
            "SELECT job_id, state FROM job WHERE idempotency_key = ?", (key,)
        ).fetchone()
        if existing:                                   # replay: same job, no new work
            conn.execute("COMMIT")
            return existing["job_id"], existing["state"], True

        depth = conn.execute(
            f"SELECT COUNT(*) FROM job WHERE state IN {PENDING_STATES}"
        ).fetchone()[0]
        if depth >= QUEUE_CAPACITY:
            conn.execute("COMMIT")
            raise QueueFull(f"{depth} jobs pending; capacity is {QUEUE_CAPACITY}.")

        job_id = f"job_{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO job(job_id, idempotency_key, state, scene_id, question,"
            " sensor, capability, request_id, created_at)"
            " VALUES(?,?,'ACCEPTED',?,?,?,?,?,?)",
            (job_id, key, scene_id, question.strip(), sensor, capability,
             request_id, _now()),
        )
        conn.execute("COMMIT")
        return job_id, "ACCEPTED", False
    except QueueFull:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

**Verified** (`sqlprobe.py`, cap lowered to 3): first three enqueues → `NEW`; fourth → `BUSY` at depth 3; a repeat key → `REPLAY` returning the *original* `job_id`. The replay path is the one that matters: a judge double-clicking "Analyze" gets one job and one GPU run, not two.

`QueueFull` → HTTP **429** with a `Retry-After` header. That is the honest backpressure answer for a single box: refuse work you cannot do rather than accept it and lie.

## 1.6 ACCEPTED → VALIDATING → QUEUED happen in the request handler

These two states are otherwise vestigial with synchronous validation. Making them real costs ~2 ms and gives the System Status screen something truthful to render:

```python
# backend/routes/jobs.py  (new, ~70 lines)
@router.post("/jobs", status_code=202)
def submit(request: AnalyzeRequest, idempotency_key: str | None = Header(None)):
    request_id = current_request_id()
    try:
        job_id, state, replayed = enqueue(
            scene_id=request.scene_id, question=request.question,
            sensor=request.sensor, capability=request.capability,
            request_id=request_id, idempotency_key=idempotency_key)
    except QueueFull as exc:
        raise HTTPException(429, "The analysis queue is full.",
                            headers={"Retry-After": "10"}) from exc
    if replayed:
        return JobAccepted(job_id=job_id, state=state, replayed=True)

    _set_state(job_id, "VALIDATING")
    try:
        verify_scene_integrity(request.scene_id)     # §1.8 — cheap, 7 ms
    except SceneIntegrityError as exc:
        _fail(job_id, "artifact_checksum_mismatch", str(exc))
        raise HTTPException(409, "The stored scene failed its integrity check.") from exc
    _set_state(job_id, "QUEUED")
    return JobAccepted(job_id=job_id, state="QUEUED", replayed=False)
```

Validation before the queue, not inside the worker, so a bad request fails in the caller's own HTTP response instead of surfacing 40 seconds later as a mysterious FAILED job.

## 1.7 The worker loop, restart recovery, retries, timeouts, cancellation

```python
# backend/worker.py  (new, ~110 lines)
import threading, time, uuid
from backend import services
from backend.db import connect

WORKER_EPOCH = uuid.uuid4().hex     # new per process; this IS the restart detector
POLL_SECONDS = 0.25
_stop = threading.Event()

RETRYABLE = {"model_timeout", "model_execution_failed"}
#  NOT retryable, deliberately:
#   model_unavailable        -> no CUDA GPU. Retrying cannot make a GPU appear.
#   trace_persistence_failed -> retrying would double-append to the audit ledger.
#   capability_unavailable   -> a deterministic planner decision; identical on retry.
#   invalid_model_output     -> deterministic for a deterministic model.

def recover_orphans() -> int:
    """Any job left mid-flight by a killed worker. Single node + single worker
    means ANY row not stamped with THIS epoch is by definition orphaned."""
    conn = connect()
    rows = conn.execute(
        "UPDATE job SET state = CASE WHEN attempts < max_attempts"
        "                       THEN 'QUEUED' ELSE 'FAILED' END,"
        "   error_code = CASE WHEN attempts < max_attempts"
        "                       THEN NULL ELSE 'worker_restart_exhausted' END"
        " WHERE state IN ('ACCEPTED','VALIDATING','RUNNING')"
        "   AND (worker_epoch IS NULL OR worker_epoch <> ?)"
        " RETURNING job_id, state", (WORKER_EPOCH,)).fetchall()
    return len(rows)

def _claim() -> sqlite3.Row | None:
    """Atomic claim. The `AND state='QUEUED'` guard is load-bearing: without it
    two workers can select the same row before either writes."""
    return connect().execute(
        "UPDATE job SET state='RUNNING', attempts=attempts+1,"
        "   worker_epoch=?, started_at=?, deadline_at=?"
        " WHERE job_id = (SELECT job_id FROM job"
        "                 WHERE state='QUEUED' AND cancel_requested=0"
        "                 ORDER BY rowid LIMIT 1)"
        "   AND state='QUEUED'"
        " RETURNING *",
        (WORKER_EPOCH, _now(), _deadline(JOB_DEADLINE_S))).fetchone()

def _run_once() -> bool:
    job = _claim()
    if job is None:
        return False
    log("job.start", job_id=job["job_id"], scene_id=job["scene_id"],
        request_id=job["request_id"], attempt=job["attempts"])
    t0 = time.perf_counter()
    try:
        result = services.analyze_scene(           # <-- entirely unchanged
            job["scene_id"], job["question"], job["sensor"], job["capability"])
    except Exception as exc:
        code = classify(exc)                        # §1.9
        retry = code in RETRYABLE and job["attempts"] < job["max_attempts"]
        _finish(job["job_id"],
                state="QUEUED" if retry
                      else ("TIMED_OUT" if code == "model_timeout" else "FAILED"),
                error_code=code)
        log("job.error", job_id=job["job_id"], status="error", error_code=code,
            latency_ms=int((time.perf_counter() - t0) * 1000), will_retry=retry)
        return True
    if _cancel_requested(job["job_id"]):
        # ponytail: the GPU call already finished; we discard the answer rather
        # than publish work the caller withdrew. We cannot interrupt it. See below.
        _finish(job["job_id"], state="CANCELLED", error_code="cancelled_after_completion")
        return True
    _succeed(job["job_id"], result)
    log("job.done", job_id=job["job_id"], status="ok",
        latency_ms=int((time.perf_counter() - t0) * 1000),
        execution_mode=result["execution_mode"])
    return True

def loop() -> None:
    recover_orphans()
    while not _stop.wait(0 if _run_once() else POLL_SECONDS):
        pass

def start() -> None:            # called from a FastAPI lifespan handler
    threading.Thread(target=loop, name="satquery-worker", daemon=True).start()
```

### Killed-and-restarted worker — verified, not asserted

`killprobe.py` starts a worker subprocess, commits `RUNNING`, issues an **uncommitted** `SUCCEEDED`, then `SIGKILL`s itself mid-transaction. On reopen:

```
after SIGKILL mid-transaction -> [('j1', 'RUNNING', 1, 83997)]
integrity_check               -> ok
recovery sweep requeued 1     -> [('j1', 'QUEUED', 1)]
```

The committed state survived, the uncommitted state rolled back, the database was not corrupted, and the sweep requeued the orphan with `attempts` preserved so a poison job cannot loop forever. That is exactly the required behaviour, demonstrated rather than hoped for.

Claim atomicity, same script: 8 threads racing for 50 queued rows produced **50 claims, 50 unique — no double-claim**.

### Cancellation — stated honestly

CPython cannot kill a thread. `model.generate()` inside `_INFERENCE_EXECUTOR` runs to completion no matter what. `router.py` already models this truthfully with the `abandoned: Event` — the *caller* stops waiting; the work does not stop.

So `POST /api/jobs/{id}/cancel` means exactly:

| Job state when cancel arrives | Effect |
|---|---|
| `ACCEPTED` / `VALIDATING` / `QUEUED` | `state = CANCELLED` immediately. Never runs. Real cancellation. |
| `RUNNING` | `cancel_requested = 1`. The inference runs to completion; the answer is **discarded**, state becomes `CANCELLED`. The GPU is not freed early. |

The API response says this in plain words. Do not claim more.
`# ponytail: thread-level cancel only. True preemption needs a process worker — ~6 h, only worth it if a judge can actually observe a stuck 120 s job, which the 120 s router timeout already bounds.`

### Timeouts — two bounds, already one of them free

| Bound | Value | Where | Status |
|---|---|---|---|
| Per-inference wall clock | 120 s | `router.py` `_INFERENCE_EXECUTOR` | **Exists and is tested** |
| Per-job lifetime | 300 s | `deadline_at`, swept by the worker loop | New, ~15 lines |

The outer bound catches a job wedged *between* the queue and the model — for example blocked on a stalled filesystem read — which the inner bound cannot see.

### Do NOT migrate `trace.jsonl` into SQLite

Recommendation: **leave it exactly where it is.** Add one column, `job.trace_record_hash`, holding the `record_hash` returned by `append_record()`. That is the whole integration.

Reasons, in descending weight:

1. It works. 98 % covered, 167 lines of tests in `orchestrator/test_trace.py`, fails closed on tamper and on non-ASCII hash injection (`test_non_ascii_record_hash_returns_sanitized_503`). The floor rule forbids breaking it.
2. A flat, append-only, hash-chained JSONL file is **more** auditable to a judge than rows in a binary database. "Here is the file; here is `verify_chain()`; re-run it yourself" is a stronger demo than any table.
3. Migration is ~8 h and every one of those hours is spent recreating a property the current file already has.
4. The only thing SQLite adds is joinability, and one `TEXT` column delivers that for free.

The cost of being wrong later is one backfill script. The cost of being wrong now is a broken audit ledger three weeks before the finale.

## 1.8 SHA-256 artifact integrity

**Checksum the canonical stored PNG, not the uploaded bytes.** `ingest_scene()` re-encodes every upload to canonical PNG (`services.py:180`), and the canonical file is what is later served and read. Hashing the upload bytes would checksum something that is never read again.

Measured cost (`dbprobe.py`): **7.2 ms for 20 MiB** — the maximum accepted upload. Free.

```python
# in backend/services.py ingest_scene(), immediately after `temporary.replace(target)`
import hashlib

def _sha256_file(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()   # stdlib, py3.11+

# ... after the atomic replace:
    digest = _sha256_file(target)
    record_scene(scene_id=scene_id, sha256=digest,
                 byte_size=target.stat().st_size, source_format=detected_format,
                 width=width, height=height)
# and add to the returned dict:
    "sha256": digest,
```

Verification is **not** done on every image GET (7 ms × every request, zero benefit). It is done at exactly two points:

```python
class SceneIntegrityError(RuntimeError):
    """The stored scene no longer matches its recorded checksum."""

def verify_scene_integrity(scene_id: str) -> str:
    row = connect().execute(
        "SELECT sha256 FROM scene WHERE scene_id = ?", (scene_id,)).fetchone()
    if row is None:
        return "unregistered"          # pre-existing golden scenes: no row, no claim made
    path = INGESTED_SCENE_DIR / f"{scene_id}.png"
    if not path.is_file():
        raise SceneIntegrityError("The stored scene file is missing.")
    if not hmac.compare_digest(_sha256_file(path), row["sha256"]):
        raise SceneIntegrityError("The stored scene failed its checksum.")
    return "verified"
```

1. **At job VALIDATING** (§1.6) — catches the Phase 9 corrupt-artifact fault before a single GPU second is spent.
2. **In `/api/system/status`** — a judge-visible "N scenes, N verified" line.

`SceneUploadResponse` gains `sha256: str`. The frontend can render it; a checksum shown next to the image is a cheap, legible integrity claim on a demo screen.

Returning `"unregistered"` rather than raising for the committed golden scenes is deliberate: they predate the table, they are read-only repo artifacts, and inventing a checksum record for them would be fabrication.

## 1.9 Error code vocabulary

A closed set, mapped from the exceptions that already exist. No new exception types.

```python
ERROR_CODES = {
    services.AnalysisUnavailable:      ("analysis_unavailable",   422),
    services.ArtifactError:            ("artifact_unavailable",   503),
    services.InvalidImageUpload:       ("invalid_upload",         422),
    services.SceneStorageError:        ("scene_storage_failed",   500),
    services.ModelUnavailable:         ("model_unavailable",      503),
    services.ModelExecutionError:      ("model_execution_failed", 502),
    SceneIntegrityError:               ("artifact_checksum_mismatch", 409),
    capabilities.CapabilityUnavailable:("capability_unavailable", 503),
    capabilities.UnknownCapability:    ("unknown_capability",     422),
    router.InvalidModelOutput:         ("invalid_model_output",   502),
    router.ModelExecutionTimeout:      ("model_timeout",          504),
    router.TracePersistenceError:      ("trace_persistence_failed", 503),
    planner.InvalidPlanRequest:        ("invalid_plan_request",   422),
    QueueFull:                         ("queue_full",             429),
}

def classify(exc: Exception) -> str:
    for exc_type, (code, _) in ERROR_CODES.items():
        if isinstance(exc, exc_type):
            return code
    return "internal_error"
```

This same table drives the HTTP status mapping in `routes/analyze.py`, which currently hand-writes 12 near-identical `except` clauses (`analyze.py:73-98`). Collapsing them is a **1 h** DRY win and makes the sync and async paths report identical codes — which matters because the System Status screen aggregates both.

## 1.10 Phase 1 exit criteria

- [ ] `POST /api/analyze` behaves **byte-identically** to today. All 254 existing tests still pass, unmodified.
- [ ] `POST /api/jobs` → 202 → poll → `SUCCEEDED` with the same body `/api/analyze` returns.
- [ ] Double-submit returns the same `job_id`, `replayed: true`, and runs the model once.
- [ ] 17 pending jobs → the 17th gets 429 + `Retry-After`.
- [ ] `kill -9` the API mid-job, restart: the job is `QUEUED` again, `attempts=1`, and completes.
- [ ] Overwrite a stored scene PNG → the next job on it returns 409 before invoking the model.
- [ ] `verify_chain()` still returns verified. `trace.jsonl` is untouched.

**Cost: 14 h (engine) + 3 h (checksums) + 1 h (error-table DRY) = 18 h.**

---

# 2. The reusable hostile-input suite

New file `backend/test_hostile_input.py`, ~160 lines. Built once in Phase 1, re-run unmodified at every later checkpoint by CI.

**I fired all of these at the live app before writing this section** (`probe.py`). Results:

| # | Case | Input | Expected | **Today** |
|---|---|---|---|---|
| H1a | Corrupt — truncated | Valid PNG cut in half | 422 `not a safe, valid image` | ✅ 422 |
| H1b | Corrupt — header only | `\x89PNG\r\n\x1a\n` | 422 | ✅ 422 |
| H1c | Corrupt — trailer mangled | Valid PNG, last 20 bytes → `0xff` | 422 | ✅ 422 |
| H2 | Oversized | 21 MiB | 413 `exceeds the 20 MiB limit` | ✅ 413 |
| H3a–d | Wrong format | BMP / GIF / TIFF / WEBP named `.png` | 422 `Only PNG and JPEG` | ✅ 422 ×4 |
| H3e | SVG (XXE vector) | `<svg …>` as `image/svg+xml` | 422 | ✅ 422 |
| H3f | Not an image | `b"not an image at all"`, `text/plain` | 422 | ✅ 422 |
| H3g | ZIP polyglot | `PK\x03\x04…` named `.png` | 422 | ✅ 422 |
| H3h | **Honest liar** | Real JPEG named `.png` | **201, `format: "JPEG"`** | ✅ 201 |
| H4 | Zero-byte | `b""` | 422 `The uploaded image is empty.` | ✅ 422 |
| H5a | Traversal filename | `../../../etc/passwd.png` | 201, `filename: "passwd.png"`, uuid scene_id | ✅ |
| H5b | Windows traversal | `..\..\windows\sys.png` | 201, `filename: "sys.png"` | ✅ |
| H5c | Absolute path | `/etc/cron.d/evil.png` | 201, `filename: "evil.png"` | ✅ |
| H5d | Null-byte filename | `ok.png\x00.sh` | 201, no raw NUL in response | ⚠️ returns `ok.png%00.sh` — see G2 |
| H6 | **Decompression bomb** | **Real** 20000×20000 grey PNG, **389 KB on the wire, 400 Mpx decoded** | 422, no `DecompressionBomb` string leaked | ✅ 422 |

H3h is an assertion, not a bug: format is determined by **content** (`source.format`, `services.py:151`), never by extension. A JPEG named `.png` is correctly accepted *and correctly labelled JPEG*. Pin it with a test so nobody "fixes" it into extension-trusting later.

H5 is defended in depth and it is worth naming both layers, because the master plan credits only one: `Path(filename.replace("\\","/")).name` (`services.py:191`) sanitises the echoed name, and the scene id is `uuid4().hex` (`services.py:175`) so the filename **never** reaches the filesystem at all. The correct property to assert is not "the filename was sanitised" but "the stored path is uuid-derived and independent of the filename."

### Three real gaps the suite must close

**G1 — the existing bomb test is testing a monkeypatch, not the guard.**
`backend/test_api.py:255` does `monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)` and then uploads a 4×4 image. That proves the *warning handler* works; it does not prove PIL's real 89,478,485-pixel ceiling is reached before memory is. **Ship a real bomb** — I generated one in 12 lines of `zlib` + `struct`:

```python
def png_bomb(width: int, height: int) -> bytes:
    """A structurally valid greyscale PNG with huge declared dimensions and a
    tiny compressed payload. 20000x20000 -> 389 KB on the wire, 400 Mpx decoded,
    well over PIL's 89,478,485-pixel default ceiling."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x00" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def test_real_decompression_bomb_is_rejected(client):
    bomb = png_bomb(20_000, 20_000)
    assert len(bomb) < 20 * 1024 * 1024          # passes the size gate; must still be caught
    response = upload(client, "bomb.png", bomb)
    assert response.status_code == 422
    assert "DecompressionBomb" not in response.text
    assert not services.INGESTED_SCENE_DIR.exists()
```

Keep the monkeypatched test too — it covers the *warning* branch, the real bomb covers the *error* branch. Both branches are caught by `services.py:166-172`. **Verified passing.** Cost: **1 h**.

**G2 — null-byte filename surfaces as `ok.png%00.sh`.** Starlette percent-encodes it, so no NUL reaches Python, and the name never touches the filesystem. But it is echoed to the React UI. Low severity — React escapes by default — yet the fix is one line in `ingest_scene()`:

```python
safe_filename = (Path(filename.replace("\\", "/")).name
                 .replace("\x00", "").replace("%00", "")[:255] or "upload")
```

Cost: **15 min**, including the test.

**G3 — `_slug()` is a latent arbitrary-`.png`-read primitive.** Confirmed exactly as suspected:

```
_slug('../../etc/passwd')        -> '../../etc/passwd'
_slug('../../data/ladder/0.3/x') -> '../../data/ladder/0.3/x'
```

Traversal is blocked **only** because Starlette's `{scene}` path converter refuses `%2F` — all four traversal probes returned 404 *from the router*, not from the code. Change that route to `{scene:path}` for any reason and `sar_render_path()` becomes a read primitive for any `.png` on the box.

Do not rely on an accident. One line:

```python
def _slug(value: str) -> str:
    slug = "-".join(value.lower().replace("–", "-").split())
    if "/" in slug or "\\" in slug or ".." in slug:
        raise ArtifactError("Invalid SAR scene identifier.")
    return slug
```

This mirrors the guard `local_scene_image()` already has at `services.py:133`, so it is an existing in-repo pattern, not a new one. Cost: **30 min** including a `{scene:path}`-simulating regression test that pins the property directly rather than relying on the router.

**Suite total: 4 h** (2 h to write the 20 cases, 2 h for the three gaps).

The suite asserts three invariants on every case, which is what makes it reusable rather than a snapshot:

1. Correct status code.
2. **No filesystem path, stack frame, or library name appears in the response body** — already asserted at `test_api.py:236`, generalise it.
3. **`INGESTED_SCENE_DIR` contains no new file** — a rejected upload must leave no residue.

---

# 3. CI — the cheapest high-value gap in the project

## The measurement that determines the design

`backend/.venv` is **1.5 GB** — torch 2.14, transformers 5.16, streamlit, rasterio, matplotlib, scipy. Installing that in GitHub Actions is minutes per run, every run, and the team will start skipping CI.

So I measured the alternative. **Verified:** `backend/` + `orchestrator/` — **169 of the 254 tests, which is 100 % of the HTTP API and orchestration surface** — run against a venv of six packages (fastapi, pydantic, httpx, pytest, python-multipart, pillow) with **no torch, no transformers, no streamlit, no rasterio**:

```
169 passed, 2 warnings in 2.64s
```

This works because `models/qwen_vl/model.py` imports torch **lazily inside `_load()`** (line 27), never at module scope. That is an existing design property; CI just has to stop paying for the heavy stack it does not exercise.

The remaining 85 tests are `eval/` (numpy/torch/matplotlib science) and `demo_gui/` (Streamlit). They gate the *research* artifacts, not the demo path. Run them locally; do not pay 1.5 GB per push for them. Flag them as a documented, deliberate exclusion rather than an oversight.

## `.github/workflows/ci.yml` — complete

```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
          cache: pip

      # The gating suite needs six packages, not the 1.5 GB science stack.
      # torch/transformers are imported lazily inside QwenVLModel._load(),
      # so no import in backend/ or orchestrator/ reaches them.
      - name: Install
        run: |
          python -m pip install --upgrade pip
          pip install -r backend/requirements.txt pillow coverage pip-audit

      - name: Tests + coverage
        run: |
          coverage run -m pytest backend orchestrator -q
          coverage report --include='backend/*,orchestrator/*' --fail-under=90

      - name: Hostile-input suite
        run: pytest backend/test_hostile_input.py -q -v

      - name: Dependency audit
        run: pip-audit -r backend/requirements.txt --strict

  frontend:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npm audit --audit-level=high
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
```

Notes, each of which is a deliberate omission:

- **`python-version: "3.13"`** matches the actual venv, not the `3.11` in `.python-version`. That file is stale. Fix it or the first CI run will disagree with every developer machine. (5 min.)
- **`--fail-under=90`.** Current measured coverage of `backend/*` + `orchestrator/*` is **96 %**. 90 is a floor that ratchets, not a target that blocks.
- **The hostile suite runs as its own named step** even though `pytest backend` already collected it. The step name is the point: when a phase exit criterion says "full hostile-input suite still passes," a judge — or a teammate at 2 a.m. — can see a green check labelled exactly that.
- **No matrix, no OS matrix, no Python matrix.** One box, one Python. A matrix tests portability this project will never need.
- **No `pytest-cov`.** `coverage` is already installed in the venv; `coverage run -m pytest` is the same thing with one fewer dependency.
- **No caching of the venv beyond `cache: pip`.** Six packages install in ~15 s.

Expected wall clock: **backend ≈ 60 s, frontend ≈ 90 s, in parallel.**

**Cost: 2 h**, including the first three red-then-green iterations that every new CI file requires.

---

# PHASE 6 (17–23 Nov) — Orchestration hardening. **Re-baselined: ~85 % already done.**

I read `capabilities.py` (175 lines), `planner.py` (333), `execution_plan.py` (197), `executor.py` (78) and their 744 lines of tests before writing this. Measured coverage: capabilities **97 %**, execution_plan **98 %**, planner **97 %**, executor **83 %**, router **93 %**.

## What Phase 6 asks for, against what exists

**"Bounded / allowlisted tool invocation" — built.**

- `KNOWN_CAPABILITIES` is a closed 4-tuple; `IMPLEMENTED_CAPABILITIES` is a `frozenset` of exactly one (`capabilities.py:17-33`). Anything outside → `UnknownCapability`.
- `Provider.__post_init__` **refuses to construct** a provider advertising an unimplemented capability (`capabilities.py:65-69`). The allowlist is enforced at registration, not at call time.
- `register_provider` refuses to rebind a capability already bound to a different provider (`capabilities.py:102-106`), so nothing can silently hijack a route.
- `executor.execute_plan` is **all-or-nothing**: every step's provider is checked *before the first step runs* (`executor.py:45-49`), then the shape is pinned to exactly one `single_image_vqa` step with `required_inputs == ("single_scene",)` (`executor.py:74-78`).

**"Audited tool calls through the existing trace contract" — built, and hardened against forgery.**
`router.route()` strips eight reserved keys from caller-supplied `params` and re-populates them from the *resolved* provider and the *actual* plan (`router.py:134-164`). A caller cannot forge `capability`, `planner_version`, `planner_rule`, or any `execution_step_*` field. Two tests pin this: `test_caller_cannot_forge_planner_trace_metadata` and `test_caller_cannot_forge_execution_step_metadata`.

**"Correct behavior when a capability is unavailable" — built, and this is the strongest part.**
`test_unavailable_grounding_never_routes_to_vqa`, `test_multi_step_plan_analyze_invokes_no_provider`, `test_multi_step_request_on_golden_scene_cannot_use_cache` (a genuinely subtle one — an unavailable multi-step plan must not be rescued by the golden cache), `test_golden_fallback_rejects_unsupported_capability`. `is_golden_eligible_plan()` (`services.py:98`) exists precisely to stop a multi-step plan collecting the single-step cached answer.

## What actually remains — 6 h, not 5 days

**R1 — `route()` is unbounded when `timeout_seconds is None`. (30 min, HIGH)**

```python
# router.py:89-91
if timeout_seconds is None:
    result = model.infer(image_paths=image_paths, question=question)   # no bound
```

`analyze_scene` always passes 120 s, so the live path is safe *today*. But the bound is opt-in, and the next caller — the job worker, an eval script, a teammate — gets an unbounded GPU call by writing less code. Make the safe thing the default:

```python
DEFAULT_TIMEOUT_SECONDS = 120.0

def route(..., timeout_seconds: float | None = DEFAULT_TIMEOUT_SECONDS, ...):
    ...
    if timeout_seconds is None:          # now an explicit, auditable opt-out
        result = model.infer(...)
```

Fixing it inside `route()` rather than at each caller is the smaller diff *and* the root-cause fix: every present and future caller is covered by one line.

**R2 — traces carry no `job_id` / `request_id`. (1 h)**
Nothing joins an audit record to the HTTP request or job that caused it. Pass both through `base_params` in `services.analyze_scene()`; they flow into `traced_params` automatically because they are not reserved keys. This is a prerequisite for the Phase 9 observability story, and it is the one genuinely missing piece of the trace contract.

**R3 — `executor.py` at 83 %, `registry.py` at 72 %. (1.5 h)**
The uncovered lines in `executor.py` are the `CapabilityUnavailable` raises — the paths that matter most on demo day. Cover them.

**R4 — "tool invocation" is an undefined term in the master plan. (0 h to resolve, 3 h if it means what I hope)**
There are no "tools" in this codebase. There are *capabilities*, each bound to exactly one *provider*, each executed through `Model.infer()`. If "bounded, allowlisted tool invocation" means capability-provider invocation, **it is done** — the allowlist is a `frozenset` checked at registration and a `CHECK`-style refusal at resolution.

If it means something else — an external geocoder, a band-math function, a shapefile reader — then **none of it exists and it is new feature scope, not hardening.** It would need a tool registry, an argument schema, an argument validator, and a trace extension: a week minimum, in the last three weeks before the finale.

**This ambiguity is the single biggest scheduling risk I found. Resolve it in week 1, not in November.** My recommendation: define "tool" == "capability provider," declare it done, and put the time into Phase 9.

**R5 — one genuine hardening gap worth the time: a capability-availability integration test at the HTTP layer.** Every existing test exercises unavailability through the planner. Add one that unregisters the VQA provider at runtime (`capabilities.reset_registry()`) and asserts `/api/analyze` returns 503 with a truthful message and **writes no trace record**. (1 h.) This is the exact failure a judge might induce by asking "what if the model isn't loaded?"

**Phase 6 total: 6 h. Original budget ~5 working days (≈30 h). Freed: ≈24 h.**

### Where the freed time goes

1. **+8 h → Phase 9 fault injection** (§4). It is entirely unbuilt and it is the highest-variance item left.
2. **+8 h → a full offline-bundle dress rehearsal in week of 24 Nov**, not on 1 Dec. The first WiFi-off run always finds something, and finding it with a week of slack is a different experience from finding it with two days.
3. **+8 h → Track B's real bottleneck.** Track B owns frontend *and* job engine *and* validation *and* Docker *and* security *and* observability *and* load testing. The binding constraint on this project is not orchestration sophistication, it is one person's November. Bank the hours.

---

# PHASE 9 (1–5 Dec) — Hardening consolidation

Against the **real rented GPU box**, not a laptop, not CI. Rent it by **1 Nov** at the latest — see §7.

## 4.1 Fault-injection matrix

Six faults. Each row has an exact injection command and an exact expected recovery. "Expected" means *the state the system must be observed to reach*, not the state we hope it reaches.

| # | Fault | Injection | Expected — exact | Verifies |
|---|---|---|---|---|
| **F1** | Kill worker mid-job | Submit a job; while `RUNNING`, `docker compose kill -s SIGKILL api` | On restart `recover_orphans()` requeues it: `state=QUEUED, attempts=1`. It runs and reaches `SUCCEEDED`. Uncommitted writes rolled back; `PRAGMA integrity_check` → `ok`. **Verified in miniature by `killprobe.py`.** | Durable state machine |
| **F2** | Kill the database | `chmod 000 data/runtime/satquery.db*` mid-flight | New `POST /api/jobs` → **503** `queue_unavailable`, never 500, never a stack trace. **`POST /api/analyze` keeps working** — it does not touch SQLite. After `chmod 644`, queueing resumes with no data loss. | **The floor rule, literally: the job engine dies back to the Phase 0 sync path.** |
| **F3** | Corrupt an artifact | `printf 'x' >> data/runtime/scenes/scene_<id>.png` | Next job on that scene → **409 `artifact_checksum_mismatch` at VALIDATING**, before the model is invoked. `/api/system/status` shows `scenes_verified` down by one. Other scenes unaffected. | §1.8 checksums |
| **F4** | GPU OOM | `CUDA_VISIBLE_DEVICES=""` restart → the box has no CUDA → `QwenVLModel._load()` raises `RuntimeError("...requires a CUDA GPU...")`. For *true* OOM: a second process holding the card via `torch.cuda.set_per_process_memory_fraction(0.98)`. | Both land in `services.analyze_scene`'s `except Exception` at `services.py:339-345`, which tests `"CUDA GPU" in str(exc)` → `ModelUnavailable` → **503**, or falls back to the committed cached answer for the golden scene with the `notice` naming the reason. **Job → `FAILED`, `error_code=model_unavailable`, NOT retried.** | Graceful degradation to the Phase 0 floor |
| **F5** | Force timeout | `monkeypatch` a provider that sleeps 130 s; or in prod, set `MODEL_EXECUTION_TIMEOUT_SECONDS=2` via env and ask a real question | `router.ModelExecutionTimeout` at 120 s → job `TIMED_OUT`, **retried once** (`attempts=2`), then terminal. **No success trace is written** — pinned today by `test_model_timeout_bounds_request_without_success_trace`. Golden scene falls back to the cached answer (`services.py:333-337`). | Both timeout bounds |
| **F6** | Disk pressure | `fallocate -l $(($(df --output=avail -B1 . \| tail -1) - 50000000)) /tmp/ballast` leaving ~50 MB, then upload a 19 MiB image | `canonical.save()` raises `OSError` → `SceneStorageError` → **500** `The uploaded image could not be stored.` **No partial file left** — the `finally` at `services.py:184-189` unlinks the temp; pinned today by `test_failed_storage_leaves_no_scene`. `trace.jsonl` append failure → `TracePersistenceError` → 503 **with no answer returned**, pinned by `test_trace_failure_after_valid_output_returns_503_without_answer`. Delete the ballast; service resumes. | Atomic writes, no torn artifacts |

F2 is the row that proves the floor rule. Everything else degrades; F2 demonstrates that when the *new* Phase 1 infrastructure fails completely, the *old* Phase 0 path is still standing and still answers.

**Delivery: `scripts/fault_drill.sh`, ~80 lines of bash, one function per fault, each printing PASS/FAIL.** Not a framework. A shell script a human runs once and a judge can read. **Cost: 8 h** (most of it is F4 and F6, which need the real box).

## 4.2 Concurrent-load test — to a judging-panel ceiling

A judging panel is **5–20 people**. Not 1000. Testing 1000 would measure a fantasy and cost a day.

```python
# scripts/load_probe.py — stdlib + httpx (already installed). ~45 lines. No locust, no k6.
import statistics, sys, time
from concurrent.futures import ThreadPoolExecutor
import httpx

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
QUESTION = "Is there a building in this image?"
SCENE = "loveda_LoveDA_images_png_0_gsd0.3"

def one(index: int) -> tuple[int, float]:
    t0 = time.perf_counter()
    # unique question -> unique idempotency key -> N real jobs, not 1 replayed job
    r = httpx.post(f"{API}/api/jobs", timeout=60.0, json={
        "scene_id": SCENE, "question": f"{QUESTION} [{index}]", "sensor": "LoveDA"})
    return r.status_code, (time.perf_counter() - t0) * 1000

for concurrency in (5, 10, 20):
    with ThreadPoolExecutor(concurrency) as pool:
        results = list(pool.map(one, range(concurrency)))
    codes = [c for c, _ in results]
    latencies = sorted(ms for _, ms in results)
    print(f"c={concurrency:2d}  202={codes.count(202):2d}  429={codes.count(429):2d}  "
          f"5xx={sum(c >= 500 for c in codes):2d}  "
          f"p50={statistics.median(latencies):6.0f}ms  p95={latencies[int(len(latencies)*0.95)-1]:6.0f}ms")
```

**Pass criteria, stated as the honest ceiling rather than a fantasy:**

| Concurrency | Expected |
|---|---|
| 5 | 5 × 202. Enqueue p95 **< 100 ms** (it is a `BEGIN IMMEDIATE` + one INSERT; measured 1600 commits in 0.22 s). |
| 10 | 10 × 202. Queue depth 10, still under the cap of 16. |
| 20 | **16 × 202 + 4 × 429.** Zero 5xx. |

That 429 is the correct answer and it is worth *demonstrating* rather than hiding: "one GPU, one job at a time, a bounded queue, and we tell you honestly when it is full" is a stronger engineering claim to a judging panel than a number that pretends a single T4 serves 1000 users. The whole test runs in under a minute.

Enqueue latency is what this measures; **end-to-end latency is GPU-bound at ~1 job at a time** and is measured separately with one sequential timing run. Do not conflate them.

**Cost: 3 h.**

## 4.3 Offline-bundle verification

**Good news, measured.** I grepped the frontend for external runtime dependencies and found **none**:

- **No `next/font`** — so no Google Fonts fetch at build *or* runtime. `layout.tsx` uses `className="font-sans"`, which is Tailwind's system-font stack.
- **No CDN links** — grepped `fonts.googleapis`, `cdn.`, `unpkg`, `jsdelivr` across `app/`, `components/`, `lib/`, `next.config.ts`: zero hits.
- **`maplibre-gl` requests no tiles.** `ImageryViewer.tsx:19` passes an inline style object with `sources: {}` and a single background layer. No tile server, no sprite URL, no glyph URL.
- **`lucide-react`** is bundled SVG; **`recharts`** is bundled SVG. Both compile in.
- Backend already forces `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` **before** importing the model registry (`services.py:19-20`, mirrored in `demo_gui/app.py:11-12`).

So the offline bundle is likely to pass first time. The verification is therefore cheap, which means there is no excuse for not doing it early.

**Procedure:**

1. **Build-time static check** (add to CI, 20 min): after `npm run build`, grep the output for external hosts. Fails loudly the day someone adds a font.
   ```bash
   ! grep -rEo 'https?://[a-zA-Z0-9.-]+' frontend/.next/static frontend/.next/server \
     | grep -vE '(localhost|127\.0\.0\.1|www\.w3\.org|schema\.org|json-schema\.org)' \
     | sort -u | tee /dev/stderr | grep -q .
   ```
2. **Image-time check**: `docker save satquery-api satquery-web -o satquery-offline.tar` (one file, ~2 GB with model weights baked in). `sha256sum` it and commit the digest.
3. **The real test — 2 Dec, on the demo laptop:**
   - `docker load -i satquery-offline.tar`
   - **Physically disable WiFi and unplug ethernet.** Not `--network none`; a real radio off. The point is to catch anything that reaches for a resolver.
   - `docker compose --profile offline up`
   - Walk the full golden path: upload a scene → submit a job → poll to `SUCCEEDED` → open the trace drawer → verify the chain → open System Status → open the resolution chart → open the SAR tab.
   - `docker compose logs | grep -iE "getaddrinfo|Temporary failure in name resolution|ENOTFOUND|ECONNREFUSED"` → **must be empty.**
   - Browser DevTools → Network → filter by domain → **must show only localhost.**
4. **Re-run the full hostile-input suite inside the offline container.** The phase exit criterion says it passes in every phase; offline is a phase.

**Cost: 4 h** (3 h the first time, since the first WiFi-off run always finds one thing).

## 4.4 Dependency vulnerability scanning

```bash
pip-audit -r backend/requirements.txt --strict     # in CI, already in §3
pip-audit -r requirements.txt                      # local only; the science stack is noisy
cd frontend && npm audit --audit-level=high        # in CI, already in §3
```

`pip-audit` is PyPA's own tool, queries the OSV database, is one pip install, and works offline against a cached advisory DB. **No Snyk, no Trivy, no Dependabot config.** Dependabot in particular would open pull requests this two-person team has no time to triage, and an ignored security PR is worse than none.

Policy, stated so it does not become an argument in December: **fix HIGH and CRITICAL; document MEDIUM and below in a `SECURITY.md` with a one-line rationale.** Freeze all dependency changes after **28 Nov** — a CVE bump that breaks the demo is a self-inflicted wound.

Note `requirements.txt` (the science stack) pins nothing: `torch`, `transformers>=4.49`, `numpy`, `scipy` are all floating. That is fine for research and **unacceptable for a demo box**. Generate `requirements.lock.txt` from the working GPU box with `pip freeze` the day inference first works end to end, and build the Docker image from the lock file. **Cost: 30 min, and it prevents the single most common demo-day failure — "it worked yesterday."**

**Phase 9 total: 8 + 3 + 4 + 1 = 16 h.**

---

# 6. Docker + Compose + structured logging

## 6.1 Two profiles, one file

```dockerfile
# Dockerfile.api
FROM python:3.13-slim
WORKDIR /app
# Torch et al. are huge and change rarely: separate layer, cached across rebuilds.
COPY requirements.lock.txt backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt -r requirements.txt
COPY backend/ backend/
COPY orchestrator/ orchestrator/
COPY models/ models/
COPY eval/ eval/
COPY data/sar_gate/ data/sar_gate/
COPY results/ results/
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# Dockerfile.web  — multi-stage; the runtime stage carries no node_modules
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Required one-line change** to `frontend/next.config.ts` — without it `.next/standalone` does not exist and the multi-stage build fails:

```ts
const nextConfig: NextConfig = { reactStrictMode: true, output: "standalone" };
```

```yaml
# compose.yaml
services:
  api:
    build: { context: ., dockerfile: Dockerfile.api }
    profiles: ["offline", "public"]
    volumes:
      - ./data/runtime:/app/data/runtime      # SQLite + scenes: MUST outlive the container
      - ./trace.jsonl:/app/trace.jsonl        # the audit chain: same
      - ~/.cache/huggingface:/root/.cache/huggingface:ro   # model weights, never downloaded
    environment:
      SATQUERY_ALLOWED_ORIGINS: ${SATQUERY_ALLOWED_ORIGINS:-http://localhost:3000}
      SATQUERY_LOG_FORMAT: json
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c",
             "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 10s
      timeout: 3s
      retries: 3

  web:
    build: { context: ., dockerfile: Dockerfile.web }
    profiles: ["offline", "public"]
    environment:
      NEXT_PUBLIC_API_URL: ${SATQUERY_PUBLIC_API_URL:-http://localhost:8000}
    depends_on: { api: { condition: service_healthy } }
    restart: unless-stopped

  # Optional public URL. No inbound port, no TLS cert, no nginx, no DNS.
  tunnel:
    image: cloudflare/cloudflared:latest
    profiles: ["public"]
    command: tunnel --no-autoupdate --url http://web:3000
    depends_on: [web]
```

**Profile differences, and nothing else:**

| | `offline` | `public` |
|---|---|---|
| Port binding | `127.0.0.1:8000` / `127.0.0.1:3000` | same — **nothing is exposed to the internet directly** |
| CORS | `http://localhost:3000` | the tunnel's assigned hostname |
| Extra service | — | `cloudflared` |
| Network | works with the radio off | needs WiFi, by definition |

`cloudflared --url` prints a URL and needs no account, no cert, no DNS record, and opens no inbound port. It is the laziest correct answer to "optional public URL," and if it fails on the day, the `offline` profile — the one that actually matters — is untouched.

**GPU** on the rented box, as an override file so the Mac never sees it:

```yaml
# compose.gpu.yaml  ->  docker compose -f compose.yaml -f compose.gpu.yaml --profile offline up
services:
  api:
    deploy:
      resources:
        reservations:
          devices: [{ driver: nvidia, count: 1, capabilities: [gpu] }]
```

On the M5 Mac there is no CUDA, `QwenVLModel._load()` raises, and the system falls back to the committed cached answer with a truthful notice. **The Mac runs the floor; the GPU box runs the ceiling. Both are demonstrable.** That is the floor rule expressed as a deployment topology rather than a slogan.

Two Makefile lines so nobody memorises flags:

```makefile
demo:        ; docker compose --profile offline up --build
demo-gpu:    ; docker compose -f compose.yaml -f compose.gpu.yaml --profile offline up --build
bundle:      ; docker save satquery-api satquery-web | gzip > satquery-offline.tar.gz
```

**Cost: 8 h.** Most of it is the first successful torch-in-slim image build, which is always slower than expected. **Do this in October, not December.**

## 6.2 Structured logging schema

One helper, one middleware. ~45 lines total. No logging framework, no `structlog`, no new dependency.

```python
# backend/logging_setup.py
import json, logging, sys, time, uuid
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar("request_id", default="-")

def current_request_id() -> str:
    return _request_id.get()

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts":         self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level":      record.levelname,
            "event":      record.getMessage(),
            "request_id": _request_id.get(),
            "component":  getattr(record, "component", record.name),
        }
        # Extras win, except they can never overwrite the stamped request_id.
        payload.update(getattr(record, "fields", {}))
        payload["request_id"] = _request_id.get()
        return json.dumps(payload, default=str)

def log(event: str, *, component: str = "api", level: int = logging.INFO, **fields) -> None:
    logging.getLogger("satquery").log(
        level, event, extra={"component": component, "fields": fields})
```

```python
# backend/main.py
@app.middleware("http")
async def request_context(request, call_next):
    token = _request_id.set(request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12])
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log("http.error", status="error", error_code="unhandled",
            path=request.url.path, latency_ms=int((time.perf_counter() - start) * 1000),
            level=logging.ERROR)
        raise
    finally:
        _request_id.reset(token)
    log("http.request", path=request.url.path, method=request.method,
        status="ok" if response.status_code < 400 else "error",
        http_status=response.status_code,
        latency_ms=int((time.perf_counter() - start) * 1000))
    response.headers["X-Request-ID"] = current_request_id()
    return response
```

**The schema** — every field the brief asks for, plus `job_id` because the job engine makes it necessary:

| Field | Always | Source |
|---|---|---|
| `ts` | ✓ | formatter |
| `level` | ✓ | logging |
| `event` | ✓ | e.g. `http.request`, `job.start`, `job.done`, `job.error`, `trace.append` |
| `request_id` | ✓ | middleware ContextVar; echoed in `X-Request-ID` |
| `component` | ✓ | `api` / `worker` / `router` / `trace` / `ingest` |
| `status` | ✓ | `ok` \| `error` |
| `latency_ms` | on completion | `perf_counter` |
| `scene_id` | when known | job row |
| `analysis_id` | when known | **= `job_id`** — one identifier, not two. |
| `error_code` | on error | the §1.9 vocabulary |
| `execution_mode` | on job.done | `live` \| `cached_result` |
| `trace_record_hash` | on trace append | `append_record()` return |

`analysis_id` and `job_id` are the same value. Two names for one identifier is how logs become unjoinable.

## 6.3 `/api/system/status` — the judge-visible view

**The screen already exists.** `frontend/app/system/page.tsx` renders `CapabilityStatus` and `RuntimeStatus`, and `RuntimeStatus` already polls `/api/health`. It needs a richer endpoint, not a rebuild.

```python
@router.get("/system/status")
def system_status() -> dict:
    conn = connect()
    counts = dict(conn.execute(
        "SELECT state, COUNT(*) FROM job GROUP BY state").fetchall())
    scenes = conn.execute("SELECT COUNT(*) FROM scene").fetchone()[0]
    verified, chain_message = verify_chain()
    return {
        "api":            "ok",
        "worker":         "running" if worker_alive() else "stopped",
        "queue": {
            "depth":     sum(counts.get(s, 0) for s in PENDING_STATES),
            "capacity":  QUEUE_CAPACITY,
            "by_state":  counts,
        },
        "artifacts":      {"scenes": scenes, "verified": count_verified_scenes()},
        "trace":          {"verified": verified, "message": chain_message,
                           "records": len(records())},
        "capabilities":   capabilities_status(),          # already exists
        "model":          {"name": MODEL_NAME, "cuda": cuda_available()},
        "offline":        {"hf_hub_offline": os.environ.get("HF_HUB_OFFLINE") == "1"},
        "recent_errors":  recent_error_codes(limit=10),   # SELECT from job
    }
```

Every field is a fact read from the database, the filesystem, or the existing registry. Nothing is aspirational. A judge asking "how do I know it isn't faking it?" gets pointed at `trace.verified` and `artifacts.verified`, both of which are recomputed on each request.

Frontend: extend the existing page with a queue-depth row, a trace-verified badge (the `IntegrityBadge` component already exists), and a checksum-verified count. **~2 h of frontend, not a new screen.**

**Logging + status total: 5 h.**

---

# 7. Re-baselined infra timeline

## 7.1 Reality inventory

| Component | Master plan assumption | Verified reality |
|---|---|---|
| Off-event-loop inference | Phase 1 build | **Built** — `router.py:14`, timeout tested |
| Plan validation, all-or-nothing execution | Phase 6 build | **Built** — `executor.py`, 98 % covered |
| Capability allowlist | Phase 6 build | **Built** — `frozenset` enforced at registration |
| Trace forgery resistance | Phase 6 build | **Built** — `router.py:134-164`, 2 tests |
| Hash-chained audit ledger | Phase 1 migrate to SQLite | **Built as JSONL. Leave it.** |
| Upload hardening (6 categories) | Phase 1 build | **Built. All 6 verified rejecting today.** |
| System Status screen | Phase 9 build | **Screen built.** Needs one endpoint. |
| Frontend offline-safety | Phase 9 remediate | **Already clean** — no fonts, no CDN, no tiles |
| — | — | — |
| SQLite anywhere | assumed | **Does not exist** |
| CI | assumed by every phase's exit criteria | **Does not exist** |
| Dockerfile / Compose | assumed | **Do not exist** |
| SHA-256 checksums | assumed | **Do not exist** |
| Dependency pinning for the science stack | assumed | **`requirements.txt` pins nothing** |
| `.python-version` | says 3.11 | **venv is 3.13.0 — stale, will break CI** |
| The GPU box | assumed available | **Not yet rented** |

## 7.2 Schedule

| Window | Track B infra work | h | Floor at end of window |
|---|---|---|---|
| **15–19 Sept** | CI (2 h) · hostile suite + G1/G2/G3 (4 h) · `.python-version` fix (5 min) | **6** | Everything that works today, now *provably* still working on every push |
| **22–28 Sept** | SQLite job engine (14 h) · SHA-256 (3 h) · error-table DRY (1 h) | **18** | Async jobs, durable across kill -9. `/api/analyze` untouched as fallback |
| **29 Sept – 3 Oct** | Structured logging + `/api/system/status` + frontend wiring (5 h) | **5** | Judge-visible status view backed by real facts |
| **6–17 Oct** | *(model/eval phases — Track B on frontend)* | 0 | — |
| **20–31 Oct** | **Docker + Compose, both profiles (8 h)** · `requirements.lock.txt` (0.5 h) | **8.5** | Whole system runs from `docker compose up` |
| **⚠ by 1 Nov** | **RENT THE GPU BOX.** Not later. | — | Everything after this assumes it exists |
| **3–14 Nov** | First real-GPU deploy · live inference end to end · lock the freeze | **6** | Live inference on the real box |
| **17–23 Nov** | **Phase 6 — re-baselined to 6 h**, not 5 days: R1 unbounded timeout · R2 job_id in traces · R3 executor coverage · R5 HTTP-layer unavailability test | **6** | Orchestration hardened; **24 h freed** |
| **24–28 Nov** | **Offline-bundle dress rehearsal, one week early** (uses freed time) · dependency freeze **28 Nov** | **8** | Bundle proven WiFi-off with a week of slack |
| **1–5 Dec** | **Phase 9**: fault drill (8 h) · load probe (3 h) · offline re-verify (4 h) · audit (1 h) | **16** | Every failure mode observed and documented |
| **8–15 Dec** | Finale. **Code freeze.** Infra work = zero. | 0 | — |

**Total ≈ 73.5 h** including the October Docker block and the November GPU bring-up. Front-loaded deliberately: CI and the hostile suite land in week 1 because every later phase's exit criteria depend on them, and they are the two cheapest items on the list.

## 7.3 The three things that will actually hurt

1. **The GPU box is not rented.** Every Phase 9 claim, the Docker GPU profile, the offline bundle size, and live inference all depend on a machine nobody has. **Rent it by 1 Nov.** If it slips to December, Phase 9's fault matrix cannot be executed against the real box and the honest fallback is to run F1/F2/F3/F5/F6 on the Mac and declare F4 (GPU OOM) untested. Say that out loud rather than quietly dropping the row.
2. **The science stack is unpinned.** `torch`, `transformers>=4.49`, `numpy`, `scipy` float freely. `pip install` on the demo box in December will not produce what works in October. `pip freeze > requirements.lock.txt` the day inference first works. 30 minutes; prevents the single most common demo-day failure.
3. **Track B is the binding constraint, not the architecture.** Frontend + job engine + validation + hostile harness + Docker + offline bundle + security + observability + load/fault testing is one person. That is why Phase 6 is re-baselined to 6 hours and why nothing in this document introduces a framework, a message broker, a metrics stack, or an abstraction with one implementation. Every hour spent on infrastructure elegance is an hour not spent on the thing judges actually see.

---

## Appendix — commands behind every "verified" in this document

```bash
# 254 tests pass, 11.3 s, on the full 1.5 GB venv
backend/.venv/bin/python -m pytest -q

# 96 % coverage of backend/* + orchestrator/*
backend/.venv/bin/python -m coverage run -m pytest -q
backend/.venv/bin/python -m coverage report --include='backend/*,orchestrator/*'

# 169 gating tests, 2.64 s, on a SIX-package venv (no torch/transformers/streamlit)
python3 -m venv /tmp/civenv
/tmp/civenv/bin/pip install -r backend/requirements.txt pillow coverage
/tmp/civenv/bin/python -m pytest backend orchestrator -q

# Hostile-input probe: 19 cases incl. a real 389 KB / 400 Mpx PNG bomb
python3 scratchpad/probe.py

# SQLite: WAL, RETURNING, ON CONFLICT idempotency, 1600 commits / 0.22 s, sha256 7.2 ms/20 MiB
python3 scratchpad/dbprobe.py

# SIGKILL mid-transaction -> committed state survives, uncommitted rolls back,
# integrity ok, sweep requeues; 8 threads x 50 rows -> 50 unique claims, no race
python3 scratchpad/killprobe.py

# The exact enqueue/claim/sweep SQL published in §1.3-1.7
python3 scratchpad/sqlprobe.py
```
