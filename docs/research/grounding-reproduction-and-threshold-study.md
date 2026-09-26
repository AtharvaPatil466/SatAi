# Grounding DINO on DIOR-RSVG — reproduction, threshold/prompt study, failure analysis

Track: grounding (brief Days 10–13). Experiment IDs `SQ-20260926-200`…`299`.
Harness: `eval/grounding_research.py` (research-only; the production provider
stays CUDA-only and unmodified).

## 0. Pre-registered selection rule (committed before any validation run)

Threshold and prompt choices are **selected on validation, never on the
400-expression T-quick test subset** (Protocol 01 §2, §9).

- **Selection set (`val-select`)**: 400 expressions, 20 per DIOR class, drawn
  with `suite.stratified_sample(seed=26167)` from the official `val.txt`,
  restricted to images that do **not** occur anywhere in the official
  `test.txt` (the official splits share images; see §1). It shares zero
  images with T-quick.
- **Candidates**: prompt ∈ {`expression`, `head`, `aerial`} ×
  `box_threshold` ∈ {0, 0.05, 0.10, …, 0.50, 0.60}; `text_threshold` fixed at
  0.25 (it cannot change the selected box — verified separately, §3).
  - `expression`: the raw referring expression (baseline).
  - `head`: the expression truncated before its first relational clause
    (`in/on/at/near/next to/…/is/are/located…`), derived from the expression alone.
  - `aerial`: `"aerial image of " + expression`.
  - `category` (readable class name only) is run as a **diagnostic** and is
    **not eligible**: it uses the annotated class, which a user query does not carry.
- **Objective**: val Pr@0.5 with top-1 selection (highest-confidence returned
  box), a missing box scored as IoU 0 and kept in the denominator.
- **Tie-breaks**: prompt ties → `expression`; threshold ties → the highest
  threshold reaching the maximum (fewest boxes returned).
- **Test use**: the chosen configuration is run **once** on T-quick and
  reported beside the baseline. No further change follows from that number.
