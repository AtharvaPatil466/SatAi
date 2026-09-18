# Pair compatibility validation handoff

Status: implemented and locally verified on 2026-09-18. This validates eligibility only; it does not implement optical-SAR fusion or change analysis.

## Contract

Uploads may declare `modality`, `sensor`, `acquisition_timestamp`, comma-separated `polarization`, `pair_group`, and `benchmark_source` as multipart form fields. They are normalized, stored in the scene manifest, and marked `user_declared_upload`; they are not inferred or independently verified. Missing declarations do not block ingestion.

Compatibility results contain:

- `eligible` and `requested_workflow`
- `verified_checks`, structured `failed_checks`, structured `warnings`, and `unknown_metadata`
- `normalized_overlap_ratio`, defined as intersection area divided by the smaller footprint area after bounds-only transformation to EPSG:6933
- approximate `resolution_ratio`, derived from equal-area footprint area and raster dimensions
- `acquisition_interval_seconds` when both timestamps are valid
- `operations_required` and unique `reason_codes`

An incompatible `optical_sar` or `change_vqa` request returns HTTP 422 with this result under `detail`. Validation runs before provider resolution or model dispatch. A compatible request continues to the existing provider boundary; because neither provider exists, it still returns the truthful 503 capability-unavailable response.

## Defaults

| Workflow | Minimum normalized overlap | Maximum resolution ratio | Additional requirements |
|---|---:|---:|---|
| `optical_sar` | 0.80 | 4.00 | One declared optical/multispectral scene, one SAR scene, supported SAR polarization, both sensors and timestamps declared |
| `change_vqa` | 0.90 | 1.25 | Compatible declared modality family, ordered timestamps, same CRS, affine grids aligned within 0.25 pixel |

Supported polarization declarations are `VV`, `VH`, `HH`, and `HV`. Callers of the pure evaluator may override overlap and resolution thresholds explicitly. No request can cause pixel reprojection, resampling, or co-registration.

## Reason codes

| Code | Meaning |
|---|---|
| `scene_manifest_missing`, `scene_manifest_invalid` | A runtime scene has no usable versioned manifest. |
| `second_scene_missing`, `unsupported_workflow` | The requested validation shape is invalid. |
| `modalities_incompatible` | Declared modalities do not match the workflow. |
| `polarization_missing`, `polarization_unsupported` | SAR polarization is absent or outside the supported set. |
| `acquisition_metadata_missing` | Optical-SAR sensor or timestamp declarations are incomplete. |
| `acquisition_time_missing`, `acquisition_order_invalid` | Bi-temporal timestamps are absent or not ordered T1 before T2. |
| `pair_group_mismatch`, `pair_group_missing` | Pair declarations conflict, or are incomplete; missing groups are a warning. |
| `raster_metadata_missing` | A PNG/JPEG or legacy scene has no native raster geometry. |
| `crs_missing`, `affine_transform_missing` | Required affine georeferencing is incomplete. |
| `georeferencing_model_unsupported` | GCP/RPC metadata is preserved but not pair-ready. |
| `footprint_transform_failed` | Bounds cannot be safely transformed for comparison. |
| `overlap_below_threshold`, `resolution_ratio_exceeded` | Measured compatibility falls outside the workflow defaults. |
| `reprojection_required` | CRS differs; this is a warning for optical-SAR and a failure for bi-temporal analysis. |
| `grid_alignment_incompatible` | Bi-temporal grids are not aligned. |
| `grid_alignment_differs` | Optical-SAR grids differ and later processing would need resampling/co-registration; warning only. |

## Evidence

```text
python3 -m pytest -q data/test_scene_manifest.py data/test_pairing.py backend/test_api.py
112 passed, 1 skipped, 11 warnings

python3 -m pytest -q
300 passed, 1 skipped, 11 warnings, 16 subtests passed
```

The warnings are from generated Rasterio fixtures: ten `PendingDeprecationWarning` messages from `from_origin` and one deliberate `NotGeoreferencedWarning`. Frontend tests/build were not rerun because no frontend file or successful response schema changed.

## Limitations

- Declarations establish provenance, not truth. Sensor, modality, date, polarization, group, and benchmark source still require dataset-side verification.
- Coverage uses transformed raster bounds, not exact valid-data polygons; nodata holes and irregular swaths are not measured.
- Resolution is an equal-area approximation suitable for gating, not a sensor-physics measurement.
- GCP/RPC-only rasters fail closed until explicit footprint/grid support is implemented.
- Validation reports required operations but never performs them.
- Compatibility does not prove either unavailable model can use the paired information.

## Native data still required

- Original calibrated SAR measurement bands with polarization and calibration-unit documentation.
- Matching optical/multispectral native bands with verified acquisition and product identifiers.
- Trusted footprints or valid-data polygons, nodata masks, and inspected co-registration evidence.
- Reference maps with dates, semantics, provenance, licensing, and review status.
- Independent geographic groups plus untouched model-selection, calibration, and final-test groups.
- Real fusion/change providers and checkpoints evaluated under those manifests.

The committed SAR PNG renders and manual interpretations remain presentation evidence only and cannot satisfy these requirements.
