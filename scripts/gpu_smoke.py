"""One live inference per provider; run only on a provisioned CUDA host."""

import argparse
import gc
import hashlib
import importlib.metadata
import json
import math
import platform
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.artifacts import load_manifest, validate_artifact  # noqa: E402
from models.grounding_dino import GroundingDINOModel  # noqa: E402
from models.qwen_vl import QwenVLModel  # noqa: E402

CASES = {
    "qwen2.5vl-3b": ("data/demo/resolution/loveda_LoveDA_images_png_0_gsd1.0.png", "What are the main visible features in this image?"),
    "grounding-dino-swint": ("data/demo/grounding/07272.jpg", "A yellow ship"),
}


def validate_result(provider: str, result: dict) -> dict:
    if not isinstance(result, dict) or result.get("execution_mode") not in (None, "live") or result.get("results_artifact") is not None or result.get("_results_artifact") is not None:
        raise ValueError("Live smoke received cached or malformed result")
    if not isinstance(result.get("answer"), str) or not result["answer"].strip():
        raise ValueError("Non-empty answer required")
    evidence = result.get("evidence")
    if not isinstance(evidence, list):
        raise ValueError("Evidence must be a list")
    if provider == "qwen2.5vl-3b":
        if evidence or result.get("confidence") is not None:
            raise ValueError("Invalid Qwen result")
        return {"answer_nonempty": True, "evidence_count": 0}
    if provider != "grounding-dino-swint":
        raise ValueError("Unknown provider")
    for item in evidence:
        if not isinstance(item, dict) or item.get("type") != "bounding_box" or item.get("coordinate_space") != "normalized_xyxy" or not isinstance(item.get("label"), str):
            raise ValueError("Invalid grounding evidence")
        box = item.get("coordinates")
        score = item.get("confidence")
        if not isinstance(box, list) or len(box) != 4 or any(not isinstance(v, (float, int)) or isinstance(v, bool) or not math.isfinite(v) or not 0 <= v <= 1 for v in box) or not (box[0] < box[2] and box[1] < box[3]):
            raise ValueError("Invalid grounding box")
        if not isinstance(score, (float, int)) or isinstance(score, bool) or not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Invalid grounding confidence")
    return {"answer_nonempty": True, "evidence_count": len(evidence)}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def case_report(provider: str) -> dict:
    spec = load_manifest()["providers"][provider]
    scene_path, question = CASES[provider]
    return {
        "provider": provider, "model_identity": spec["model_id"],
        "artifact_identity": {"revision": spec["revision"], "sha256": spec["sha256"]},
        "execution_mode": "live", "results_artifact": None,
        "input": {"path": scene_path, "sha256": None}, "question_or_expression": question,
        "success": False, "latency_seconds": None, "output_summary": None, "failure": None,
    }


def release_cuda_memory() -> None:
    """Release unreachable provider state before the next independent case."""
    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def run_case(provider: str) -> dict:
    report = case_report(provider)
    scene = ROOT / report["input"]["path"]
    model = None
    try:
        manifest = json.loads((ROOT / "data/demo/manifest.json").read_text(encoding="utf-8"))
        expected = (manifest["resolution_ladder"]["rungs"][1]["asset_sha256"] if provider == "qwen2.5vl-3b" else manifest["scenes"][1]["asset_sha256"])
        actual = sha256(scene)
        report["input"]["sha256"] = actual
        if actual != expected:
            raise ValueError("Smoke input hash differs from committed manifest")
        model = QwenVLModel() if provider == "qwen2.5vl-3b" else GroundingDINOModel()
        readiness = model.readiness()
        if not readiness.available:
            report["failure"] = {"reason_code": readiness.reason_code, "detail": readiness.detail}
            return report
        artifact = validate_artifact(provider)
        if not artifact.available:
            report["failure"] = {"reason_code": artifact.reason_code, "detail": artifact.detail}
            return report
        report["artifact_identity"]["resolved_path"] = str(artifact.path)
        start = time.perf_counter()
        result = model.infer([str(scene)], report["question_or_expression"])
        report["latency_seconds"] = round(time.perf_counter() - start, 3)
        report["output_summary"] = validate_result(provider, result)
        report["success"] = True
    except Exception as exc:
        report["failure"] = {"reason_code": "SMOKE_FAILED", "detail": f"{type(exc).__name__}: {exc}"}
    finally:
        model = None
        release_cuda_memory()
    return report


def run_isolated_case(provider: str, directory: Path) -> dict:
    """Run one provider in a fresh process so CUDA state cannot cross cases."""
    output = directory / f"{provider}.json"
    completed = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--provider", provider, "--out", str(output)],
        text=True,
        capture_output=True,
        check=False,
    )
    try:
        return json.loads(output.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        report = case_report(provider)
        detail = " ".join((completed.stderr or completed.stdout).split())[:300]
        report["failure"] = {
            "reason_code": "SMOKE_PROCESS_FAILED",
            "detail": detail or f"Provider process exited {completed.returncode} without a report.",
        }
        return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("/kaggle/working/satquery-gpu-smoke.json"))
    parser.add_argument("--provider", choices=tuple(CASES), help=argparse.SUPPRESS)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.provider:
        case = run_case(args.provider)
        args.out.write_text(json.dumps(case, indent=2) + "\n", encoding="utf-8")
        return 0 if case["success"] else 1
    try:
        import torch
        cuda = torch.cuda.is_available()
        torch_version, cuda_runtime = torch.__version__, torch.version.cuda
        gpu_name = torch.cuda.get_device_name(0) if cuda else None
    except ImportError:
        cuda = False
        torch_version = cuda_runtime = gpu_name = None
    dependencies = {}
    for package in ("transformers", "qwen-vl-utils", "accelerate", "groundingdino-py", "huggingface-hub"):
        try:
            dependencies[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            dependencies[package] = None
    report = {
        "schema_version": "gpu-smoke.v1", "timestamp": datetime.now(timezone.utc).isoformat(),
        "runtime": {"python": sys.version.split()[0], "platform": platform.platform(), "torch": torch_version, "cuda_runtime": cuda_runtime, "cuda_available": cuda, "gpu_name": gpu_name, "dependencies": dependencies},
        "cases": [],
    }
    if cuda:
        with tempfile.TemporaryDirectory(prefix="satquery-smoke-", dir=args.out.parent) as temporary:
            report["cases"] = [
                run_isolated_case(provider, Path(temporary)) for provider in CASES
            ]
    else:
        report["cases"] = [case_report(provider) for provider in CASES]
        for case in report["cases"]:
            case["failure"] = {"reason_code": "CUDA_UNAVAILABLE", "detail": "CUDA GPU required"}
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"GPU smoke report: {args.out}")
    return 0 if all(case["success"] for case in report["cases"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
