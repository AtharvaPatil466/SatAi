# Optical/SAR sensor necessity — Hyderabad reservoirs, 2020

Status: **pre-registered** (this section was committed before any metric was computed).

## Question

Where Sentinel-2 is optically obstructed, does Sentinel-1 recover open-water / land separation that optical alone cannot, when both are judged against a reference that is independent of both sensors?

## Case design

- AOI: lon/lat bbox `78.28, 17.30, 78.50, 17.45` (Osman Sagar, Himayat Sagar, Hussain Sagar and surrounding urban/rural land, Hyderabad, Telangana).
- Grid: native S2 10 m grid of MGRS tile 44QKE (EPSG:32644), snapped outward around the bbox: 2363 × 1694 pixels.
- Source: Microsoft Planetary Computer STAC, anonymous access. `sentinel-2-l2a` (Copernicus Sentinel data terms), `sentinel-1-rtc` (CC-BY-4.0), `jrc-gsw` (JRC Global Surface Water, Pekel et al. 2016; attribution required).
- Dates were selected by S2 tile cloud cover and S1–S2 time separation only, before any metric was computed. All three share S1 relative orbit 165 (descending) and S2 relative orbit 19.

| Case | Role | S2 item | S1 item | S1–S2 separation |
|---|---|---|---|---|
| hyderabad-20200717 | cloudy test (tile cloud 48.4%) | `S2A_MSIL2A_20200717T050701_R019_T44QKE_20200816T104934` | `S1A_IW_GRDH_1SDV_20200717T003854_20200717T003919_033487_03E166_rtc` | ~4.5 h |
| hyderabad-20200915 | cloudy test (tile cloud 91.5%) | `S2A_MSIL2A_20200915T050701_R019_T44QKE_20200918T110717` | `S1A_IW_GRDH_1SDV_20200915T003857_20200915T003922_034362_03FEE7_rtc` | ~4.5 h |
| hyderabad-20201114 | clear-sky control (tile cloud 2.5%) | `S2A_MSIL2A_20201114T051051_R019_T44QKE_20201116T113004` | `S1A_IW_GRDH_1SDV_20201114T003858_20201114T003923_035237_041D68_rtc` | ~4.5 h |

S2 B02/B03/B04/B08 are read on their native grid without resampling (processing baseline 02.12, so no −1000 DN offset). The S1 RTC grid of every case was verified to be pixel-aligned with the S2 grid, so S1 was read without resampling. SCL (20 m) and GSW (EPSG:4326, 0.00025°) were mapped to the grid with nearest neighbour. Per-file SHA-256, unsigned asset URLs, and retrieval times are in `data/manifests/optical-sar/hyderabad-2020.v1.json`. Rasters stay outside git.

## Reference (independent of S1 and S2)

- Reference water: GSW occurrence ≥ 90 %, eroded 3 px (30 m).
- Reference land: GSW occurrence = 0 %, eroded 3 px.
- Every other pixel (transitional 1–89 %, nodata, boundary) is excluded.

GSW is Landsat-derived (1984–2020). Pixels that were water in ≥ 90 % of 37 years of observations, or never water, are assumed to hold that state on the test date. This assumption is weakest at reservoir margins, which the thresholds and erosion exclude.

## Methods (thresholds frozen, not retuned)

Thresholds are read at run time from the frozen CDSE rule in `data/manifests/cdse/sensor-necessity-results.v1.json`. That rule was constructed on Jiangsu and replicated on Rotterdam; it has never seen this AOI.

- optical-only: NDWI `(B03−B08)/(B03+B08)` > 0.048095703125
- SAR-only: VV ≤ 0.053388 **and** VH ≤ 0.009292 (linear γ⁰)
- fusion (frozen AND): optical-only ∧ SAR-only, pixel level (component filtering and boundary targets of the proxy benchmark are not applied)
- fusion (cloud-gated): SAR-only where S2 SCL ∈ {3 cloud shadow, 8, 9 cloud, 10 thin cirrus}, optical-only elsewhere

## Metrics

On joint-valid pixels, stratified into all / optically clear / optically obstructed:

- water recall = TP/(TP+FN)
- land specificity = TN/(TN+FP)
- balanced accuracy = mean of the two
- water IoU = TP/(TP+FN+FP)

A stratum is evaluable only with ≥ 500 reference pixels of each class. Pixels are spatially autocorrelated, so pixel counts are not independent samples and no pixel-level confidence intervals are reported. The unit of replication is the case: 3 dates, 1 AOI.

## Pre-declared hypotheses

- **H1 (necessity):** on both cloudy test dates, in the optically obstructed stratum, SAR-only balanced accuracy exceeds optical-only by ≥ 0.10.
- **H2 (fusion value):** on both cloudy test dates, cloud-gated fusion balanced accuracy on all pixels is ≥ both optical-only and SAR-only.
- **H3 (control, no necessity when clear):** on the clear control date, in the optically clear stratum, optical-only balanced accuracy is ≥ SAR-only. If H3 fails, SAR would be adding value even without cloud, and the cloudy-date gain cannot be attributed to obstruction alone.

Each experiment's status records whether it executed with complete evidence (PASSED / FAILED / INCONCLUSIVE). Hypothesis outcomes are reported separately.
