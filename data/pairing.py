"""Pure scene-manifest compatibility checks; never mutates raster data."""

from datetime import datetime
from math import sqrt
from typing import Any

from rasterio.crs import CRS
from rasterio.errors import CRSError, RasterioError
from rasterio.warp import transform_bounds

from data.dataset import SceneManifest, validate_scene_manifest

SUPPORTED_POLARIZATIONS = frozenset({"VV", "VH", "HH", "HV"})
DEFAULT_OVERLAP = {"optical_sar": 0.8, "change_vqa": 0.9}
DEFAULT_MAX_RESOLUTION_RATIO = {"optical_sar": 4.0, "change_vqa": 1.25}
EQUAL_AREA_CRS = "EPSG:6933"


def _issue(items: list[dict[str, str]], code: str, message: str) -> None:
    if not any(item["code"] == code for item in items):
        items.append({"code": code, "message": message})


def _timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else None
    except ValueError:
        return None


def _metric_bounds(manifest: SceneManifest) -> tuple[float, float, float, float]:
    raster = manifest["raster"]
    assert raster is not None
    crs = CRS.from_wkt(raster["crs_wkt"])
    return transform_bounds(crs, EQUAL_AREA_CRS, *raster["bounds"], densify_pts=21)


def _overlap(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    width = max(0.0, min(left[2], right[2]) - max(left[0], right[0]))
    height = max(0.0, min(left[3], right[3]) - max(left[1], right[1]))
    intersection = width * height
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    denominator = min(left_area, right_area)
    return intersection / denominator if denominator else 0.0


def _resolution(bounds: tuple[float, ...], manifest: SceneManifest) -> float:
    raster = manifest["raster"]
    assert raster is not None
    area = abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]))
    return sqrt(area / (raster["width"] * raster["height"]))


def evaluate_compatibility(
    first: SceneManifest,
    second: SceneManifest | None,
    workflow: str,
    *,
    overlap_threshold: float | None = None,
    max_resolution_ratio: float | None = None,
) -> dict[str, Any]:
    """Evaluate declared metadata and footprints without reprojection or resampling."""
    validate_scene_manifest(first)
    if second is not None:
        validate_scene_manifest(second)
    verified: list[str] = ["scene_1_manifest_valid"]
    failed: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    unknown: list[str] = []
    operations: list[str] = []
    overlap_ratio: float | None = None
    resolution_ratio: float | None = None
    interval: float | None = None

    if workflow in {"single_image_vqa", "grounding"}:
        verified.append("source_format_supported")
        identity = first["identity"]
        for field in ("modality", "sensor", "acquisition_time"):
            if identity.get(field) in {None, "", "unknown"}:
                unknown.append(f"scene_1.{field}")
        return {
            "eligible": True,
            "requested_workflow": workflow,
            "verified_checks": verified,
            "failed_checks": failed,
            "warnings": warnings,
            "unknown_metadata": unknown,
            "normalized_overlap_ratio": None,
            "resolution_ratio": None,
            "acquisition_interval_seconds": None,
            "operations_required": operations,
            "reason_codes": [],
        }

    if workflow not in DEFAULT_OVERLAP:
        _issue(failed, "unsupported_workflow", f"Unsupported workflow: {workflow}")
    if second is None:
        _issue(failed, "second_scene_missing", "Paired workflows require two scenes.")
    if failed:
        return _result(workflow, verified, failed, warnings, unknown, None, None, None, operations)
    assert second is not None
    verified.append("scene_2_manifest_valid")

    identities = (first["identity"], second["identity"])
    modalities = [identity.get("modality") for identity in identities]
    sensors = [identity.get("sensor") for identity in identities]
    dates = [_timestamp(identity.get("acquisition_time")) for identity in identities]
    for index, (modality, sensor, date) in enumerate(zip(modalities, sensors, dates), 1):
        if modality in {None, "", "unknown"}:
            unknown.append(f"scene_{index}.modality")
        if sensor in {None, ""}:
            unknown.append(f"scene_{index}.sensor")
        if date is None:
            unknown.append(f"scene_{index}.acquisition_time")

    if workflow == "optical_sar":
        families = ["optical" if value in {"optical", "multispectral"} else value for value in modalities]
        if sorted(families) != ["optical", "sar"]:
            _issue(failed, "modalities_incompatible", "Optical-SAR requires one declared optical/multispectral scene and one declared SAR scene.")
        else:
            verified.append("modalities_compatible")
        sar_index = families.index("sar") if "sar" in families else None
        polarizations = identities[sar_index].get("polarizations", []) if sar_index is not None else []
        if not polarizations:
            unknown.append(f"scene_{sar_index + 1}.polarizations" if sar_index is not None else "sar.polarizations")
            _issue(failed, "polarization_missing", "SAR polarization must be declared.")
        elif not set(polarizations).issubset(SUPPORTED_POLARIZATIONS):
            _issue(failed, "polarization_unsupported", "SAR polarization is not supported.")
        else:
            verified.append("polarization_supported")
        if any(sensor in {None, ""} for sensor in sensors) or any(date is None for date in dates):
            _issue(failed, "acquisition_metadata_missing", "Both scenes require declared sensor and acquisition timestamps.")
        else:
            verified.append("acquisition_metadata_present")
    else:
        families = ["optical" if value in {"optical", "multispectral"} else value for value in modalities]
        if any(value in {None, "", "unknown"} for value in families) or families[0] != families[1]:
            _issue(failed, "modalities_incompatible", "Bi-temporal scenes require compatible declared modalities.")
        else:
            verified.append("modalities_compatible")
        if any(date is None for date in dates):
            _issue(failed, "acquisition_time_missing", "Both acquisition timestamps are required.")
        elif dates[0] >= dates[1]:
            _issue(failed, "acquisition_order_invalid", "The first scene must predate the second scene.")
        else:
            interval = (dates[1] - dates[0]).total_seconds()
            verified.append("acquisition_order_valid")

    groups = [item["grouping"].get("pair_group") for item in (first, second)]
    if all(groups) and groups[0] != groups[1]:
        _issue(failed, "pair_group_mismatch", "Declared pair/group identifiers differ.")
    elif not all(groups):
        _issue(warnings, "pair_group_missing", "One or both pair/group identifiers are undeclared.")
    else:
        verified.append("pair_group_match")

    rasters = (first["raster"], second["raster"])
    for index, raster in enumerate(rasters, 1):
        if raster is None:
            unknown.append(f"scene_{index}.raster_metadata")
            _issue(failed, "raster_metadata_missing", "Both scenes require native raster metadata.")
        elif raster["georeferencing_status"] in {"gcps", "rpc"}:
            _issue(failed, "georeferencing_model_unsupported", "GCP/RPC-only georeferencing is preserved but not pair-ready.")
        elif raster["crs_wkt"] is None:
            unknown.append(f"scene_{index}.crs")
            _issue(failed, "crs_missing", "Both scenes require declared raster CRS metadata.")
        elif not raster["pairing_ready"]:
            _issue(failed, "affine_transform_missing", "Both scenes require affine georeferencing.")

    if not any(item["code"] in {"raster_metadata_missing", "georeferencing_model_unsupported", "crs_missing", "affine_transform_missing"} for item in failed):
        try:
            bounds = (_metric_bounds(first), _metric_bounds(second))
            overlap_ratio = _overlap(*bounds)
            resolutions = (_resolution(bounds[0], first), _resolution(bounds[1], second))
            resolution_ratio = max(resolutions) / min(resolutions) if min(resolutions) else None
            verified.append("footprints_transformable")
        except (CRSError, RasterioError, ValueError, TypeError):
            _issue(failed, "footprint_transform_failed", "Raster footprints cannot be safely transformed for comparison.")

    threshold = overlap_threshold if overlap_threshold is not None else DEFAULT_OVERLAP[workflow]
    if overlap_ratio is not None:
        if overlap_ratio < threshold:
            _issue(failed, "overlap_below_threshold", f"Normalized footprint overlap is below {threshold:.2f}.")
        else:
            verified.append("overlap_threshold_met")
    resolution_limit = max_resolution_ratio if max_resolution_ratio is not None else DEFAULT_MAX_RESOLUTION_RATIO[workflow]
    if resolution_ratio is not None:
        if resolution_ratio > resolution_limit:
            _issue(failed, "resolution_ratio_exceeded", f"Resolution ratio exceeds {resolution_limit:.2f}.")
        else:
            verified.append("resolution_ratio_compatible")

    georeferencing_failed = any(
        item["code"]
        in {
            "raster_metadata_missing",
            "georeferencing_model_unsupported",
            "crs_missing",
            "affine_transform_missing",
            "footprint_transform_failed",
        }
        for item in failed
    )
    if all(raster is not None for raster in rasters) and not georeferencing_failed:
        crs_differ = rasters[0]["crs_wkt"] != rasters[1]["crs_wkt"]
        if crs_differ:
            operations.append("reprojection")
            _issue(failed, "reprojection_required", "CRS differs; pixel reprojection would be required before analysis.")
        if workflow == "change_vqa":
            if (rasters[0]["width"], rasters[0]["height"]) != (
                rasters[1]["width"], rasters[1]["height"]
            ):
                _issue(failed, "dimensions_incompatible", "T1 and T2 raster dimensions differ.")
            if rasters[0]["transform"] != rasters[1]["transform"]:
                operations.append("co_registration_or_resampling")
                _issue(failed, "grid_alignment_incompatible", "Bi-temporal pixel grids are not aligned.")
            if not any(
                item["code"] in {"reprojection_required", "dimensions_incompatible", "grid_alignment_incompatible"}
                for item in failed
            ):
                verified.append("grid_alignment_compatible")
        else:
            if (rasters[0]["width"], rasters[0]["height"]) != (
                rasters[1]["width"], rasters[1]["height"]
            ):
                _issue(failed, "dimensions_incompatible", "Optical and SAR raster dimensions differ.")
            if rasters[0]["transform"] != rasters[1]["transform"]:
                operations.append("resampling_or_co_registration")
                _issue(failed, "grid_alignment_differs", "Pixel grids differ; resampling or co-registration would be required.")

    if all(date is not None for date in dates) and interval is None:
        interval = abs((dates[1] - dates[0]).total_seconds())
    return _result(workflow, verified, failed, warnings, unknown, overlap_ratio, resolution_ratio, interval, operations)


def _result(
    workflow: str,
    verified: list[str],
    failed: list[dict[str, str]],
    warnings: list[dict[str, str]],
    unknown: list[str],
    overlap: float | None,
    resolution: float | None,
    interval: float | None,
    operations: list[str],
) -> dict[str, Any]:
    return {
        "eligible": not failed,
        "requested_workflow": workflow,
        "verified_checks": verified,
        "failed_checks": failed,
        "warnings": warnings,
        "unknown_metadata": sorted(set(unknown)),
        "normalized_overlap_ratio": overlap,
        "resolution_ratio": resolution,
        "acquisition_interval_seconds": interval,
        "operations_required": list(dict.fromkeys(operations)),
        "reason_codes": list(dict.fromkeys(item["code"] for item in [*failed, *warnings])),
    }
