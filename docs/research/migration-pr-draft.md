# Draft PR: migrate post-Phase-0 SatQuery core

## Summary

Migrate the reusable post-Phase-0 backend, model, data research, test, and documentation work from SatAi into canonical SatQuery while retaining canonical history and frontend behavior. The branch adds Grounding DINO, pair-aware ingestion and provenance, offline provider readiness, deterministic optical-SAR and bi-temporal analysis, and an offline RSVQA-LR QLoRA pipeline.

## Source provenance

- Grounding and bounded fixtures: SatAi `4d43caa`, `ff568a9`, `0a18dda`, `6f68da9`.
- Pair ingestion and research: `e92030b`, `10edaa1`, `fe9a56d`, `9d2c407`.
- Execution provenance: `42f775f`, `0aa390f`.
- Readiness and GPU infrastructure: `22039b2`, `b5d0418`, `6fce359`, `7eb5c91`, `b1868b0`, `a104505`, `ad9cbdb`, `1c8cba1`.
- Deterministic optical-SAR: `0e7119293d5d9e309793362ab28aa06fa01fd3b2`.
- Deterministic change: `53dafecb67ed5c1e2879229209a41846053a442b`.
- Adaptation pipeline: `f8438be80eca353d63cbfd58426cd900a3635789`.

Mixed commits were curated file by file. SatAi frontend/video work, generated evaluation outputs, runtime data, external rasters, model weights, and checkpoints were excluded.

## Capabilities

- Grounding DINO Swin-T with offline config/checkpoint discovery, CUDA placement checks, normalized bounding boxes, and DIOR-RSVG evaluation tooling.
- TIFF/GeoTIFF ingestion, declared-versus-observed provenance, compatibility reason codes, and fail-closed pair gating.
- Explicit `live` versus `cached_result` execution semantics and trace identity propagation.
- Deterministic optical-SAR evidence from Sentinel-2 indices and Sentinel-1 backscatter.
- Deterministic bi-temporal spectral/RGB visual-difference evidence with an uncalibrated strict `> 0.1` threshold.
- RSVQA-LR manifest validation, configurable QLoRA dry-run/training, training report, and held-out base-versus-adapter comparison.

## Verification

- CPU fixture and contract suites cover routing, readiness, artifacts, paired grids, numerical invalid data, evidence structures, trace semantics, manifest leakage, and CLI import/help paths.
- Historical source evidence records successful live Qwen and Grounding DINO provider smoke on Kaggle Tesla T4 and one bounded real optical-SAR deterministic smoke.
- No GPU inference or training was rerun during migration.

## Known limits

- No remote-sensing adapter has been trained.
- No adapted-model improvement, CDVQA result, optical-SAR accuracy, or ISRO/SAC performance is claimed.
- RGB change is a visual-difference heuristic and produces no semantic conclusion.
- Multi-step change-to-grounding execution remains unavailable.
- A real bi-temporal smoke is still pending.
- Model/dataset artifacts remain externally provisioned and ignored by Git.

## Review focus

1. Canonical API compatibility and explicit cache/live behavior.
2. Pair validation before deterministic provider dispatch.
3. Offline artifact/readiness behavior and CUDA-only Grounding path.
4. Scientific wording and null-confidence boundaries.
5. Exclusion of all `frontend/**` paths and large/generated artifacts.
