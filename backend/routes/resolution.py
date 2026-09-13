from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.services import ArtifactError, resolution_report
from backend.scene_pack import ScenePackError, resolution_asset

router = APIRouter(prefix="/api", tags=["resolution"])


@router.get("/resolution")
def resolution() -> dict:
    try:
        return resolution_report()
    except ArtifactError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/resolution/rungs/{gsd}/image")
def resolution_rung_image(gsd: float) -> FileResponse:
    try:
        image_path = resolution_asset(gsd)
    except ScenePackError as exc:
        raise HTTPException(status_code=503, detail="Resolution imagery could not be verified.") from exc
    if image_path is None:
        raise HTTPException(status_code=404, detail="Verified resolution rung imagery is unavailable.")
    return FileResponse(image_path, media_type="image/png")
