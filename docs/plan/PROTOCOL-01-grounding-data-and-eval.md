# PROTOCOL 01 — GROUNDING DATA & EVALUATION

**Status:** DRAFT — requires joint sign-off before any training run
**Parties:** Atharva (model training) · Soham (system integration)
**Dataset:** DIOR-RSVG · **Provider:** Grounding DINO Swin-T · **Capability:** `grounding`
**Satisfies:** Execution Plan §5 Step A — "a small committed data/evaluation protocol
document exists before training begins"

This document locks what may be tuned on what, how a number is computed, and what counts
as an improvement. Once signed, changing any rule here invalidates every comparison made
under the previous version. Bump the version, state the reason, re-measure.

---

## 0. BLOCKER — nothing below can start yet

The PRD freezes Phase 0 at `14e8c14a…` and grounding at `4d43caaa…`. **Neither commit
exists in this repository or on `origin`.** `origin/main` is at `93b21b0`; there is no
`GroundingDINO` reference in any tracked Python file, `capabilities.py` still lists
`GROUNDING` under `UNAVAILABLE_CAPABILITIES`, `/api/capabilities` returns
`grounding: available:false, provider:null`, and no DIOR-RSVG data is present.

**Required from Soham before Step B:**

| # | Artifact | Why it blocks |
|---|---|---|
| 1 | Push both commits to `origin` | Nothing else is reachable |
| 2 | The evaluation harness that produced `Pr@0.5 = 0.1625` | A different harness means the "before" is not comparable to the "after" |
| 3 | **The 400-expression subset manifest** (explicit ID list) | "Deterministic subset" is not reproducible without the IDs |
| 4 | DIOR-RSVG archive or its exact source + checksum | Currently on one machine — single point of failure |
| 5 | `box_threshold` / `text_threshold` used for the baseline | Baseline is meaningless without them |

Until #1–#5 land, the numbers in the PRD cannot be reproduced by anyone but their author.

---

## 1. DATASET IDENTITY

| Field | Value |
|---|---|
| Name | DIOR-RSVG (visual grounding over the DIOR detection corpus) |
| Reference | Zhan, Xiong & Yuan, *RSVG: Exploring Data and Models for Visual Grounding on Remote Sensing Data*, IEEE TGRS 2023 |
| Scale | ~17,402 images · ~38,320 referring expressions · 20 categories |
| Archive SHA-256 | `VERIFY — fill from the downloaded archive` |
| Local path | `VERIFY` |
| Licence | `VERIFY before any public release` |

**Every `VERIFY` above must be replaced with a measured value before sign-off.** Do not
copy figures from the paper into the manifest — read them off the data on disk.

---

## 2. SPLIT DISCIPLINE — THE ONE RULE THAT MATTERS

> **Splits are disjoint by IMAGE ID, never by expression ID.**

DIOR-RSVG carries ~2.2 expressions per image. Splitting on expressions puts the *same
image* in train and test, the model memorises its content, and every test number is
inflated by leakage that no reviewer can see in the metric.

Enforcement — a committed test that fails the build:

```python
assert not (train_image_ids & val_image_ids)
assert not (train_image_ids & test_image_ids)
assert not (val_image_ids  & test_image_ids)
```

Prefer the **official** DIOR-RSVG splits where they exist; they are image-disjoint by
construction and make results comparable to published work. Only if no official split
ships with the archive do we cut our own — and then by image ID, stratified by category,
with the seed recorded below.

### The three splits

| Split | Purpose | May be used for | Size |
|---|---|---|---|
| **TRAIN** | Fitting weights | Gradient updates only | `VERIFY` |
| **VALIDATION** | *Every* selection decision | Checkpoint, LR, epochs, early stopping, `box_threshold`, `text_threshold`, prompt template | `VERIFY` |
| **TEST** | Final locked comparison | One before/after run, after all decisions are frozen | see §4 |

**Validation must not be carved out of the test split.** If DIOR-RSVG ships only
train/test, hold out a validation set **from TRAIN**, image-disjoint, and record the seed.

**The test split is touched once.** Every threshold sweep, checkpoint comparison and prompt
variation happens on validation. A number produced by looking at test and then changing
something is not a measurement.

---

## 3. METRIC DEFINITION

Ambiguity here is how two people produce different numbers from the same checkpoint.

**Pr@0.5** — fraction of expressions whose predicted box has IoU ≥ 0.5 with ground truth.

1. **Prediction selection:** the single **highest-scoring** box returned by the provider
   for that expression. Top-1 only. No oracle selection over multiple candidates, ever.
2. **No prediction = failure.** If no box clears `box_threshold`, the example scores
   IoU = 0 and counts as incorrect. **It is not excluded from the denominator.**
   *This rule is not optional:* dropping empty predictions lets a higher threshold inflate
   Pr@0.5 by answering less, which is the exact behaviour this project exists to prevent.
3. **IoU space:** computed in **absolute pixel coordinates** on the original, unresized
   image, after converting any normalised output back using that image's true dimensions.
4. **Denominator:** every expression in the split. No filtering by category, size or
   difficulty.

**Mean IoU** — arithmetic mean of per-expression IoU over the same denominator, empty
predictions contributing 0.

**Reporting precision:** three significant figures (`0.186`, not `0.186203`). Six figures
on a 400-sample estimate is false precision, and a judge may well ask about it. Every
aggregate is reported **with its 95% Wilson confidence interval**.

---

## 4. SAMPLE SIZE — AND A CONTRADICTION TO RESOLVE

The current locked subset is 400 expressions. At that size:

| Quantity | n | Result |
|---|---|---|
| Aggregate baseline | 400 | 65/400 = 0.1625, **95% CI [0.130, 0.202]** — adequately powered |
| Per-category | ~20 | 95% CI width **≈ 37 pp** — noise, not signal |

**The execution plan requires per-category reporting** ("not hiding regressions behind an
aggregate score") **and that is unachievable at n=400.** With 20 DIOR categories that is
~20 expressions each; a category observed at 30% has a CI of [0.15, 0.52]. Resolving a
10 pp per-category change at 80% power needs **~356 expressions per category — ~7,120
total**.

**Resolution — two test sets, different jobs:**

| Set | Size | Use |
|---|---|---|
| **T-quick** | the locked 400 | Regression guard only. Never the headline number. Preserves comparability with the existing 0.1625 baseline. |
| **T-full** | full official test split (or ≥4,000 stratified) | The reported before/after, and the only source of per-category numbers. |

Grounding DINO Swin-T inference over a few thousand images is well under an hour on a
rented GPU. The 400-expression subset exists because inference was expensive locally, not
because 400 is scientifically sufficient.

**Per-category numbers from T-quick must never be reported.** If T-full is unavailable,
per-category results are reported as *directional only*, with CIs, explicitly labelled
underpowered.

---

## 5. ACCEPTANCE CRITERIA

Agreed **before** training, so the bar is never reverse-engineered from the result.

| Post-training Pr@0.5 (n=400) | 95% CI | Verdict |
|---|---|---|
| 20% | [0.164, 0.242] | **Not an improvement** — overlaps baseline |
| **25%** | [0.210, 0.295] | **Minimum acceptance** — separated |
| 40% | [0.353, 0.449] | Clear success |

**A checkpoint is accepted when all of the following hold:**

1. Pr@0.5 on T-full is **≥ 25%**, with a 95% CI whose lower bound exceeds the zero-shot
   baseline's upper bound, measured under this protocol.
2. Mean IoU does not regress.
3. **No category with ≥30 test expressions regresses by more than 10 pp** versus zero-shot.
   An aggregate gain that hides a destroyed category is a failure, not a win.
4. The provider contract is unchanged — image + query in, validated evidence list out.
5. The no-CUDA path still fails closed.

Failing (1) is an honest negative result and is **reported as such**. Per PRD §5, the
zero-shot number "is a baseline measurement, not a claim" — a negative adaptation result
measured properly is still a completed experiment and still satisfies the SIH
demonstration requirement. It does not become a reason to quietly re-tune on test.

---

## 6. BASELINE RE-MEASUREMENT (do this first)

The PRD's "stop using the final test set for tuning" implies tuning on test has occurred.
If `box_threshold` / `text_threshold` were selected against the same 400 expressions that
produced 0.1625, then **the baseline is optimistically biased** — it is a best-case
zero-shot number, and the measured gain will *understate* the real improvement.

Before training, re-run the zero-shot checkpoint to produce:

| Number | Split | Role |
|---|---|---|
| Pr@0.5 zero-shot | **VALIDATION** | Clean comparison point, never locked |
| Pr@0.5 zero-shot | T-quick (400) | Reproduces 0.1625, confirms harness parity |
| Pr@0.5 zero-shot | T-full | The true "before" in the final comparison |

If the T-quick re-run does not reproduce 0.1625 exactly, **stop** — the harness differs
and nothing downstream is comparable.

---

## 7. COORDINATE-SPACE CONTRACT

Three conventions are in play and two conversions sit between them:

| Producer | Native format |
|---|---|
| Grounding DINO | normalised **cxcywh** |
| Qwen2.5-VL | absolute pixel **xyxy** |
| Evidence contract (PRD §10) | `normalized_xyxy` |

A cxcywh→xyxy error yields boxes that *look* plausible and score terribly — days lost
blaming the model. **Required before the first training run**, a round-trip assertion in
the provider:

```python
# decode → re-encode → compare, on a known box, at a non-square image size
assert to_pixel_xyxy(to_normalized_xyxy(box, w, h), w, h) == approx(box)
```

Non-square images are mandatory in this test: a square fixture passes even when width and
height are transposed.

Every evidence item declares `coordinate_space` explicitly. The frontend overlay converts
using the **source image's true dimensions**, never the rendered element size.

---

## 8. DETERMINISM

Recorded for every run, in the manifest:

| Field | Value |
|---|---|
| Split seed (if we cut our own) | `VERIFY` |
| Training seed | `VERIFY` |
| Data-order seed | `VERIFY` |
| `torch.backends.cudnn.deterministic` | `True` for the accepted run |
| Preprocessing (resize, normalisation, augmentation) | `VERIFY — record exactly` |

Evaluation must be **bit-deterministic**: the same checkpoint over the same split gives
the same number twice. Verify once before trusting any comparison.

---

## 9. TUNABLE ON WHAT — the summary table

| Decision | TRAIN | VAL | TEST |
|---|---|---|---|
| Weight updates | ✅ | ❌ | ❌ |
| Checkpoint selection | ❌ | ✅ | ❌ |
| Learning rate, epochs, early stopping | ❌ | ✅ | ❌ |
| `box_threshold`, `text_threshold` | ❌ | ✅ | ❌ |
| Prompt / template choice | ❌ | ✅ | ❌ |
| Final reported number | ❌ | ❌ | ✅ (once) |

---

## 10. HANDOFF MANIFEST

Extends Execution Plan §18. Soham does not integrate a checkpoint without a complete
manifest.

```yaml
model_name:
base_checkpoint:
base_checkpoint_sha256:          # ADDED — pins what training started from
trained_checkpoint_path:
checkpoint_sha256:
training_config:
training_git_sha:

environment:                     # ADDED — a checkpoint without its env is not reproducible
  python:
  torch:
  transformers:
  cuda:
  gpu_model:

dataset:
  archive_sha256:
  train_split_version:
  validation_split_version:
  test_split_version:
  image_disjoint_verified:       # true | false — must be true
seed:
split_seed:

inference:
  box_threshold:
  text_threshold:
  prompt_template:

validation_Pr@0.5:
validation_mean_IoU:
final_test_Pr@0.5:
final_test_Pr@0.5_CI:            # ADDED — 95% Wilson
final_test_mean_IoU:
final_test_n:                    # ADDED — the denominator
test_set:                        # T-quick | T-full
known_failure_categories:
regressed_categories:            # ADDED — per acceptance criterion 3
notes:
```

---

## 11. OPEN ITEMS — resolve at sign-off

1. Does DIOR-RSVG ship official train/val/test splits? If only train/test, validation is
   cut from **train**, by image, seed recorded.
2. Exact split sizes — read from the data, not the paper.
3. Is T-full the full official test split, or a stratified ≥4,000 sample? Decided by the
   GPU inference budget.
4. Confirm the 20 DIOR categories from the archive, and which have <30 test expressions
   (those are exempt from acceptance criterion 3 and are reported as underpowered).
5. Licence terms for DIOR-RSVG before anything is shown publicly.
6. **The GPU is still unrented.** Everything in §6 onward needs it.

---

## SIGN-OFF

Neither party proceeds to training until both have signed and §0 is cleared.

| | Name | Date | Version signed |
|---|---|---|---|
| Model training | Atharva | | v1.0 |
| System integration | Soham | | v1.0 |

*Protocol 01 · drafted 14 Sep 2026 · supersedes nothing*
