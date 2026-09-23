# Qwen remote-sensing adaptation

SatQuery's first trainable remote-sensing VLM path adapts `Qwen/Qwen2.5-VL-3B-Instruct` with PEFT LoRA. The default GPU configuration uses 4-bit NF4 base-weight quantization with fp16 computation, commonly called QLoRA. GPU feasibility is established only when the dry run and bounded training command succeed on the target runtime.

## Dataset choice and contract

The initial dataset is the official RSVQA-LR release from Zenodo record 6344334. It already has genuine remote-sensing images, questions, answers, and official train/validation/test splits, and the repository already uses its test split for frozen-Qwen evaluation. This is a smaller provisioning path than BigEarthNet.txt. BigEarthNet.txt contains text annotations but no pixels; its separate native imagery is still required before it could supply complete training examples.

Training never downloads data. `prepare_rsvqa_training_manifest.py` reads an already-provisioned RSVQA-LR directory and emits JSONL records with `image`, `instruction`, `response`, `dataset`, `source`, `split`, and `sample_id`. Loading fails on malformed JSON, absent or corrupt images, empty text or identity fields, duplicate sample identities, unsupported splits, or the same dataset image appearing across train and evaluation splits. Selection within a split is deterministic from the seed and sample identity.

Training uses only `split=train`. Adapter selection should use `validation`; the official `test` split remains held out for a final locked comparison. Dataset files and generated training artifacts remain outside Git.

## Adaptation configuration

Every setting below is configurable on the command line. Defaults are: 4-bit NF4 with double quantization, fp16 compute, LoRA rank 16, alpha 32, dropout 0.05, target modules `q_proj,k_proj,v_proj,o_proj`, image size 392, batch size 1, gradient accumulation 8, one epoch, learning rate `2e-4`, maximum 512 examples, and seed 17. Image size must be a multiple of Qwen's 28-pixel vision factor. `--quantization none` runs ordinary LoRA, and `--precision bf16` is available only for hardware that supports it. No default is a claim that a particular GPU can complete training.

Each prompt contains one resized image, the original RSVQA question, and the same concise-answer instruction used by the SatQuery Qwen provider. Only assistant target tokens contribute to loss. The base weights remain frozen and the selected attention projections receive LoRA adapters.

`training-report.json` records the base model ID and local path, unknown revision and checksum as `null`, dataset manifest SHA-256, dataset/source identities, split, selected sample IDs and count, seed, all training and adapter settings, dependency versions, adapter location, runtime time, status, and trainer metrics when training completes. It contains no improvement claim.

## Kaggle GPU procedure

Provision these as Kaggle inputs before starting an offline run:

1. The complete local Qwen checkpoint at `/kaggle/input/satquery-models/qwen2.5-vl-3b-instruct`.
2. The official RSVQA-LR metadata JSON files and extracted `Images_LR.zip` TIFFs under `/kaggle/input/rsvqa-lr`.
3. Compatible `peft` and `bitsandbytes` wheels if they are absent from the image. Install those wheels explicitly with `pip --no-index --find-links /kaggle/input/satquery-wheels peft bitsandbytes`; do not let the training command access the network.

From the repository root:

```sh
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

python scripts/prepare_rsvqa_training_manifest.py \
  --dataset-root /kaggle/input/rsvqa-lr \
  --out /kaggle/working/rsvqa-lr.jsonl

python scripts/train_remote_sensing_adapter.py \
  --model-path /kaggle/input/satquery-models/qwen2.5-vl-3b-instruct \
  --dataset-manifest /kaggle/working/rsvqa-lr.jsonl \
  --image-root /kaggle/input/rsvqa-lr \
  --output-dir /kaggle/working/satquery-qwen-rsvqa-dry-run \
  --max-samples 1 --image-size 224 --batch-size 1 \
  --gradient-accumulation-steps 1 --precision fp16 \
  --quantization 4bit --lora-rank 16 --lora-alpha 32 --dry-run
```

The dry run loads the manifest, constructs and tokenizes a real multimodal prompt, collates labels, loads the local quantized base model, attaches LoRA, and performs one forward/backward loss and gradient check. It performs no optimizer step and writes no adapter.

If that succeeds and observed T4 memory is safe, run the bounded first training job:

```sh
python scripts/train_remote_sensing_adapter.py \
  --model-path /kaggle/input/satquery-models/qwen2.5-vl-3b-instruct \
  --dataset-manifest /kaggle/working/rsvqa-lr.jsonl \
  --image-root /kaggle/input/rsvqa-lr \
  --output-dir /kaggle/working/satquery-qwen-rsvqa-first-run \
  --seed 17 --max-samples 128 --image-size 224 \
  --batch-size 1 --gradient-accumulation-steps 8 \
  --max-steps 10 --precision fp16 --quantization 4bit \
  --lora-rank 16 --lora-alpha 32 --lora-dropout 0.05
```

Then compare the base and adapter on the separate validation split:

```sh
python scripts/evaluate_remote_sensing_adapter.py \
  --model-path /kaggle/input/satquery-models/qwen2.5-vl-3b-instruct \
  --adapter-path /kaggle/working/satquery-qwen-rsvqa-first-run/adapter \
  --dataset-manifest /kaggle/working/rsvqa-lr.jsonl \
  --image-root /kaggle/input/rsvqa-lr \
  --split validation --max-samples 200 --seed 17 --image-size 224 \
  --out /kaggle/working/satquery-qwen-rsvqa-validation.json
```

Bring back the generated JSONL manifest or its SHA-256, `training-report.json`, the complete `adapter/` directory, trainer checkpoints/logs needed for diagnosis, and the validation report. Training completion alone does not demonstrate improvement. Record accuracy only from the generated held-out comparison, keep the official test split untouched until configuration is locked, and do not claim VRSBench, CDVQA, ISRO, or broader remote-sensing performance from RSVQA-LR results.
