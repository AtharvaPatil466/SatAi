# Pre-commit hypothesis — Grounding DINO on DIOR-RSVG

Before running inference, I expect zero-shot Grounding DINO Swin-T to achieve
**Pr@0.5 between 0.10 and 0.30** on a deterministic, category-stratified
400-expression subset of the official DIOR-RSVG test split (20 expressions per
DIOR category, with deterministic fill from remaining test examples only if a
category has fewer than 20).

The expected range is low because Grounding DINO was trained primarily on
natural-image distributions, while DIOR-RSVG objects are viewed top-down and
are often small, low-contrast, densely repeated, or described using spatial
relationships. Category words may transfer, but selecting the specific remote-
sensing instance named by a referring expression should remain difficult.

The primary prediction for each expression will be the model's
highest-confidence returned box. Selecting a box using ground-truth IoU would
leak the answer into evaluation and inflate Pr@0.5.
