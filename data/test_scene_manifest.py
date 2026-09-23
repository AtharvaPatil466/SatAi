import copy

import pytest

from data.dataset import validate_scene_manifest


def manifest() -> dict:
    scene_id = "scene_" + "a" * 32
    return {
        "version": "1.0",
        "scene_id": scene_id,
        "source": {
            "filename": "scene.tif",
            "format": "TIFF",
            "sha256": "b" * 64,
            "native_path": f"data/runtime/rasters/{scene_id}.tif",
        },
        "preview": {
            "path": f"data/runtime/scenes/{scene_id}.png",
            "sha256": "c" * 64,
            "width": 8,
            "height": 6,
            "derivation": "2nd-98th percentile display stretch",
        },
        "raster": {
            "driver": "GTiff",
            "width": 8,
            "height": 6,
            "band_count": 2,
            "dtypes": ["uint16", "uint16"],
            "crs_wkt": None,
            "crs_epsg": None,
            "transform": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            "bounds": [0.0, 0.0, 8.0, 6.0],
            "resolution": [1.0, 1.0],
            "nodata": [None, None],
            "georeferencing_status": "missing_crs",
            "pairing_ready": False,
            "gcp_count": 0,
            "has_rpc": False,
            "color_interpretation": ["gray", "undefined"],
            "preview_bands": [1],
        },
        "identity": {
            "sensor": None,
            "modality": "unknown",
            "acquisition_id": None,
            "acquisition_time": None,
            "polarizations": [],
            "benchmark_source": None,
            "provenance": {},
        },
        "grouping": {
            "geographic_group": None,
            "pair_group": None,
            "paired_scene_ids": [],
            "original_split": None,
            "label_source": None,
        },
    }


def test_scene_manifest_accepts_explicit_missing_georeferencing() -> None:
    value = manifest()
    assert validate_scene_manifest(value) is value


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("transform", [1, 0, 0]),
        ("bounds", [0, 0, 1]),
        ("resolution", [1]),
    ],
)
def test_scene_manifest_rejects_malformed_raster_coordinates(
    field: str, value: list[int]
) -> None:
    candidate = copy.deepcopy(manifest())
    candidate["raster"][field] = value
    with pytest.raises(ValueError, match=field):
        validate_scene_manifest(candidate)


def test_scene_manifest_rejects_paths_outside_runtime() -> None:
    candidate = manifest()
    candidate["source"]["native_path"] = "../../secret.tif"
    with pytest.raises(ValueError, match="data/runtime"):
        validate_scene_manifest(candidate)


def test_scene_manifest_rejects_false_pairing_readiness() -> None:
    candidate = manifest()
    candidate["raster"]["pairing_ready"] = True
    with pytest.raises(ValueError, match="readiness"):
        validate_scene_manifest(candidate)


def test_scene_manifest_rejects_invalid_paired_scene_id() -> None:
    candidate = manifest()
    candidate["grouping"]["paired_scene_ids"] = ["../other-scene"]
    with pytest.raises(ValueError, match="paired ids"):
        validate_scene_manifest(candidate)
