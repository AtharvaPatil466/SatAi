from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app
from backend.scene_pack import resolution_asset, scene_asset, scene_catalog


def test_scene_pack_fails_closed_for_missing_assets() -> None:
    scenes = {scene["id"]: scene for scene in scene_catalog()["scenes"]}

    assert scenes["loveda-golden-vqa"]["available"] is True
    assert scene_asset("loveda-golden-vqa").is_file()
    assert scenes["dior-rsvg-07272"]["available"] is False
    assert scene_asset("dior-rsvg-07272") is None

    response = TestClient(app).get("/api/scenes")
    assert response.status_code == 200
    assert response.json()["scenes"][1]["unavailable_reason"]


def test_resolution_rung_images_are_verified_before_serving() -> None:
    client = TestClient(app)

    available = client.get("/api/resolution/rungs/0.3/image")
    assert available.status_code == 200
    with Image.open(BytesIO(available.content)) as image:
        assert image.size == (1024, 1024)

    assert resolution_asset(1.0) is None
    missing = client.get("/api/resolution/rungs/1/image")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Verified resolution rung imagery is unavailable."}
