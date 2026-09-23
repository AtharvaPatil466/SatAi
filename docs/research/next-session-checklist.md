# Next session execution checklist

1. **Verify the local branch before any remote action.**
   ```bash
   cd "/Users/soham/hackatons /sih2026-migration-phase-a"
   git status --short
   git log --oneline ae6c5243bb0f557862bcb4c6228e07579d3268f9..HEAD
   python3 -m pytest -q
   git diff --check ae6c5243bb0f557862bcb4c6228e07579d3268f9..HEAD
   ```
2. **Review the complete canonical diff and exclusions.**
   ```bash
   git diff --stat ae6c5243bb0f557862bcb4c6228e07579d3268f9..HEAD
   test -z "$(git diff --name-only ae6c5243bb0f557862bcb4c6228e07579d3268f9..HEAD -- frontend)"
   ```
3. **Push only the reviewed migration branch.**
   ```bash
   git push -u origin migration/post-phase0-satquery-core
   ```
4. **Open a PR into canonical `main` using `docs/research/migration-pr-draft.md`; do not merge until review and CI pass.**
5. **On Kaggle, check out the reviewed PR commit and follow `docs/remote-sensing-adaptation.md` through RSVQA provisioning and the one-sample QLoRA gradient dry run.**
6. If the dry run is finite and memory-safe, run the bounded 10-step/128-sample training command and preserve `training-report.json`, logs, and adapter externally.
7. Compare base versus adapter on validation. Lock configuration before any official test run and report negative results truthfully.
8. Provision one bounded CDSE bi-temporal pair and follow `docs/research/change-smoke-plan.md`.
9. Reproduce the provider GPU smoke on the reviewed canonical commit when model artifacts are mounted; treat it as runtime verification only.
