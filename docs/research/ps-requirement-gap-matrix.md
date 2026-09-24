# SIH26167 requirement gap matrix

Status is based on executable canonical code, tests, and retained measurement records. A fixture test proves a contract; a smoke proves execution; neither proves accuracy.

| Requirement | Status | Evidence | Next required evidence |
|---|---|---|---|
| Supported image upload | COMPLETE | `POST /api/scenes`, `backend/services.py`, and `backend/test_api.py` validate size, format, corrupt content, and storage. | Exercise the reviewed branch in the deployed environment. |
| GeoTIFF/TIFF ingestion | COMPLETE | Native TIFF bytes and observed raster metadata are retained by `backend/services.py`; generated GeoTIFF tests cover affine, CRS, dimensions, and missing georeferencing. | Test representative ISRO/SAC products without asserting metadata the raster does not contain. |
| PNG/JPEG benchmark scope | COMPLETE | Controlled PNG/JPEG ingestion and repository fixtures are tested; these formats are not assigned invented geospatial metadata. | Keep benchmark provenance alongside every imported fixture. |
| Single-image VQA | COMPLETE | `qwen2.5vl-3b` routes through the live provider, readiness gate, evidence/trace contract, and explicit cache replay. Historical Kaggle T4 smoke is recorded in `docs/gpu-smoke.md`. | Run held-out remote-sensing evaluation after adapter training. |
| Captioning or grounding | COMPLETE | Grounding DINO Swin-T provider, normalized boxes, DIOR-RSVG evaluation harness, and bounded fixture are present. Historical T4 provider smoke passed. | Execute the full locked grounding evaluation and report failures as well as aggregate metrics. |
| Bi-temporal analysis | PARTIAL | `change-deterministic` measures spectral-index or RGB visual differences for compatible T1/T2 pairs and emits spatial evidence. | Run one provenance-complete real pair smoke, then add a semantic method and held-out evaluation if semantic Change-VQA is required. |
| Optical-SAR joint analysis | PARTIAL | `optical-sar-deterministic` consumes both co-registered modalities and reports optical indices, SAR backscatter, joint coverage, and provenance. A historical bounded real-pair smoke is documented. | Evaluate on labeled held-out pairs; train a fusion model only if the product requirement needs learned semantic output. |
| Agentic orchestration | PARTIAL | Deterministic planning, provider registry, readiness gating, single-step execution, and trace persistence are implemented. Multi-step change-to-grounding plans are represented but explicitly non-executable. | Define and test an intermediate spatial artifact contract before enabling multi-step execution. |
| Pair compatibility validation | COMPLETE | `data/pairing.py` checks modality, time order, polarization, footprint overlap, resolution, dimensions, CRS, and affine grid and fails closed before dispatch. | Validate against representative mission products and trusted metadata. |
| Visual evidence | PARTIAL | Grounding returns normalized boxes; change returns a normalized changed extent; optical-SAR returns measured distributions and coverage. | Add render/export support for change masks and joint maps if required by the judging workflow. |
| Confidence handling | PARTIAL | Qwen, optical-SAR, and change return `null` when confidence is not calibrated. Grounding exposes bounded model detection scores. | Calibrate and label any confidence shown as calibrated; otherwise retain `null` or identify raw scores clearly. |
| Execution summary and audit | COMPLETE | API responses include model identity, execution mode, evidence, and hash-chained trace with inputs, planner rule, parameters, and output. | Exercise trace recovery and verification in the target deployment. |
| Remote-sensing VLM adaptation | BLOCKED ON GPU/DATA | Offline RSVQA-LR manifest, QLoRA training, dry-run, report, and base-versus-adapter evaluation code exists. No adapter has been trained. | Provision official RSVQA-LR plus the local Qwen checkpoint, pass the Kaggle gradient dry run, train, and evaluate validation before touching test. |
| Benchmark evaluation | PARTIAL | Frozen Qwen RSVQA and resolution artifacts predate this migration; grounding and adapter evaluation runners exist. No CDVQA, adapted-model, or optical-SAR accuracy result exists. | Reproduce selected locked evaluations on the reviewed canonical commit and retain reports with model/dataset identity. |
| Downloadable report | NOT STARTED | JSON smoke, training, evaluation, API result, and trace artifacts exist, but there is no user-facing packaged report download. | Decide the report contents and add an export endpoint/UI only after the evidence schema is accepted. |
| ISRO/SAC evaluation readiness | BLOCKED ON GPU/DATA | Input validation, provenance, deterministic baselines, GPU runners, and audit traces provide infrastructure. No representative ISRO/SAC dataset evaluation is recorded. | Obtain authorized representative data, lock splits/metrics, run on the target GPU, and retain provenance-complete reports. |

## Immediate evidence priorities

1. Publish and review this migration branch without altering canonical `main`.
2. Provision RSVQA-LR and the pinned local Qwen checkpoint on Kaggle; run the one-sample QLoRA dry run.
3. Run the bounded adapter training configuration, then compare base and adapter on validation.
4. Provision one official bi-temporal pair and execute the documented change smoke.
5. Reproduce the selected GPU and evaluation reports on the reviewed canonical commit.
