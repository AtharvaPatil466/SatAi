"""Validated, fail-closed adapters for the curated prototype scene pack."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "demo" / "manifest.json"
RESULT_STATES = {"real_live", "cached_real", "prototype"}


class ScenePackError(RuntimeError):
    """The scene-pack manifest or one of its claimed artifacts is invalid."""


def _safe_path(relative: object) -> Path:
    if not isinstance(relative, str) or not relative:
        raise ScenePackError("Scene-pack path is missing.")
    path = (ROOT / relative).resolve()
    if path != ROOT and ROOT not in path.parents:
        raise ScenePackError("Scene-pack path escapes the repository.")
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pixel_sha256(path: Path) -> str:
    with Image.open(path) as image:
        return hashlib.sha256(image.convert("RGB").tobytes()).hexdigest()


def _asset_status(entry: dict[str, Any], *, pixels: bool = False) -> tuple[bool, str | None]:
    if not entry.get("available"):
        reason = entry.get("unavailable_reason")
        return False, reason if isinstance(reason, str) and reason else "Asset is not available."
    checksum = entry.get("asset_sha256")
    if not isinstance(checksum, str) or len(checksum) != 64:
        return False, "Asset checksum is missing."
    try:
        path = _safe_path(entry.get("asset_path"))
        if not path.is_file():
            return False, "Asset file is missing."
        if _sha256(path) != checksum:
            return False, "Asset checksum does not match the manifest."
        with Image.open(path) as image:
            if image.size != (entry.get("width"), entry.get("height")):
                return False, "Asset dimensions do not match the manifest."
        if pixels and pixel_sha256(path) != entry.get("pixel_sha256"):
            return False, "Canonical pixel checksum does not match the manifest."
    except (OSError, ValueError, ScenePackError):
        return False, "Asset could not be validated."
    return True, None


def _artifact(entry: dict[str, Any]) -> tuple[Path, dict[str, Any]]:
    artifact = entry.get("artifact")
    if not isinstance(artifact, dict):
        raise ScenePackError("Cached-real scene has no artifact provenance.")
    path = _safe_path(artifact.get("path"))
    checksum = artifact.get("sha256")
    if not path.is_file() or not isinstance(checksum, str) or _sha256(path) != checksum:
        raise ScenePackError("Cached-real result artifact is missing or has changed.")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ScenePackError("Cached-real result artifact is unreadable.") from exc
    return path, payload


@lru_cache(maxsize=1)
def manifest() -> dict[str, Any]:
    try:
        value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ScenePackError("Scene-pack manifest is unavailable.") from exc
    if value.get("version") != "1.0" or not isinstance(value.get("scenes"), list):
        raise ScenePackError("Scene-pack manifest has an unsupported shape.")
    ids: set[str] = set()
    for scene in value["scenes"]:
        if not isinstance(scene, dict) or not isinstance(scene.get("id"), str) or scene["id"] in ids:
            raise ScenePackError("Scene-pack IDs must be unique strings.")
        ids.add(scene["id"])
        if scene.get("result_state") not in RESULT_STATES:
            raise ScenePackError(f"Scene {scene['id']} has an unknown result state.")
    ladder = value.get("resolution_ladder")
    if not isinstance(ladder, dict) or not isinstance(ladder.get("rungs"), list):
        raise ScenePackError("Resolution ladder manifest is missing.")
    return value


def _scene(scene_id: str) -> dict[str, Any] | None:
    return next((entry for entry in manifest()["scenes"] if entry["id"] == scene_id), None)


def scene_catalog() -> dict[str, Any]:
    scenes = []
    for entry in manifest()["scenes"]:
        available, reason = _asset_status(entry, pixels=True)
        if available and entry["result_state"] == "cached_real":
            try:
                _artifact(entry)
            except ScenePackError as exc:
                available, reason = False, str(exc)
        scenes.append(
            {
                "id": entry["id"],
                "title": entry["title"],
                "capability": entry["capability"],
                "result_state": entry["result_state"],
                "catalog_visible": bool(entry.get("catalog_visible")),
                "available": available,
                "unavailable_reason": reason,
                "question": entry["question"],
                "evaluated_expression": entry["evaluated_expression"],
                "source": entry["source"],
            }
        )
    return {"version": manifest()["version"], "scenes": scenes}


def scene_asset(scene_id: str) -> Path | None:
    entry = _scene(scene_id)
    if entry is None or not _asset_status(entry, pixels=True)[0]:
        return None
    return _safe_path(entry["asset_path"])


def identify_scene(path: Path) -> dict[str, Any] | None:
    try:
        digest = pixel_sha256(path)
    except OSError:
        return None
    for entry in manifest()["scenes"]:
        if _asset_status(entry, pixels=True)[0] and entry.get("pixel_sha256") == digest:
            return entry
    return None


def cached_scene(path: Path, question: str, capability: str) -> dict[str, Any] | None:
    entry = identify_scene(path)
    if entry is None or entry.get("result_state") != "cached_real" or not entry.get("replay_upload"):
        return None
    if entry.get("question") != question or entry.get("capability") != capability:
        return None
    _, payload = _artifact(entry)
    selector = entry["artifact"].get("selector")
    if not isinstance(selector, dict):
        raise ScenePackError("Cached-real artifact selector is missing.")
    rows = payload.get("results")
    if not isinstance(rows, list):
        raise ScenePackError("Cached-real artifact contains no result rows.")
    matches = [row for row in rows if isinstance(row, dict) and all(row.get(key) == value for key, value in selector.items())]
    if len(matches) != 1:
        raise ScenePackError("Cached-real artifact selector did not resolve exactly one row.")
    return {"entry": entry, "row": matches[0]}


def resolution_assets() -> list[dict[str, Any]]:
    ladder = manifest()["resolution_ladder"]
    artifact_path = _safe_path(ladder.get("artifact_path"))
    artifact_checksum = ladder.get("artifact_sha256")
    if not artifact_path.is_file() or not isinstance(artifact_checksum, str) or _sha256(artifact_path) != artifact_checksum:
        raise ScenePackError("Resolution result artifact is missing or has changed.")
    assets = []
    for rung in ladder["rungs"]:
        available, reason = _asset_status(rung)
        assets.append({"gsd": rung["gsd"], "available": available, "unavailable_reason": reason, "width": rung.get("width"), "height": rung.get("height")})
    return assets


def resolution_asset(gsd: float) -> Path | None:
    resolution_assets()
    rung = next((item for item in manifest()["resolution_ladder"]["rungs"] if float(item["gsd"]) == gsd), None)
    if rung is None or not _asset_status(rung)[0]:
        return None
    return _safe_path(rung["asset_path"])
