"""Lazy, inference-only Qwen2.5-VL wrapper."""

from pathlib import Path
from importlib.util import find_spec
from typing import Any

from models.base import Model, ModelReadiness


class QwenVLModel(Model):
    """Frozen Qwen2.5-VL-3B-Instruct model for zero-shot VQA."""

    name = "qwen2.5vl-3b"
    version = "Qwen/Qwen2.5-VL-3B-Instruct"

    def __init__(self, model_id: str = version, max_new_tokens: int = 50) -> None:
        self.model_id = model_id
        self.max_new_tokens = max_new_tokens
        self._model: Any | None = None
        self._processor: Any | None = None
        self._process_vision_info: Any | None = None

    def readiness(self) -> ModelReadiness:
        for dependency in ("torch", "transformers", "qwen_vl_utils", "accelerate", "huggingface_hub"):
            if find_spec(dependency) is None:
                return ModelReadiness(False, "DEPENDENCY_UNAVAILABLE", f"Required dependency {dependency} is unavailable.")
        import torch
        if not torch.cuda.is_available():
            return ModelReadiness(False, "CUDA_UNAVAILABLE", "A CUDA GPU is required for Qwen inference.")
        from huggingface_hub import snapshot_download
        try:
            snapshot = Path(self.model_id)
            if not snapshot.is_dir():
                snapshot = Path(snapshot_download(self.model_id, local_files_only=True))
            index = snapshot / "model.safetensors.index.json"
            if index.is_file():
                import json
                shards = json.loads(index.read_text(encoding="utf-8"))["weight_map"].values()
                weights_ready = all((snapshot / shard).is_file() for shard in shards)
            else:
                weights_ready = (snapshot / "model.safetensors").is_file() or (snapshot / "pytorch_model.bin").is_file()
            files_ready = all((snapshot / name).is_file() for name in ("config.json", "preprocessor_config.json", "tokenizer_config.json"))
            if not weights_ready or not files_ready:
                raise FileNotFoundError
        except Exception:
            return ModelReadiness(False, "MODEL_UNAVAILABLE", "Qwen model files are not available locally.")
        return ModelReadiness(True)

    def _load(self) -> None:
        """Load weights only on the first real inference call."""
        if self._model is not None:
            return
        try:
            import torch
            from qwen_vl_utils import process_vision_info
            from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        except ImportError as exc:
            raise RuntimeError(
                "Qwen inference requires transformers>=4.49, qwen-vl-utils, accelerate, and torch"
            ) from exc
        if not torch.cuda.is_available():
            raise RuntimeError(
                "Qwen2.5-VL inference requires a CUDA GPU for this baseline; use the Kaggle T4 runner"
            )
        self._model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            self.model_id,
            torch_dtype=torch.float16,
            device_map="auto",
            local_files_only=True,
        )
        self._model.eval()
        for parameter in self._model.parameters():
            parameter.requires_grad_(False)
        self._processor = AutoProcessor.from_pretrained(self.model_id, local_files_only=True)
        self._process_vision_info = process_vision_info

    def _generate_answer(self, image_paths: list[str], question: str) -> str:
        self._load()
        import torch

        assert (
            self._model is not None
            and self._processor is not None
            and self._process_vision_info is not None
        )
        content = [
            {"type": "image", "image": Path(image_path).resolve().as_uri()}
            for image_path in image_paths
        ]
        content.append({"type": "text", "text": question})
        messages = [{"role": "user", "content": content}]
        prompt = self._processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        image_inputs, video_inputs = self._process_vision_info(messages)
        inputs = self._processor(
            text=[prompt],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(self._model.device)
        with torch.inference_mode():
            generated_ids = self._model.generate(
                **inputs,
                do_sample=False,
                max_new_tokens=self.max_new_tokens,
            )
        trimmed_ids = [
            output_ids[len(input_ids) :]
            for input_ids, output_ids in zip(inputs.input_ids, generated_ids)
        ]
        return self._processor.batch_decode(
            trimmed_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]

    def infer(self, image_paths: list[str], question: str) -> dict:
        if not image_paths:
            raise ValueError("Qwen VQA requires at least one image path")
        missing = [path for path in image_paths if not Path(path).is_file()]
        if missing:
            raise FileNotFoundError(f"Image paths do not exist: {missing}")
        question = question + " Answer with a single word or number only. No explanation."
        answer = self._generate_answer(image_paths, question).strip()
        return {
            "answer": answer,
            "confidence": None,
            "evidence": [],
        }
