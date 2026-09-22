import json
import sys
from types import SimpleNamespace

import pytest

from scripts import gpu_smoke
from models.base import ModelReadiness
from models.artifacts import ArtifactStatus


def test_qwen_requires_answer_and_uncached_result() -> None:
    assert gpu_smoke.validate_result("qwen2.5vl-3b", {"answer": "fields", "confidence": None, "evidence": []})["answer_nonempty"]
    with pytest.raises(ValueError, match="Non-empty answer"):
        gpu_smoke.validate_result("qwen2.5vl-3b", {"answer": " ", "confidence": None, "evidence": []})
    with pytest.raises(ValueError, match="cached"):
        gpu_smoke.validate_result("qwen2.5vl-3b", {"answer": "fields", "evidence": [], "execution_mode": "cached_result", "results_artifact": "old.json"})


def test_grounding_box_validation() -> None:
    valid = {"answer": "Found 1 match", "evidence": [{"type": "bounding_box", "label": "ship", "coordinate_space": "normalized_xyxy", "coordinates": [0.1, 0.2, 0.4, 0.7], "confidence": 0.8}]}
    assert gpu_smoke.validate_result("grounding-dino-swint", valid)["evidence_count"] == 1
    valid["evidence"][0]["coordinates"] = [0.4, 0.2, 0.1, 0.7]
    with pytest.raises(ValueError, match="box"):
        gpu_smoke.validate_result("grounding-dino-swint", valid)


def test_report_serializes_cuda_failure_without_inference(tmp_path, monkeypatch) -> None:
    torch = SimpleNamespace(__version__="test", version=SimpleNamespace(cuda=None), cuda=SimpleNamespace(is_available=lambda: False))
    monkeypatch.setitem(sys.modules, "torch", torch)
    output = tmp_path / "smoke.json"
    monkeypatch.setattr(sys, "argv", ["gpu_smoke.py", "--out", str(output)])
    assert gpu_smoke.main() == 1
    report = json.loads(output.read_text())
    assert report["runtime"]["cuda_available"] is False
    assert len(report["cases"]) == 2
    assert all(case["failure"]["reason_code"] == "CUDA_UNAVAILABLE" for case in report["cases"])


def test_run_case_uses_live_provider_result(tmp_path, monkeypatch) -> None:
    class Provider:
        def readiness(self):
            return ModelReadiness(True)

        def infer(self, images, question):
            assert len(images) == 1 and question == gpu_smoke.CASES["qwen2.5vl-3b"][1]
            return {"answer": "Fields", "confidence": None, "evidence": []}

    monkeypatch.setattr(gpu_smoke, "QwenVLModel", Provider)
    monkeypatch.setattr(gpu_smoke, "validate_artifact", lambda _: ArtifactStatus(True, path=tmp_path))
    report = gpu_smoke.run_case("qwen2.5vl-3b")
    assert report["success"] is True
    assert report["execution_mode"] == "live" and report["results_artifact"] is None
    assert report["input"]["sha256"] and report["output_summary"]["answer_nonempty"]
