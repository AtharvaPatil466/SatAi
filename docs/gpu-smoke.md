# Offline GPU inference smoke

This is operational verification of one live inference per provider. It is not a benchmark or model evaluation. The command never installs packages, downloads weights or datasets, or uses cached answer artifacts.

## Artifacts

`configs/model_artifacts.json` defines both providers. Qwen uses `Qwen/Qwen2.5-VL-3B-Instruct`; its local directory needs `config.json` with `model_type: qwen2_5_vl`, `preprocessor_config.json`, `tokenizer_config.json`, `tokenizer.json`, and either a nonempty `model.safetensors`/`pytorch_model.bin` or every nonempty shard named in `model.safetensors.index.json`. Grounding DINO uses the installed `GroundingDINO_SwinT_OGC.py` architecture and the nonempty `groundingdino_swint_ogc.pth` checkpoint from `ShilongLiu/GroundingDINO`.

The repository has **no verified model revision or weight checksum** for either artifact. The manifest records both as `null`. File completeness confirms that the providers can locate the files; it cannot prove weight provenance. Supply trusted artifacts separately and keep weights outside Git. The default Kaggle paths are `/kaggle/input/satquery-models/qwen2.5-vl-3b-instruct` and `/kaggle/input/satquery-models/groundingdino_swint_ogc.pth`. Set `SATQUERY_QWEN_MODEL_DIR` and `SATQUERY_GROUNDING_CHECKPOINT` to use other exact local paths. When neither path is set nor the default exists, the existing Hugging Face cache is checked with local-only lookup. A specified missing path fails closed without falling back.

## GPU prerequisite and command

Use a Kaggle T4 or other CUDA NVIDIA runtime with this repository and its committed `data/demo` assets mounted. Before the offline run, install compatible CUDA PyTorch, `transformers==4.49.0`, `qwen-vl-utils`, `accelerate`, `huggingface-hub`, and `groundingdino-py==0.4.0`. These are the versions and packages used by the existing Kaggle evaluation runners; the report records the actual installed versions. Provision the two model artifacts at the paths above. Package installation and artifact provisioning are separate setup steps; they are never attempted by the smoke command.

From the repository root on the GPU runtime:

```sh
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python scripts/gpu_smoke.py --out /kaggle/working/satquery-gpu-smoke.json
```

The command checks the committed image hashes, dependencies, CUDA, package configuration, and local artifacts, then calls each provider's real `infer` method. Qwen uses the 307×307 LoveDA image `data/demo/resolution/loveda_LoveDA_images_png_0_gsd1.0.png` with **“What are the main visible features in this image?”**. Grounding DINO uses `data/demo/grounding/07272.jpg` with **“A yellow ship”**. Qwen's wrapper appends its existing short-answer instruction. The runner verifies a nonempty Qwen answer and valid normalized grounding boxes; zero grounding detections are structurally valid and remain visible through `evidence_count: 0`.

The JSON report has `schema_version`, UTC `timestamp`, `runtime` (Python, platform, Torch, CUDA runtime, GPU, installed dependency versions), and one `cases` entry per provider. Each case records provider and model identity, known artifact identity and resolved path, input path and SHA-256, question or expression, `execution_mode: live`, `results_artifact: null`, success, measured inference latency, structural output summary, and failure reason. The exit code is nonzero if either case fails. A one-sample latency is diagnostic only.
