import builtins
import sys
from types import ModuleType, SimpleNamespace

import pytest

import models.grounding_dino.model as grounding_module
from models.grounding_dino import GroundingDINOModel


def test_infer_returns_normalized_bounding_box_contract(tmp_path, monkeypatch) -> None:
    image = tmp_path / "scene.png"
    image.touch()
    model = GroundingDINOModel()
    monkeypatch.setattr(
        model,
        "_predict",
        lambda *_: ([[0.5, 0.5, 0.4, 0.2]], [0.87], ["bridge"]),
    )

    result = model.infer([str(image)], "the bridge")

    assert result == {
        "answer": "Found 1 match for 'the bridge'.",
        "evidence": [
            {
                "type": "bounding_box",
                "label": "bridge",
                "coordinates": pytest.approx([0.3, 0.4, 0.7, 0.6]),
                "coordinate_space": "normalized_xyxy",
                "confidence": 0.87,
                "source_scene_id": None,
            }
        ],
    }


def test_infer_reports_no_match_when_evidence_is_empty(tmp_path, monkeypatch) -> None:
    image = tmp_path / "scene.png"
    image.touch()
    model = GroundingDINOModel()
    monkeypatch.setattr(model, "_predict", lambda *_: ([], [], []))

    assert model.infer([str(image)], "bridge") == {
        "answer": "No match found for 'bridge'.",
        "evidence": [],
    }


def test_missing_grounding_package_fails_closed(monkeypatch) -> None:
    original_import = builtins.__import__

    def missing_grounding(name, *args, **kwargs):
        if name == "groundingdino":
            raise ImportError("not installed")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing_grounding)
    with pytest.raises(RuntimeError, match="requires groundingdino"):
        GroundingDINOModel()._load()


def test_missing_cuda_fails_closed(monkeypatch) -> None:
    groundingdino = ModuleType("groundingdino")
    groundingdino.__file__ = __file__
    inference = ModuleType("groundingdino.util.inference")
    inference.load_image = object()
    inference.load_model = object()
    inference.predict = object()
    monkeypatch.setitem(sys.modules, "groundingdino", groundingdino)
    monkeypatch.setitem(sys.modules, "groundingdino.util", ModuleType("groundingdino.util"))
    monkeypatch.setitem(sys.modules, "groundingdino.util.inference", inference)
    monkeypatch.setitem(
        sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False))
    )

    with pytest.raises(RuntimeError, match="requires a CUDA GPU"):
        GroundingDINOModel()._load()


def test_readiness_fails_closed_without_dependency(monkeypatch) -> None:
    monkeypatch.setattr(grounding_module, "find_spec", lambda name: None if name == "groundingdino" else object())
    readiness = GroundingDINOModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "DEPENDENCY_UNAVAILABLE"


def test_readiness_fails_closed_without_cuda(monkeypatch) -> None:
    monkeypatch.setattr(grounding_module, "find_spec", lambda _: object())
    groundingdino = ModuleType("groundingdino")
    groundingdino.__file__ = __file__
    monkeypatch.setitem(sys.modules, "groundingdino", groundingdino)
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False)))
    readiness = GroundingDINOModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "CUDA_UNAVAILABLE"


def test_readiness_fails_closed_without_local_checkpoint(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(grounding_module, "find_spec", lambda _: object())
    package = tmp_path / "groundingdino"
    config = package / "config" / "GroundingDINO_SwinT_OGC.py"
    config.parent.mkdir(parents=True)
    config.touch()
    groundingdino = ModuleType("groundingdino")
    groundingdino.__file__ = str(package / "__init__.py")
    hub = ModuleType("huggingface_hub")
    hub.try_to_load_from_cache = lambda *_args: None
    monkeypatch.setitem(sys.modules, "groundingdino", groundingdino)
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)))
    monkeypatch.setitem(sys.modules, "huggingface_hub", hub)
    readiness = GroundingDINOModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "ARTIFACT_UNAVAILABLE"
