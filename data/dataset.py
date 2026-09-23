"""Canonical tile and persisted scene-manifest schemas."""

import re
from pathlib import PurePosixPath
from typing import Any, Literal, TypedDict

import numpy as np
from numpy.typing import NDArray

Sensor = Literal["S2", "S1", "cartosat", "risat", "loveda", "dota", "synthetic"]
SCENE_MANIFEST_VERSION = "1.0"
_SCENE_ID = re.compile(r"scene_[0-9a-f]{32}")
_SHA256 = re.compile(r"[0-9a-f]{64}")


class TileSample(TypedDict):
    id: str
    optical: NDArray[np.float32]  # float32[C,H,W]
    sar: NDArray[np.float32] | None  # float32[3,H,W] or None
    optical_t2: NDArray[np.float32] | None  # float32[C,H,W] or None
    gsd: float
    sensor: Sensor
    meta: dict[str, Any]


class SceneManifest(TypedDict):
    version: Literal["1.0"]
    scene_id: str
    source: dict[str, Any]
    preview: dict[str, Any]
    raster: dict[str, Any] | None
    identity: dict[str, Any]
    grouping: dict[str, Any]


def _runtime_path(value: object) -> bool:
    if not isinstance(value, str):
        return False
    path = PurePosixPath(value)
    return (
        not path.is_absolute()
        and path.parts[:2] == ("data", "runtime")
        and ".." not in path.parts
    )


def _numbers(value: object, length: int) -> bool:
    return (
        isinstance(value, list)
        and len(value) == length
        and all(
            isinstance(item, (int, float)) and not isinstance(item, bool)
            for item in value
        )
    )


def validate_scene_manifest(manifest: SceneManifest) -> SceneManifest:
    """Reject unsafe or internally inconsistent persisted scene metadata."""
    if manifest.get("version") != SCENE_MANIFEST_VERSION:
        raise ValueError("Unsupported scene manifest version")
    if not _SCENE_ID.fullmatch(str(manifest.get("scene_id", ""))):
        raise ValueError("Invalid scene manifest id")
    source, preview = manifest.get("source"), manifest.get("preview")
    if not isinstance(source, dict) or not isinstance(preview, dict):
        raise ValueError("Scene manifest assets are missing")
    if source.get("format") not in {"PNG", "JPEG", "TIFF"}:
        raise ValueError("Unsupported scene source format")
    for record, path_key in ((source, "native_path"), (preview, "path")):
        path = record.get(path_key)
        if path is not None and not _runtime_path(path):
            raise ValueError("Scene manifest path must stay under data/runtime")
        if not _SHA256.fullmatch(str(record.get("sha256", ""))):
            raise ValueError("Scene manifest asset hash must be SHA-256")
    if source["format"] == "TIFF" and source.get("native_path") is None:
        raise ValueError("TIFF scene manifest is missing its native raster")
    expected_preview = f"data/runtime/scenes/{manifest['scene_id']}.png"
    if preview.get("path") != expected_preview:
        raise ValueError("Scene preview path does not match its id")
    if source["format"] == "TIFF":
        expected_native = f"data/runtime/rasters/{manifest['scene_id']}.tif"
        if source.get("native_path") != expected_native:
            raise ValueError("Scene native path does not match its id")
    elif source.get("native_path") is not None:
        raise ValueError("Non-TIFF scene cannot claim a native raster")
    if not all(
        isinstance(preview.get(key), int) and preview[key] > 0
        for key in ("width", "height")
    ):
        raise ValueError("Scene preview dimensions must be positive integers")

    raster = manifest.get("raster")
    if raster is not None:
        if not isinstance(raster, dict) or raster.get("driver") != "GTiff":
            raise ValueError("Raster metadata must describe a GeoTIFF")
        if not all(
            isinstance(raster.get(key), int) and raster[key] > 0
            for key in ("width", "height", "band_count")
        ):
            raise ValueError("Raster dimensions and band count must be positive")
        count = raster["band_count"]
        if not isinstance(raster.get("dtypes"), list) or len(raster["dtypes"]) != count:
            raise ValueError("Raster dtype count does not match its bands")
        if not isinstance(raster.get("nodata"), list) or len(raster["nodata"]) != count:
            raise ValueError("Raster nodata count does not match its bands")
        for key, length in (("transform", 6), ("bounds", 4), ("resolution", 2)):
            if raster.get(key) is not None and not _numbers(raster[key], length):
                raise ValueError(f"Raster {key} is malformed")
        status = raster.get("georeferencing_status")
        if status not in {"affine", "missing_crs", "missing_transform", "gcps", "rpc"}:
            raise ValueError("Unknown georeferencing status")
        if raster.get("pairing_ready") is not (status == "affine"):
            raise ValueError("Raster pairing readiness contradicts georeferencing status")

    identity, grouping = manifest.get("identity"), manifest.get("grouping")
    if not isinstance(identity, dict) or not isinstance(grouping, dict):
        raise ValueError("Scene identity or grouping metadata is missing")
    if identity.get("modality") not in {"optical", "multispectral", "sar", "unknown"}:
        raise ValueError("Scene modality is invalid")
    if not isinstance(identity.get("polarizations"), list) or not all(
        isinstance(item, str) for item in identity["polarizations"]
    ):
        raise ValueError("Scene polarizations are malformed")
    if not isinstance(identity.get("provenance"), dict):
        raise ValueError("Scene metadata provenance is missing")
    paired = grouping.get("paired_scene_ids")
    if not isinstance(paired, list) or not all(
        isinstance(item, str) and _SCENE_ID.fullmatch(item) for item in paired
    ):
        raise ValueError("Scene paired ids are malformed")
    return manifest


def validate_tile_sample(sample: TileSample) -> TileSample:
    """Validate required metadata and tensor-like array shapes on load."""
    if sample.get("gsd") is None:
        raise ValueError("Tile sample is missing required field: gsd")
    if sample.get("sensor") is None:
        raise ValueError("Tile sample is missing required field: sensor")
    if sample["sensor"] not in {
        "S2",
        "S1",
        "cartosat",
        "risat",
        "loveda",
        "dota",
        "synthetic",
    }:
        raise ValueError(f"Unsupported sensor: {sample['sensor']}")
    if sample["optical"].dtype != np.float32 or sample["optical"].ndim != 3:
        raise ValueError("optical must be float32[C,H,W]")
    if sample["sar"] is not None and (
        sample["sar"].dtype != np.float32
        or sample["sar"].ndim != 3
        or sample["sar"].shape[0] != 3
    ):
        raise ValueError("sar must be float32[3,H,W] or None")
    if sample["optical_t2"] is not None and (
        sample["optical_t2"].dtype != np.float32 or sample["optical_t2"].ndim != 3
    ):
        raise ValueError("optical_t2 must be float32[C,H,W] or None")
    return sample


def load_tile(record: TileSample) -> TileSample:
    """Loader stub; replace storage access without changing its output contract."""
    return validate_tile_sample(record)
