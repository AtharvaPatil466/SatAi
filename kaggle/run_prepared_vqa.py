"""Measure the frozen LoveDA prepared-VQA questions once on a Kaggle T4."""

import argparse
import hashlib
import importlib.metadata
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCENE_ID = "loveda_LoveDA_images_png_0_gsd0.3"
MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
QUESTIONS = (
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
DEFAULT_OUTPUT = Path(
    "/kaggle/working/qwen2.5vl-3b__prepared-vqa__loveda-0.json"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def frozen_scene(root: Path = ROOT) -> dict[str, Any]:
    manifest_path = root / "data" / "demo" / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Frozen demo manifest is missing: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    matches = [
        scene
        for scene in manifest.get("scenes", [])
        if scene.get("source", {}).get("source_id") == SCENE_ID
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly one frozen manifest entry for {SCENE_ID}, found {len(matches)}"
        )
    scene = matches[0]
    asset = root / scene["asset_path"]
    if not asset.is_file():
        raise FileNotFoundError(f"Frozen scene asset is missing: {asset}")
    actual_hash = sha256(asset)
    if actual_hash != scene["asset_sha256"]:
        raise RuntimeError(
            f"Frozen scene SHA-256 mismatch: expected {scene['asset_sha256']}, got {actual_hash}"
        )
    return {
        "scene_id": SCENE_ID,
        "asset": asset,
        "asset_path": scene["asset_path"],
        "asset_sha256": actual_hash,
        "pixel_sha256": scene.get("pixel_sha256"),
        "width": scene["width"],
        "height": scene["height"],
    }


def git_revision(root: Path = ROOT) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()


def runtime_provenance(torch: Any) -> dict[str, Any]:
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "torch": torch.__version__,
        "transformers": importlib.metadata.version("transformers"),
        "qwen_vl_utils": importlib.metadata.version("qwen-vl-utils"),
        "cuda_runtime": torch.version.cuda,
        "gpu_count": torch.cuda.device_count(),
        "gpus": [
            torch.cuda.get_device_name(index)
            for index in range(torch.cuda.device_count())
        ],
    }


def artifact(
    scene: dict[str, Any],
    answers: list[str],
    *,
    timestamp: str,
    revision: str,
    runtime: dict[str, Any],
    max_new_tokens: int,
) -> dict[str, Any]:
    if len(answers) != len(QUESTIONS) or any(not answer.strip() for answer in answers):
        raise ValueError("Every prepared question must have one non-empty measured answer")
    stamp = timestamp.replace("-", "").replace(":", "").replace("+00:00", "Z")
    return {
        "schema_version": "prepared-vqa-measurement.v1",
        "run_id": f"qwen2.5vl-3b__prepared-vqa__loveda-0__{stamp}",
        "timestamp": timestamp,
        "git_revision": revision,
        "scene": {
            key: scene[key]
            for key in (
                "scene_id",
                "asset_path",
                "asset_sha256",
                "pixel_sha256",
                "width",
                "height",
            )
        },
        "model": {
            "name": "qwen2.5vl-3b",
            "identity": MODEL_ID,
            "wrapper": "models.qwen_vl.model.QwenVLModel",
        },
        "decoding": {
            "do_sample": False,
            "max_new_tokens": max_new_tokens,
            "torch_dtype": "float16",
            "wrapper_prompt_suffix": " Answer with a single word or number only. No explanation.",
        },
        "runtime": runtime,
        "results": [
            {
                "tile_id": SCENE_ID,
                "image_paths": [scene["asset_path"]],
                "question": question,
                "prediction": {"answer": answer},
            }
            for question, answer in zip(QUESTIONS, answers)
        ],
    }


def write_immutable(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    scene = frozen_scene()

    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU not found. Select a T4 accelerator in Kaggle first.")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-q",
            "transformers>=4.49",
            "qwen-vl-utils",
            "accelerate",
        ],
        check=True,
    )
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from models.qwen_vl.model import QwenVLModel

    model = QwenVLModel(model_id=MODEL_ID)
    answers = [
        model.infer([str(scene["asset"])], question)["answer"]
        for question in QUESTIONS
    ]
    timestamp = datetime.now(timezone.utc).isoformat()
    report = artifact(
        scene,
        answers,
        timestamp=timestamp,
        revision=git_revision(),
        runtime=runtime_provenance(torch),
        max_new_tokens=model.max_new_tokens,
    )
    write_immutable(args.out, report)
    print(f"Kaggle output artifact: {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
