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

## Migration provenance

This capability was curated into canonical SatQuery from SatAi commits
`4d43caaaba248ba78060d2eaa0d9d40f687fb1e5` (provider, orchestration, evaluation),
`ff568a9c98b06094fb173446ae679510cb43625f` (scene-pack infrastructure),
`0a18dda11fd467882aad4ecc611107af38783571` (bounded demo fixtures), and
`6f68da9f0c40b3f2ed4c361787fa1bba08889fab` (Qwen null confidence). The generated
Grounding evaluation result artifact from SatAi was deliberately not migrated;
the DIOR image is registered here only as a repository-controlled live smoke fixture.
