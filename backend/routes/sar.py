from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.services import (
    ArtifactError,
    sar_annotation,
    sar_render_path,
    sensor_necessity_render_path,
    sensor_necessity_report,
)

router = APIRouter(prefix="/api", tags=["sar"])


@router.get("/sar/sensor-necessity")
def sensor_necessity() -> dict:
    try:
        return sensor_necessity_report()
    except ArtifactError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sar/sensor-necessity/{scene_id}/render/{render_name}")
def sensor_necessity_render(scene_id: str, render_name: str) -> FileResponse:
    try:
        image_path = sensor_necessity_render_path(scene_id, render_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ArtifactError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if image_path is None:
        raise HTTPException(
            status_code=404,
            detail="Frozen Sensor Necessity render is unavailable.",
        )
    return FileResponse(image_path, media_type="image/png")


@router.get("/sar/{scene}")
def sar(scene: str) -> dict:
    try:
        annotation = sar_annotation(scene)
        # Prepend clear human validation label
        annotation["_notice"] = "HUMAN VALIDATION — NOT AI MODEL OUTPUT. Real SAR GRD data, manual analyst interpretation."
        return annotation
    except ArtifactError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/sar/{scene}/image")
def sar_image(scene: str) -> FileResponse:
    image_path = sar_render_path(scene)
    if image_path is None:
        raise HTTPException(status_code=404, detail="Local processed SAR render is unavailable.")
    return FileResponse(image_path, media_type="image/png")
