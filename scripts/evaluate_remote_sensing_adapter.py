"""Offline held-out comparison of a base Qwen checkpoint and a trained adapter."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.remote_sensing import (  # noqa: E402
    BASE_MODEL_ID,
    TrainingExample,
    load_manifest,
    messages,
    select_examples,
    sha256_file,
)


def _answer(model, processor, process_vision_info, example: TrainingExample, image_size: int) -> str:
    import torch

    conversation = messages(example, image_size, include_target=False)
    prompt = processor.apply_chat_template(
        conversation, tokenize=False, add_generation_prompt=True
    )
    images, videos = process_vision_info(conversation)
    inputs = processor(
        text=[prompt], images=images, videos=videos, return_tensors="pt"
    ).to(model.device)
    with torch.inference_mode():
        generated = model.generate(**inputs, do_sample=False, max_new_tokens=32)
    trimmed = generated[:, inputs.input_ids.shape[1] :]
    return processor.batch_decode(
        trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0].strip()


def _evaluate(model, processor, process_vision_info, examples, image_size: int) -> dict:
    started = time.perf_counter()
    results = []
    for example in examples:
        prediction = _answer(model, processor, process_vision_info, example, image_size)
        correct = prediction.casefold().strip() == example.response.casefold().strip()
        results.append(
            {
                "sample_id": example.sample_id,
                "expected": example.response,
                "prediction": prediction,
                "exact_match": correct,
            }
        )
    return {
        "sample_count": len(results),
        "exact_match_accuracy": sum(item["exact_match"] for item in results) / len(results),
        "latency_seconds": time.perf_counter() - started,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True, type=Path)
    parser.add_argument("--adapter-path", required=True, type=Path)
    parser.add_argument("--dataset-manifest", required=True, type=Path)
    parser.add_argument("--image-root", type=Path)
    parser.add_argument("--split", choices=("validation", "test"), default="validation")
    parser.add_argument("--max-samples", type=int, default=200)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--image-size", type=int, default=392)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.image_size < 28 or args.image_size % 28:
        raise ValueError("image-size must be a positive multiple of 28")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    if not args.model_path.is_dir() or not args.adapter_path.is_dir():
        raise FileNotFoundError("Local base model and adapter directories are required")
    examples = select_examples(
        load_manifest(args.dataset_manifest, args.image_root),
        args.split,
        args.max_samples,
        args.seed,
    )
    import torch
    from peft import PeftModel
    from qwen_vl_utils import process_vision_info
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

    processor = AutoProcessor.from_pretrained(str(args.model_path), local_files_only=True)
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        str(args.model_path),
        local_files_only=True,
        torch_dtype=torch.float16,
        device_map="auto",
    ).eval()
    base = _evaluate(model, processor, process_vision_info, examples, args.image_size)
    adapted_model = PeftModel.from_pretrained(
        model, str(args.adapter_path), local_files_only=True
    ).eval()
    adapted = _evaluate(
        adapted_model, processor, process_vision_info, examples, args.image_size
    )
    report = {
        "schema_version": 1,
        "base_model_id": BASE_MODEL_ID,
        "base_model_path": str(args.model_path.resolve()),
        "adapter_path": str(args.adapter_path.resolve()),
        "dataset_manifest_sha256": sha256_file(args.dataset_manifest),
        "split": args.split,
        "seed": args.seed,
        "max_samples": args.max_samples,
        "metric": "case-insensitive exact match",
        "base": base,
        "adapted": adapted,
        "accuracy_delta": adapted["exact_match_accuracy"] - base["exact_match_accuracy"],
        "claim": "Measured comparison on the selected held-out samples; no broader accuracy claim.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(args.out), "samples": len(examples)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
