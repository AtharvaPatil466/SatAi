import sys
from types import ModuleType, SimpleNamespace

import models.qwen_vl.model as qwen_module
from models.qwen_vl.model import QwenVLModel


def test_infer_preserves_answer_without_fabricating_confidence(tmp_path, monkeypatch) -> None:
    image = tmp_path / "scene.png"
    image.write_bytes(b"image")
    model = QwenVLModel()
    monkeypatch.setattr(model, "_generate_answer", lambda *_: "Yes")

    assert model.infer([str(image)], "Is there a building?") == {
        "answer": "Yes",
        "confidence": None,
        "evidence": [],
    }


def test_readiness_fails_closed_without_dependency(monkeypatch) -> None:
    monkeypatch.setattr(qwen_module, "find_spec", lambda name: None if name == "qwen_vl_utils" else object())
    readiness = QwenVLModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "DEPENDENCY_UNAVAILABLE"


def test_readiness_fails_closed_without_cuda(monkeypatch) -> None:
    monkeypatch.setattr(qwen_module, "find_spec", lambda _: object())
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False)))
    readiness = QwenVLModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "CUDA_UNAVAILABLE"


def test_readiness_fails_closed_without_local_weights(monkeypatch) -> None:
    monkeypatch.setattr(qwen_module, "find_spec", lambda _: object())
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)))
    hub = ModuleType("huggingface_hub")
    hub.snapshot_download = lambda *_args, **_kwargs: (_ for _ in ()).throw(FileNotFoundError())
    monkeypatch.setitem(sys.modules, "huggingface_hub", hub)
    readiness = QwenVLModel().readiness()
    assert readiness.available is False
    assert readiness.reason_code == "ARTIFACT_UNAVAILABLE"
