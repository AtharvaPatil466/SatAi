# Deterministic optical–SAR baseline

SatQuery's `optical_sar` capability executes a non-learned baseline named `optical-sar-deterministic`, version `sentinel2-indices__sentinel1-backscatter-v1`. It demonstrates joint extraction from an already co-registered Sentinel-2/Sentinel-1 pair. It does not establish fusion-model accuracy.

## Input contract

The API pair-compatibility check requires exactly one declared optical or multispectral scene and one declared SAR scene, sensor and acquisition timestamps, supported SAR polarizations, sufficient footprint overlap, affine georeferencing, identical CRS, identical dimensions, and identical affine transforms. Pairs requiring reprojection, resampling, or co-registration fail closed because this baseline does not alter pixels.

The provider accepts either input order and identifies the modalities from their band counts. Its optical raster contract is B02, B03, B04, B08, dataMask; its SAR contract is VV, VH, dataMask. When GeoTIFF band descriptions exist, they must exactly match those orders. Files without descriptions use this explicit positional contract. Both native rasters are required, and at least one pixel must be finite, mask-valid, and shared by both modalities.

## Evidence

Optical evidence contains valid-pixel counts and continuous NDVI `(B08-B04)/(B08+B04)` and McFeeters-style NDWI `(B03-B08)/(B03+B08)` summaries. Zero denominators and non-finite samples are excluded. The baseline reports mean and 5th, 50th, and 95th percentiles; it applies no land-cover threshold and assigns no semantic class.

SAR evidence treats VV and VH inputs as linear backscatter coefficients. Positive finite samples are converted with `10*log10(value)` and summarized by mean and the same percentiles. It also summarizes `VV_dB - VH_dB`. No backscatter threshold or physical label is inferred.

Joint evidence records co-valid pixel count and fraction, CRS, width, height, both modality names, input paths, and SHA-256 values. The response confidence is `null`. The trace identifies the provider, both raster paths, both scene IDs, input modality order, planner rule, and execution mode `live`.

## Real pair smoke

One local operational smoke run used the bounded Copernicus Data Space pair in `data/external/satquery-s1-s2-20200523/`. This is a single execution check, not an evaluation sample.

- Optical: `s2/s2.tif`, SHA-256 `64b6ee2370f4085d8490d4e773de8bd11b8cb1129ffa92c1ba80522934296da8`
- SAR: `s1/s1.tif`, SHA-256 `5d0eee03584dd5e35e9bf37f1ddcc3d6a3927c245b52af5a54355c55265e8bfd`
- Grid: EPSG:4326, 1024×744, 761,856 total pixels
- Optical valid pixels: 761,856
- SAR and joint valid pixels: 761,854
- Joint valid fraction: 0.9999973748319892
- NDVI mean/p05/p50/p95: 0.2107968024 / -0.5061320812 / 0.2804544866 / 0.7782190740
- NDWI mean/p05/p50/p95: -0.2217054217 / -0.6927453876 / -0.3459256738 / 0.5921052098
- VV dB mean/p05/p50/p95: -9.4232048971 / -19.5826117516 / -9.2263188362 / 0.3569308206
- VH dB mean/p05/p50/p95: -17.1406360333 / -28.9988856316 / -16.2674579620 / -8.4117143631
- VV-minus-VH dB mean/p05/p50/p95: 8.0168410538 / 2.6344186187 / 7.4111845493 / 15.6784988403
- Provider latency observed locally: 0.119277 seconds
- Result: successful joint extraction with `confidence: null`

## Limitations and next step

The summaries describe distributions across the shared raster and do not localize objects, learn cross-modal features, resolve clouds, infer land-cover labels, or measure accuracy. Fixed positional band order is required when descriptions are absent. The real pair's two non-finite VV/VH pixels are excluded.

A future learned baseline can replace the summary provider with spatially aligned optical and SAR encoders plus a measured downstream task. That work needs train/validation/test data, explicit labels, evaluation metrics, and retained provenance; none are implied by this baseline.
