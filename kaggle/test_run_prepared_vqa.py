import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from run_prepared_vqa import (  # noqa: E402
    QUESTIONS,
    SCENE_ID,
    artifact,
    frozen_scene,
    sha256,
    write_immutable,
)


def demo_root(tmp_path: Path) -> Path:
    asset = tmp_path / "scene.png"
    asset.write_bytes(b"frozen pixels")
    manifest = tmp_path / "data" / "demo" / "manifest.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(
        json.dumps(
            {
                "scenes": [
                    {
                        "asset_path": "scene.png",
                        "asset_sha256": sha256(asset),
                        "pixel_sha256": "a" * 64,
                        "width": 1024,
                        "height": 1024,
                        "source": {"source_id": SCENE_ID},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    return tmp_path


def test_frozen_scene_requires_present_hash_matched_asset(tmp_path: Path) -> None:
    root = demo_root(tmp_path)
    assert frozen_scene(root)["asset_sha256"] == sha256(root / "scene.png")
    (root / "scene.png").write_bytes(b"changed pixels")
    with pytest.raises(RuntimeError, match="SHA-256 mismatch"):
        frozen_scene(root)
    (root / "scene.png").unlink()
    with pytest.raises(FileNotFoundError, match="asset is missing"):
        frozen_scene(root)


def test_tracked_scene_and_exact_question_batch_are_frozen() -> None:
    assert frozen_scene()["asset_sha256"] == (
        "495a8e889c686611f5324cb1c03ecf2b22cedc424c868fc13a8666e2fc5ab0e0"
    )
    assert QUESTIONS == (
        "Are there agricultural fields in this image?",
        "Is there vegetation in this image?",
        "Are there roads visible in this image?",
        "Are there multiple buildings visible in this image?",
        "Is there a large body of water visible in this image?",
        "What are the main features visible in this satellite image?",
        "Describe the land cover visible in this image.",
        "Is this area densely built up?",
        "What type of area is shown in this satellite image?",
        "Describe this satellite image in one sentence.",
    )


def test_artifact_has_exact_questions_and_measured_only_schema(tmp_path: Path) -> None:
    scene = frozen_scene(demo_root(tmp_path))
    report = artifact(
        scene,
        [f"measured answer {index}" for index in range(len(QUESTIONS))],
        timestamp="2026-09-19T12:00:00+00:00",
        revision="b" * 40,
        runtime={"gpu_count": 1, "gpus": ["Tesla T4"]},
        max_new_tokens=50,
    )
    assert [row["question"] for row in report["results"]] == list(QUESTIONS)
    assert all(row["tile_id"] == SCENE_ID for row in report["results"])
    assert report["model"]["identity"] == "Qwen/Qwen2.5-VL-3B-Instruct"
    assert report["decoding"]["do_sample"] is False
    serialized = json.dumps(report)
    for forbidden in ('"expected_answer"', '"correct"', '"confidence"', '"evidence"'):
        assert forbidden not in serialized


def test_artifact_write_is_immutable(tmp_path: Path) -> None:
    output = tmp_path / "measurement.json"
    write_immutable(output, {"run_id": "first"})
    with pytest.raises(FileExistsError):
        write_immutable(output, {"run_id": "second"})
