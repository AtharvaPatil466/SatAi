# Phase 2 bounded BigEarthNet data acquisition handoff

Status: bounded official metadata acquired and audited on 2026-09-19. A deterministic BigEarthNet candidate pilot is locked, and two bounded real CDSE S1/S2 Sensor Necessity experiments are frozen. No model training was performed, and external imagery remains gitignored.

## Sources and storage

The machine had 40,960,000,000 free bytes before acquisition, above the required 5 GB floor. The complete downloaded batch is **753,537,557 bytes**, below the 1 GB cap. Files live under the gitignored `data/external/bigearthnet/`; only their registry and derived manifests are tracked.

| Resource | Bytes | Local SHA-256 |
|---|---:|---|
| BigEarthNet.txt parquet | 466,819,745 | `d3b97f999456016bb13c2a8e94b8f47825654f07a0394a6b266a38b750ca1554` |
| BigEarthNet v2 metadata | 3,616,349 | `408911df2da7092da9ecc72071972a808ec486ba09f6cb048f7716793d14ded6` |
| Snow/cloud/shadow metadata | 710,162 | `b6842b35359dfb5281dd92c674211fd4882f7865f0b442ebfec92daea6371c4e` |
| Reference maps archive | 282,391,301 | `d87bda4759d6b209fad71cd8e95968abedd7eda8b63838d2b5a6462bdc788756` |

`data/manifests/bigearthnet/source-registry.v1.json` records canonical URLs, dataset versions, CDLA-Permissive-1.0 licensing, retrieval time, byte sizes, Hugging Face ETag/revision or Zenodo record revision and MD5, local SHA-256, local paths, and official/mirror status. All four resources are official distributions. The arXiv paper was consulted but not downloaded as a dataset artifact.

## Reproduced annotation statistics

The audit streamed the official parquet with PyArrow. Full queries and machine-readable output are in `data/bigearthnet_pilot.py` and `data/manifests/bigearthnet/annotation-audit.v1.json`.

- Rows: **9,553,962**
- Unique `patch_id`: **464,044**
- Unique `s1_name`: **464,044**
- Unique S1–S2 pairs: **464,044**
- Missing IDs, patch names, S1 names, splits, countries, or seasons: **0**
- Malformed patch names, S1 names, or splits under the documented naming grammar: **0**
- Duplicate annotation IDs: **0**
- Within-patch conflicts in S1 name, split, country, season, coordinates: **0**

| BigEarthNet.txt split | Annotation rows | Unique pairs |
|---|---:|---:|
| train | 4,674,281 | 229,114 |
| validation | 2,454,690 | 118,095 |
| test | 2,409,962 | 115,753 |
| bench | 15,029 | 1,082 |

`bench` is the manually verified BigEarthNet.txt subset. Its underlying BigEarthNet v2 metadata split remains `test`; both values are preserved rather than rewritten.

Task-type counts are binary 3,625,160; MCQ 3,259,184; bounding box 2,205,686; captioning 463,932. Category counts are adjacency 1,222,128; area 1,390,845; climate zone 463,637; count 1,390,730; country 463,274; point 1,143,883; presence 1,391,053; reference 1,061,803; relative position 99,015; season 463,662; and literal category `None` 463,932.

Unique-scene country coverage is Austria 41,890; Belgium 10,171; Finland 151,443; Ireland 44,909; Kosovo 1,571; Lithuania 46,857; Luxembourg 3,251; Portugal 87,111; Serbia 72,220; Switzerland 4,621. Season coverage is Fall 136,424; Spring 159,890; Summer 95,033; Winter 72,697.

### Explicit sensor-term query

For each batch, the audit applied case-insensitive whole-token RE2 patterns to `input`, `output`, and their concatenation. It searched `SAR`, `radar`, `Sentinel-1`, `polarization`/`polarisation`, `VV`, `VH`, `backscatter`, and `optical`. Every term returned **0 input rows, 0 output rows, and 0 rows in either field**. Exact patterns are saved in the audit artifact.

These are text counts only. They do **not** prove that the annotations contain no SAR supervision or that SAR pixels are unnecessary; the labels were not audited against real paired pixels in this batch.

## Mapping result

The two BigEarthNet v2 metadata parquets contain 549,488 unique patches with no duplicate patch IDs or conflicting S1 mappings. Every one of the 464,044 annotated patches joined to metadata, and every joined `s1_name` agreed: **0 unresolved patch IDs and 0 S1 mapping mismatches**.

Expected archive members are derived from the official v2 naming specification and recorded per candidate. The selected reference-map members were checked against the actual archive: **100/100 present**. S1 and S2 member existence remains unverified because those archives were intentionally not downloaded.

## Locked pilot candidates

- Selection seed: **260329630**
- Manifest SHA-256: **`4bd30aef67b97f100d2076604cde98b010722cd51d92501ea5a54153bc051541`**
- Unique S1–S2 pairs: **100**
- Grouped annotations: **1,770**; every annotation for a selected patch is included
- Distinct encoded ground cells: **100**
- Split balance: 25 each from train, validation, test, and bench
- Country balance: 9–11 pairs per country across all 10 countries
- Season balance: 25 each for Fall, Spring, Summer, and Winter
- Land cover: all 19 available BigEarthNet v2 aggregate classes represented

Test candidates are marked `official_test_evaluation_only`; bench candidates are marked `manual_benchmark_evaluation_only`. Neither can be used for training or calibration. Validation candidates are explicitly `model_selection_or_calibration_not_both`. The pilot does not create questions or claim statistical sufficiency.

## Reference-map inspection

The archive has 549,488 files and an estimated extracted size of 533,265,639 bytes. Only the 100 selected maps were extracted, totaling 89,481 bytes. All are single-band 120×120 `uint16` GeoTIFFs at 10 m resolution with nodata value 0. They span EPSG:32629, 32631, 32632, 32633, 32634, and 32635; every map has its own affine transform. The only common TIFF tag is `AREA_OR_POINT=Area`.

Dates are parsed from the S2 patch identifier and are not present as TIFF date tags. Observed CLC IDs, pixel counts, checksums, CRS, transforms, bounds, and the official CLC-to-19-class definitions are recorded in `reference-map-audit.v1.json`. The maps derive from CLC2018 v2020_u1 and are reference annotations, not flawless pixel-level ground truth.

## BigEarthNet imagery access decision

Official imagery is available only as monolithic archives:

- `BigEarthNet-S1.tar.zst`: 54,439,153,171 bytes
- `BigEarthNet-S2.tar.zst`: 63,251,710,377 bytes
- Combined: **117,690,863,548 bytes**

Zenodo supports byte ranges, but `.tar.zst` compression does not provide safe random per-member retrieval. Fetching selected members would still require transferring the full compressed streams. No official per-patch API or approved Kaggle mount containing the exact v2 pilot files was found. Located Kaggle datasets are third-party: one is v1 S1 data and one is a Serbia/Summer v2 subset, so neither can satisfy this balanced manifest. The TorchGeo Hugging Face copy is also a third-party full-archive mirror and was not used.

The next local step requires a machine or mounted volume with at least 125 GB free for the two compressed archives plus selected extraction headroom:

```bash
curl -fL -C - -o /volume/bigearthnet/BigEarthNet-S1.tar.zst https://zenodo.org/api/records/10891137/files/BigEarthNet-S1.tar.zst/content
curl -fL -C - -o /volume/bigearthnet/BigEarthNet-S2.tar.zst https://zenodo.org/api/records/10891137/files/BigEarthNet-S2.tar.zst/content
mkdir -p /volume/bigearthnet/pilot
tar -xf /volume/bigearthnet/BigEarthNet-S1.tar.zst -C /volume/bigearthnet/pilot -T data/manifests/bigearthnet/s1-members.v1.txt
tar -xf /volume/bigearthnet/BigEarthNet-S2.tar.zst -C /volume/bigearthnet/pilot -T data/manifests/bigearthnet/s2-members.v1.txt
```

Verify the official Zenodo MD5 values before extraction: S1 `a55eaa2cdf6a917e296bd6601ec1e348`; S2 `2245ed2d1a93f6ce637d839bc856396e`. Then inspect all selected native bands, CRS, transforms, nodata, calibration units, polarization, acquisition times, and pair alignment before generating targets.

## Bounded CDSE Sensor Necessity experiments

The 54.4 GB S1 and 63.3 GB S2 BigEarthNet archives were not downloaded because their combined 117,690,863,548-byte transfer is monolithic and cannot safely retrieve selected `.tar.zst` members by byte range. Instead, the official CDSE Catalog API selected two independently located acquisitions, and the Sentinel Hub Process API returned only bounded, co-gridded S1 VV/VH and S2 B02/B03/B04/B08 samples. Raw TARs, GeoTIFFs, userdata, and PNG inspection renders remain under gitignored `data/external/`; reproducible identifiers, processing semantics, checksums, and results are tracked in `data/manifests/cdse/`.

The Jiangsu construction scene used a deterministic optical-and-SAR proxy rule and retained 117,496 correctly aligned support pixels versus 19,455 after a cyclic SAR mismatch, a 6.039× ratio and 83.442% reduction. The rule was then frozen without retuning and applied to the Rotterdam replication: 65,102 correctly aligned pixels versus 8,114 mismatched pixels, an 8.023× ratio and 87.536% reduction. The fixed NDWI, VV, and VH thresholds moved by +8.817, −0.931, and −1.365 percentile points respectively, all below the declared 10-point materiality threshold.

These results are **deterministic proxy benchmark construction; not semantic ground truth and not model performance**. NDWI and joint low backscatter can respond to non-water conditions; the cyclic shift is a distribution-preserving spatial control rather than another acquisition; S1 Process userdata does not echo the selected product ID; and two scenes do not establish broad generalization.

The exact next project phase is **video/demo integration**: present the frozen rule, correct-versus-mismatched controls, provenance, and limitations using the tracked manifests without shipping raw external imagery or introducing training claims.

## Limits and future requirement

BigEarthNet covers 10 European countries and cannot establish India-wide generalization. A later India evaluation needs geographically distributed, independently held-out, co-registered Sentinel-1/Sentinel-2 samples across relevant Indian regions, seasons, land-cover regimes, and acquisition conditions. No national download was started.

The frozen two-scene Sensor Necessity artifact is intentionally narrow. It supports the video/demo narrative for spatial correspondence, but it does not establish semantic accuracy, model performance, or geographic generalization.
