import json

import pytest

from models import artifacts


def test_manifest_parses() -> None:
    providers = artifacts.load_manifest()["providers"]
    assert providers["qwen2.5vl-3b"]["model_id"] == "Qwen/Qwen2.5-VL-3B-Instruct"
    assert providers["grounding-dino-swint"]["checkpoint"] == "groundingdino_swint_ogc.pth"
    assert all(spec["sha256"] is None for spec in providers.values())


def test_malformed_manifest_fails_closed(tmp_path, monkeypatch) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"schema_version": 1, "providers": {}}))
    monkeypatch.setattr(artifacts, "MANIFEST", path)
    with pytest.raises(ValueError, match="Invalid model artifact manifest"):
        artifacts.load_manifest(path)
    assert artifacts.validate_artifact("qwen2.5vl-3b").reason_code == "ARTIFACT_CONFIG_INVALID"


def test_missing_explicit_artifact_is_offline(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SATQUERY_QWEN_MODEL_DIR", str(tmp_path / "missing"))
    status = artifacts.validate_artifact("qwen2.5vl-3b")
    assert status.available is False
    assert status.reason_code == "ARTIFACT_UNAVAILABLE"


def test_qwen_shard_completeness(tmp_path, monkeypatch) -> None:
    (tmp_path / "config.json").write_text('{"model_type":"qwen2_5_vl"}')
    for name in ("preprocessor_config.json", "tokenizer_config.json", "tokenizer.json"):
        (tmp_path / name).write_text("{}")
    (tmp_path / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"a": "shard-1.safetensors"}}))
    monkeypatch.setenv("SATQUERY_QWEN_MODEL_DIR", str(tmp_path))
    assert artifacts.validate_artifact("qwen2.5vl-3b").reason_code == "ARTIFACT_UNAVAILABLE"
    (tmp_path / "shard-1.safetensors").write_bytes(b"weights")
    assert artifacts.validate_artifact("qwen2.5vl-3b").available


def test_grounding_explicit_checkpoint(tmp_path, monkeypatch) -> None:
    checkpoint = tmp_path / "groundingdino_swint_ogc.pth"
    monkeypatch.setenv("SATQUERY_GROUNDING_CHECKPOINT", str(checkpoint))
    assert artifacts.validate_artifact("grounding-dino-swint").reason_code == "ARTIFACT_UNAVAILABLE"
    assert str(tmp_path) not in (artifacts.validate_artifact("grounding-dino-swint").detail or "")
    checkpoint.write_bytes(b"weights")
    assert artifacts.validate_artifact("grounding-dino-swint").path == checkpoint
