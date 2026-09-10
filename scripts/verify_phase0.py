"""Real API smoke check. Creates uploaded scenes and one trace per successful analysis."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import re

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE = ROOT / "data/ladder/0.3/loveda_Train_Rural_images_png_0_gsd0.3.png"
GOLDEN = {"scene_id": "loveda_LoveDA_images_png_0_gsd0.3", "question": "Is there a building in this image?", "sensor": "UNKNOWN", "capability": "single_image_vqa"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    with httpx.Client(base_url=args.api, timeout=150) as client:
        def call(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            print(method, path, response.status_code, response.text if "json" in response.headers.get("content-type", "") else f"{len(response.content)} image bytes")
            return response

        assert call("GET", "/api/health").json()["status"] == "ready"
        before = client.get("/api/traces").json()
        print("START TRACE COUNT", before["count"])
        for body, status in [
            ({**GOLDEN, "capability": "banana_mode"}, 422),
            ({**GOLDEN, "capability": "grounding", "question": "Locate the buildings in this image."}, 503),
            ({**GOLDEN, "scene_id": "scene_does_not_exist"}, 422),
            ({k: v for k, v in GOLDEN.items() if k != "question"}, 422),
        ]:
            assert call("POST", "/api/analyze", json=body).status_code == status
            assert client.get("/api/traces").json() == before

        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg")]:
            with Image.open(IMAGE) as original:
                source = original.convert("RGB")
            data = BytesIO()
            source.save(data, format=fmt)
            response = call("POST", "/api/scenes", files={"file": (f"scene.{fmt.lower()}", data.getvalue(), mime)})
            assert response.status_code == 201
            scene = response.json()
            assert re.fullmatch(r"scene_[0-9a-f]{32}", scene["scene_id"])
            assert all(scene[k] is None for k in ("sensor", "gsd", "location", "acquisition_date"))
            assert (scene["width"], scene["height"]) == source.size and scene["format"] == fmt
            retrieved = call("GET", f"/api/scenes/{scene['scene_id']}/image")
            assert retrieved.status_code == 200
            assert Image.open(BytesIO(retrieved.content)).convert("RGB").tobytes() == Image.open(BytesIO(data.getvalue())).convert("RGB").tobytes()
            body = {**GOLDEN, "scene_id": scene["scene_id"]}
            plan = call("POST", "/api/plan", json=body)
            assert plan.status_code == 200 and plan.json()["executable"]
            assert plan.json()["selected_capability"] == "single_image_vqa"
            assert len(plan.json()["steps"]) == 1
            assert client.get("/api/traces").json() == before
            analysis = call("POST", "/api/analyze", json=body)
            after = client.get("/api/traces").json()
            if analysis.status_code == 503:
                assert "answer" not in analysis.json() and after == before
            else:
                assert analysis.status_code == 200 and analysis.json()["execution_mode"] == "live"
                assert after["count"] == before["count"] + 1 and after["records"][1:] == before["records"]
            before = after

        result = call("POST", "/api/analyze", json=GOLDEN)
        assert result.status_code == 200
        result = result.json()
        if result["execution_mode"] == "cached_result":
            artifact = json.loads((ROOT / result["results_artifact"]).read_text())
            row = next(row for row in artifact["results"] if row["tile_id"] == GOLDEN["scene_id"] and row["question"] == GOLDEN["question"])
            assert result["answer"] == row["prediction"]["answer"].strip()
        else:
            assert result["execution_mode"] == "live"
        after = client.get("/api/traces").json()
        assert after["count"] == before["count"] + 1 and after["records"][1:] == before["records"]
        assert after["records"][0] == result["trace"]
        assert result["trace"]["prev_hash"] == (before["records"][0]["record_hash"] if before["count"] else "")
        verification = call("POST", "/api/traces/verify")
        assert verification.json() == {"verified": True, "message": f"Chain verified ({after['count']} records)"}
        assert call("GET", "/api/resolution").status_code == 200
        sar = call("GET", "/api/sar/mumbai-coastal")
        assert sar.status_code == 200 and sar.json()["human_validation"] is True
        print("PASS: API flow, exact cache provenance, trace deltas and chain integrity")


if __name__ == "__main__":
    main()
