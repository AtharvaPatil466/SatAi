import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import backend.services as services
from backend.main import app


MANIFEST_DIR = Path(__file__).parents[1] / "data" / "manifests" / "cdse"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_frozen_contract_matches_the_two_tracked_scenes(client: TestClient):
    tracked_scenes = json.loads((MANIFEST_DIR / "scenes.v1.json").read_text())
    tracked_results = json.loads(
        (MANIFEST_DIR / "sensor-necessity-results.v1.json").read_text()
    )
    response = client.get("/api/sar/sensor-necessity")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "frozen"
    assert payload["classification"] == "deterministic proxy; not model performance"
    assert "not semantic ground truth" in payload["disclaimer"]
    assert payload["locked_rule"] == tracked_results["locked_rule"]
    assert len(payload["scenes"]) == 2

    source_scenes = {row["scene_id"]: row for row in tracked_scenes["scenes"]}
    source_results = {
        row["scene_id"]: row for row in tracked_results["experiments"]
    }
    for scene in payload["scenes"]:
        source_scene = source_scenes[scene["scene_id"]]
        source_result = source_results[scene["scene_id"]]
        assert scene["s1"]["product_id"] == source_scene["s1"]["selected_product_id"]
        assert scene["s2"]["product_id"] == source_scene["s2"]["selected_product_id"]
        assert scene["grid"] == source_scene["output_grid"]
        for field in (
            "correct_support_pixels",
            "mismatched_support_pixels",
            "correct_to_mismatched_support_ratio",
            "support_reduction_percent_when_mismatched",
            "support_overlap",
            "boundary_overlap",
            "retuned",
        ):
            assert scene[field] == source_result[field]

    replication = next(
        row
        for row in payload["scenes"]
        if row["scene_id"] == "cdse-rotterdam-port-20200530"
    )
    assert replication["retuned"] is False


def test_contract_leaks_no_paths_or_sensitive_fields(client: TestClient):
    payload = client.get("/api/sar/sensor-necessity").json()
    encoded = json.dumps(payload).lower()
    assert str(Path(__file__).parents[1]).lower() not in encoded
    assert "data/external" not in encoded
    for forbidden in (
        "client_secret",
        "access_token",
        "refresh_token",
        "credential",
        "password",
        "api_key",
    ):
        assert forbidden not in encoded


def test_valid_render_is_returned_from_the_fixed_scene_mapping(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    scene_id = "cdse-yangtze-jiangsu-20200523"
    Image.new("RGB", (4, 3), (10, 20, 30)).save(tmp_path / "optical.png")
    monkeypatch.setitem(services.SENSOR_NECESSITY_EXTERNAL_DIRS, scene_id, tmp_path)
    response = client.get(
        f"/api/sar/sensor-necessity/{scene_id}/render/optical"
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


@pytest.mark.parametrize(
    "url",
    [
        "/api/sar/sensor-necessity/not-a-scene/render/optical",
        "/api/sar/sensor-necessity/cdse-yangtze-jiangsu-20200523/render/not-a-render",
    ],
)
def test_unknown_scene_or_render_fails_closed(client: TestClient, url: str):
    assert client.get(url).status_code == 404


def test_missing_render_fails_closed(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    scene_id = "cdse-yangtze-jiangsu-20200523"
    monkeypatch.setitem(services.SENSOR_NECESSITY_EXTERNAL_DIRS, scene_id, tmp_path)
    response = client.get(
        f"/api/sar/sensor-necessity/{scene_id}/render/correct-fusion"
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Frozen Sensor Necessity render is unavailable."


@pytest.mark.parametrize("contents", [None, "not json"])
def test_missing_or_malformed_tracked_manifest_is_an_explicit_server_failure(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    contents: str | None,
):
    malformed = tmp_path / "scenes.json"
    if contents is not None:
        malformed.write_text(contents)
    monkeypatch.setattr(services, "SENSOR_NECESSITY_SCENES_PATH", malformed)
    response = client.get("/api/sar/sensor-necessity")
    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Frozen Sensor Necessity manifests are unavailable or malformed."
    )
