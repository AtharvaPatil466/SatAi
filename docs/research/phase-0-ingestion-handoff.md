# GeoTIFF ingestion handoff

Status: implemented and locally verified on 2026-09-18.

## Identity

- Repository remote: `sat-ai = https://github.com/AtharvaPatil466/SatAi.git`
- Branch: `feat/video-integration`
- Base revision: `6c286b0681023deef4c4f776832ba68414e541ac`
- Manifest version: `1.0`
- Existing untracked `.vscode/` was not touched.

Relevant source SHA-256 values after implementation:

| Path | SHA-256 |
|---|---|
| `data/dataset.py` | `9392d01147271e09af0adc0623142881d16eef1a237c58b553db4674e86ae68e` |
| `backend/services.py` | `e6a20c24215076065dbe004c30c0b9319acd834b4aeafa9acb39e6a018a86047` |
| `backend/schemas.py` | `44a52f6c44c2a1101762d5e3657b5a82385b15e9df622e1e5a322d223fc75a37` |
| `backend/test_api.py` | `bac370583afe30e8a267abc75b8d5c9b4f4e53b62512cf3647ba9b9221e9721d` |
| `data/test_scene_manifest.py` | `3697249c4d64777297d22a218dd1ef7586e7cdfe64cab0fb4e6a64161d99690f` |

## Implemented behavior

- TIFF is detected from its byte signature and decoded driver, not its filename or MIME type.
- Original TIFF bytes are stored unchanged under `data/runtime/rasters/`; bounded PNG previews and versioned JSON manifests are stored separately under `data/runtime/scenes/` and `data/runtime/manifests/`.
- Manifests record hashes, raster shape, bands, dtypes, CRS, affine transform, bounds, resolution, nodata, color interpretation, preview bands, and explicit georeferencing status.
- Missing CRS or affine transforms are accepted but are not pair-ready. GCP/RPC rasters are identified but also remain non-pair-ready until those models are supported by pairing validation.
- The upload remains capped at 20 MiB; decoded rasters are capped at 100 million pixels, 32 bands, and a 2048-pixel preview edge.
- Storage failures remove native, preview, manifest, and temporary files. Existing PNG/JPEG, scene-pack, grounding, and pairwise request behavior is unchanged.

## Verification

```text
python3 -m pytest -q data/test_scene_manifest.py backend/test_api.py
93 passed, 1 skipped, 6 warnings

python3 -m pytest -q
281 passed, 1 skipped, 6 warnings, 16 subtests passed

cd frontend && npm test -- --run
15 files passed, 98 tests passed

cd frontend && npm run build
Compiled successfully; TypeScript and nine static pages passed
```

The six Python warnings are fixture/runtime warnings: five Rasterio `PendingDeprecationWarning` messages from `from_origin` and one expected `NotGeoreferencedWarning` while creating the deliberately ungeoreferenced fixture.

## Missing pilot data

| Required evidence | Current state |
|---|---|
| Native calibrated SAR bands | Missing; the five committed SAR assets are display PNGs, not native measurement rasters. |
| Polarization and calibration units | Missing from benchmark-ready native assets. |
| Matching optical bands | Missing. |
| Verified acquisition IDs and dates for both modalities | Incomplete; SAR job metadata alone is insufficient. |
| CRS, footprints, resolution, nodata, and valid-pixel masks for paired inputs | No paired source assets are present to validate. |
| Co-registration and alignment tolerance | Missing and cannot be inferred from previews. |
| Reference maps | Missing dates, semantics, provenance, license, and inspected source pixels. |
| Geographic groups and untouched final-test groups | Not defined. |
| Reviewed benchmark targets | Not generated; benchmark work remains gated on the source data above. |
| Trained fusion/change checkpoints | Missing; no training was run in this phase. |

Next entry condition: provide representative native optical/SAR pairs and reference metadata, then implement pair validation against these manifests before geographic splitting or benchmark generation.
