import pytest
from rasterio.crs import CRS

from data.pairing import evaluate_compatibility


def scene(
    marker: str,
    *,
    modality: str,
    acquired: str | None,
    sensor: str = "test-sensor",
    polarization: list[str] | None = None,
    origin: tuple[float, float] = (500000.0, 2000000.0),
    resolution: float = 10.0,
    size: int = 100,
    crs: str | None = "EPSG:32643",
    georeferencing_status: str = "affine",
) -> dict:
    scene_id = "scene_" + marker * 32
    left, top = origin
    right, bottom = left + resolution * size, top - resolution * size
    crs_wkt = CRS.from_string(crs).to_wkt() if crs else None
    return {
        "version": "1.0",
        "scene_id": scene_id,
        "source": {
            "filename": f"{marker}.tif",
            "format": "TIFF",
            "sha256": marker * 64,
            "native_path": f"data/runtime/rasters/{scene_id}.tif",
        },
        "preview": {
            "path": f"data/runtime/scenes/{scene_id}.png",
            "sha256": marker * 64,
            "width": size,
            "height": size,
            "derivation": "test",
        },
        "raster": {
            "driver": "GTiff",
            "width": size,
            "height": size,
            "band_count": 1,
            "dtypes": ["uint16"],
            "crs_wkt": crs_wkt,
            "crs_epsg": 32643 if crs else None,
            "transform": [resolution, 0.0, left, 0.0, -resolution, top],
            "bounds": [left, bottom, right, top],
            "resolution": [resolution, resolution],
            "nodata": [0],
            "georeferencing_status": georeferencing_status,
            "pairing_ready": georeferencing_status == "affine",
            "gcp_count": 1 if georeferencing_status == "gcps" else 0,
            "has_rpc": georeferencing_status == "rpc",
            "color_interpretation": ["gray"],
            "preview_bands": [1],
        },
        "identity": {
            "sensor": sensor,
            "modality": modality,
            "acquisition_id": None,
            "acquisition_time": acquired,
            "polarizations": polarization or [],
            "benchmark_source": "generated-test",
            "provenance": {
                "sensor": "user_declared_upload",
                "modality": "user_declared_upload",
                "acquisition_timestamp": "user_declared_upload",
            },
        },
        "grouping": {
            "geographic_group": None,
            "pair_group": "pair-1",
            "paired_scene_ids": [],
            "original_split": None,
            "label_source": None,
        },
    }


def codes(result: dict) -> set[str]:
    return set(result["reason_codes"])


def test_single_image_reports_metadata_readiness_without_requiring_geography() -> None:
    image = scene("a", modality="unknown", acquired=None)
    image["source"]["format"] = "PNG"
    image["source"]["native_path"] = None
    image["raster"] = None

    result = evaluate_compatibility(image, None, "single_image_vqa")

    assert result["eligible"] is True
    assert "source_format_supported" in result["verified_checks"]
    assert "scene_1.modality" in result["unknown_metadata"]
    assert result["normalized_overlap_ratio"] is None


def test_compatible_optical_sar_pair() -> None:
    optical = scene("a", modality="multispectral", acquired="2026-01-01T00:00:00+00:00")
    sar = scene(
        "b",
        modality="sar",
        acquired="2026-01-02T00:00:00+00:00",
        polarization=["VV", "VH"],
    )

    result = evaluate_compatibility(optical, sar, "optical_sar")

    assert result["eligible"] is True
    assert result["normalized_overlap_ratio"] == pytest.approx(1.0)
    assert result["resolution_ratio"] == pytest.approx(1.0)
    assert result["acquisition_interval_seconds"] == 86400
    assert result["failed_checks"] == []


def test_optical_sar_reports_required_grid_operation_without_performing_it() -> None:
    optical = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    sar = scene(
        "b",
        modality="sar",
        acquired="2026-01-02T00:00:00+00:00",
        polarization=["VV"],
        origin=(500010.0, 2000000.0),
    )

    result = evaluate_compatibility(optical, sar, "optical_sar")

    assert result["eligible"] is False
    assert "resampling_or_co_registration" in result["operations_required"]
    assert "grid_alignment_differs" in codes(result)


def test_optical_sar_rejects_different_crs() -> None:
    optical = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    sar = scene(
        "b", modality="sar", acquired="2026-01-02T00:00:00+00:00",
        polarization=["VV", "VH"], crs="EPSG:3857",
    )

    result = evaluate_compatibility(optical, sar, "optical_sar")

    assert result["eligible"] is False
    assert "reprojection_required" in codes(result)


def test_optical_sar_rejects_different_dimensions() -> None:
    optical = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    sar = scene(
        "b", modality="sar", acquired="2026-01-02T00:00:00+00:00",
        polarization=["VV", "VH"], size=50,
    )

    result = evaluate_compatibility(optical, sar, "optical_sar")

    assert result["eligible"] is False
    assert "dimensions_incompatible" in codes(result)


def test_compatible_bitemporal_pair() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene("b", modality="multispectral", acquired="2026-01-11T00:00:00+00:00")

    result = evaluate_compatibility(first, second, "change_vqa")

    assert result["eligible"] is True
    assert result["acquisition_interval_seconds"] == 10 * 86400
    assert "grid_alignment_compatible" in result["verified_checks"]


def test_bitemporal_dimensions_must_match() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene(
        "b", modality="optical", acquired="2026-01-02T00:00:00+00:00", size=50
    )

    result = evaluate_compatibility(first, second, "change_vqa")

    assert result["eligible"] is False
    assert "dimensions_incompatible" in codes(result)


def test_bitemporal_affine_grids_must_match_exactly() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene(
        "b", modality="optical", acquired="2026-01-02T00:00:00+00:00",
        origin=(500010.0, 2000000.0),
    )

    result = evaluate_compatibility(first, second, "change_vqa")

    assert result["eligible"] is False
    assert "grid_alignment_incompatible" in codes(result)


def test_missing_crs_fails_closed() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00", crs=None, georeferencing_status="missing_crs")
    second = scene("b", modality="optical", acquired="2026-01-02T00:00:00+00:00")
    result = evaluate_compatibility(first, second, "change_vqa")
    assert result["eligible"] is False
    assert "crs_missing" in codes(result)
    assert "scene_1.crs" in result["unknown_metadata"]


def test_non_overlapping_footprints_fail() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene("b", modality="optical", acquired="2026-01-02T00:00:00+00:00", origin=(700000.0, 2000000.0))
    result = evaluate_compatibility(first, second, "change_vqa")
    assert result["normalized_overlap_ratio"] == 0.0
    assert "overlap_below_threshold" in codes(result)


@pytest.mark.parametrize(
    ("timestamp", "reason"),
    [
        ("2025-12-31T00:00:00+00:00", "acquisition_order_invalid"),
        (None, "acquisition_time_missing"),
    ],
)
def test_reversed_or_missing_dates_fail(timestamp: str | None, reason: str) -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene("b", modality="optical", acquired=timestamp)
    result = evaluate_compatibility(first, second, "change_vqa")
    assert reason in codes(result)


def test_incompatible_declared_modalities_fail() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene("b", modality="optical", acquired="2026-01-02T00:00:00+00:00", polarization=["VV"])
    result = evaluate_compatibility(first, second, "optical_sar")
    assert "modalities_incompatible" in codes(result)


def test_large_resolution_mismatch_fails() -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00")
    second = scene(
        "b",
        modality="sar",
        acquired="2026-01-02T00:00:00+00:00",
        polarization=["VV"],
        resolution=100.0,
        size=10,
    )
    result = evaluate_compatibility(first, second, "optical_sar")
    assert result["resolution_ratio"] == pytest.approx(10.0)
    assert "resolution_ratio_exceeded" in codes(result)


@pytest.mark.parametrize("status", ["gcps", "rpc"])
def test_gcp_or_rpc_only_scene_is_not_pair_ready(status: str) -> None:
    first = scene("a", modality="optical", acquired="2026-01-01T00:00:00+00:00", georeferencing_status=status)
    second = scene("b", modality="optical", acquired="2026-01-02T00:00:00+00:00")
    result = evaluate_compatibility(first, second, "change_vqa")
    assert result["eligible"] is False
    assert "georeferencing_model_unsupported" in codes(result)
