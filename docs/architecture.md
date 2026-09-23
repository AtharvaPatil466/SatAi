# Capability execution architecture

```text
request + scene identity/identities
  → deterministic planner
  → typed execution plan
  → pair compatibility gate (pair capabilities)
  → provider readiness gate
  → provider inference or deterministic analysis
  → validated evidence
  → hash-chained execution trace
  → API response
```

## Input contracts

| Capability | Provider | Required inputs | Execution boundary |
|---|---|---|---|
| `single_image_vqa` | `qwen2.5vl-3b` | One local image | Offline Qwen artifact plus CUDA, or explicitly enabled MPS development mode. |
| `grounding` | `grounding-dino-swint` | One local image and text expression | Offline checkpoint/config plus CUDA; normalized boxes are validated before tracing. |
| `optical_sar` | `optical-sar-deterministic` | One co-registered optical/multispectral raster and one SAR raster | Compatibility must prove required metadata and identical pixel grid; both modalities contribute. |
| `change_vqa` | `change-deterministic` | Exactly two ordered, co-registered observations | Compatibility must prove T1 before T2 and an identical grid. Output is heuristic evidence, not semantic change. |

The planner may represent a change-to-grounding dependency chain, but the executor supports one provider step. Such multi-step plans are explicitly non-executable.

## Availability and evidence semantics

Registration means a provider implementation exists. Readiness means its local dependencies, runtime, configuration, and artifacts can initialize; it says nothing about accuracy. Pair compatibility is checked before pair-provider dispatch and never reprojects, resamples, or co-registers pixels.

Live execution records provider name/version, planner rule, capability, input paths, permitted parameters, execution step, and `execution_mode=live`. Explicit artifact replay records `execution_mode=cached_result`; live failure never selects replay. User declarations stay in manifest provenance and are not presented as observed raster facts.

Qwen, optical-SAR, and change confidence remains `null` when no calibrated value exists. Grounding evidence carries the provider's finite bounded detection score. Evaluation and smoke reports must identify their narrower metric or execution-only scope.
