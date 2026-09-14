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
