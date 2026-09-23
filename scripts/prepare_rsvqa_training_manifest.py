"""Build an offline SatQuery manifest from an already-provisioned RSVQA-LR release."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.remote_sensing import SPLITS  # noqa: E402

SOURCE = "RSVQA-LR, Zenodo record 6344334"


def build_manifest(dataset_root: Path, output: Path) -> int:
    image_paths = {path.name: path for path in dataset_root.rglob("*.tif")}
    if not image_paths:
        raise FileNotFoundError(f"No extracted RSVQA-LR TIFF images under {dataset_root}")
    records: list[dict[str, str]] = []
    for split in sorted(SPLITS):
        file_split = "val" if split == "validation" else split
        prefix = f"LR_split_{file_split}"
        paths = {
            name: dataset_root / f"{prefix}_{name}.json"
            for name in ("images", "questions", "answers")
        }
        missing = [str(path) for path in paths.values() if not path.is_file()]
        if missing:
            raise FileNotFoundError(f"Missing official RSVQA-LR metadata: {missing}")
        images = json.loads(paths["images"].read_text(encoding="utf-8"))["images"]
        questions = json.loads(paths["questions"].read_text(encoding="utf-8"))["questions"]
        answers = json.loads(paths["answers"].read_text(encoding="utf-8"))["answers"]
        active_images = {int(item["id"]) for item in images if item.get("active")}
        answer_by_question = {
            int(item["question_id"]): str(item["answer"])
            for item in answers
            if item.get("active")
        }
        for question in questions:
            question_id = int(question["id"])
            image_id = int(question["img_id"])
            if not question.get("active") or question_id not in answer_by_question:
                continue
            if image_id not in active_images:
                raise ValueError(f"Question {question_id} references an inactive image")
            image = image_paths.get(f"{image_id}.tif")
            if image is None:
                raise FileNotFoundError(f"RSVQA-LR image is missing: {image_id}.tif")
            records.append(
                {
                    "image": image.relative_to(dataset_root).as_posix(),
                    "instruction": str(question["question"]),
                    "response": answer_by_question[question_id],
                    "dataset": "RSVQA-LR",
                    "source": SOURCE,
                    "split": split,
                    "sample_id": f"{split}-{question_id}",
                }
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
    return len(records)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    count = build_manifest(args.dataset_root.resolve(), args.out.resolve())
    print(f"Wrote {count} validated-source records to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
