"""Lazy Grounding DINO inference wrapper."""

from pathlib import Path
from importlib.util import find_spec
from typing import Any, Callable

from models.base import Model, ModelReadiness


class GroundingDINOModel(Model):
    """Ground text in one image with the official Swin-T checkpoint.

    The official implementation supports CPU inference, but this provider is
    deliberately CUDA-only so a missing GPU fails clearly instead of starting
    an unexpectedly slow CPU job.
    """

    name = "grounding-dino-swint"
    version = "ShilongLiu/GroundingDINO:groundingdino_swint_ogc.pth"

    def __init__(
        self, box_threshold: float = 0.35, text_threshold: float = 0.25
    ) -> None:
        self.box_threshold = box_threshold
        self.text_threshold = text_threshold
        self._model: Any | None = None
        self._load_image: Callable[..., Any] | None = None
        self._predict_fn: Callable[..., Any] | None = None

    def readiness(self) -> ModelReadiness:
        for dependency in ("groundingdino", "torch", "huggingface_hub"):
            if find_spec(dependency) is None:
                return ModelReadiness(False, "DEPENDENCY_UNAVAILABLE", f"Required dependency {dependency} is unavailable.")
        import groundingdino
        import torch
        if not torch.cuda.is_available():
            return ModelReadiness(False, "CUDA_UNAVAILABLE", "A CUDA GPU is required for Grounding DINO.")
        config = Path(groundingdino.__file__).resolve().parent / "config" / "GroundingDINO_SwinT_OGC.py"
        if not config.is_file():
            return ModelReadiness(False, "NOT_CONFIGURED", "Grounding DINO configuration is unavailable.")
        from huggingface_hub import try_to_load_from_cache
        try:
            checkpoint = try_to_load_from_cache(
                "ShilongLiu/GroundingDINO", "groundingdino_swint_ogc.pth"
            )
        except Exception:
            checkpoint = None
        if not isinstance(checkpoint, str) or not Path(checkpoint).is_file():
            return ModelReadiness(False, "MODEL_UNAVAILABLE", "Grounding DINO checkpoint is not available locally.")
        return ModelReadiness(True)

    def _load(self) -> None:
        """Load the package and checkpoint only on first real inference."""
        if self._model is not None:
            return
        try:
            import groundingdino
            import torch
            from groundingdino.util.inference import load_image, load_model, predict
            from huggingface_hub import hf_hub_download
        except ImportError as exc:
            raise RuntimeError(
                "Grounding DINO inference requires groundingdino, torch, and huggingface-hub"
            ) from exc
        if not torch.cuda.is_available():
            raise RuntimeError(
                "Grounding DINO inference requires a CUDA GPU; CPU fallback is disabled"
            )

        config_path = (
            Path(groundingdino.__file__).resolve().parent
            / "config"
            / "GroundingDINO_SwinT_OGC.py"
        )
        if not config_path.is_file():
            raise RuntimeError("Grounding DINO Swin-T configuration is unavailable")
        try:
            checkpoint_path = hf_hub_download(
                repo_id="ShilongLiu/GroundingDINO",
                filename="groundingdino_swint_ogc.pth",
                local_files_only=True,
            )
            self._model = load_model(
                str(config_path), checkpoint_path, device="cuda"
            )
        except Exception as exc:
            raise RuntimeError(
                "Grounding DINO Swin-T checkpoint could not be loaded"
            ) from exc
        self._load_image = load_image
        self._predict_fn = predict

    def _predict(
        self, image_path: str, question: str
    ) -> tuple[list[list[float]], list[float], list[str]]:
        self._load()
        assert (
            self._model is not None
            and self._load_image is not None
            and self._predict_fn is not None
        )
        _, image = self._load_image(image_path)
        boxes, scores, labels = self._predict_fn(
            model=self._model,
            image=image,
            caption=question,
            box_threshold=self.box_threshold,
            text_threshold=self.text_threshold,
            device="cuda",
        )
        return (
            boxes.detach().cpu().tolist(),
            scores.detach().cpu().tolist(),
            list(labels),
        )

    def infer(self, image_paths: list[str], question: str) -> dict:
        if len(image_paths) != 1:
            raise ValueError("Grounding DINO requires exactly one image path")
        image_path = Path(image_paths[0])
        if not image_path.is_file():
            raise FileNotFoundError(f"Image path does not exist: {image_path}")
        query = question.strip()
        if not query:
            raise ValueError("Grounding DINO requires a non-empty text query")

        boxes, scores, labels = self._predict(str(image_path), query)
        evidence = []
        for box, score, label in zip(boxes, scores, labels, strict=True):
            center_x, center_y, width, height = map(float, box)
            coordinates = [
                max(0.0, min(1.0, center_x - width / 2)),
                max(0.0, min(1.0, center_y - height / 2)),
                max(0.0, min(1.0, center_x + width / 2)),
                max(0.0, min(1.0, center_y + height / 2)),
            ]
            evidence.append(
                {
                    "type": "bounding_box",
                    "label": str(label),
                    "coordinates": coordinates,
                    "coordinate_space": "normalized_xyxy",
                    "confidence": max(0.0, min(1.0, float(score))),
                    "source_scene_id": None,
                }
            )

        count = len(evidence)
        answer = (
            f"No match found for '{query}'."
            if count == 0
            else f"Found {count} match{'es' if count != 1 else ''} for '{query}'."
        )
        return {"answer": answer, "evidence": evidence}
