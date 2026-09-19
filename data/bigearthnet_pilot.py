"""Streaming BigEarthNet.txt audit and deterministic bounded pilot selection."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pyarrow.compute as pc
import pyarrow.parquet as pq

REGISTRY_VERSION = "1.0"
PILOT_VERSION = "1.0"
DEFAULT_SEED = 260329630
SEARCH_PATTERNS = {
    "SAR": r"(?i)(?:^|[^A-Za-z0-9_])SAR(?:$|[^A-Za-z0-9_])",
    "radar": r"(?i)(?:^|[^A-Za-z0-9_])radar(?:$|[^A-Za-z0-9_])",
    "Sentinel-1": r"(?i)(?:^|[^A-Za-z0-9_])Sentinel-1(?:$|[^A-Za-z0-9_])",
    "polarization": r"(?i)(?:^|[^A-Za-z0-9_])polari[sz]ation(?:$|[^A-Za-z0-9_])",
    "VV": r"(?i)(?:^|[^A-Za-z0-9_])VV(?:$|[^A-Za-z0-9_])",
    "VH": r"(?i)(?:^|[^A-Za-z0-9_])VH(?:$|[^A-Za-z0-9_])",
    "backscatter": r"(?i)(?:^|[^A-Za-z0-9_])backscatter(?:$|[^A-Za-z0-9_])",
    "optical": r"(?i)(?:^|[^A-Za-z0-9_])optical(?:$|[^A-Za-z0-9_])",
}
CLC_TO_19 = {
    111: "Urban fabric", 112: "Urban fabric", 121: "Industrial or commercial units",
    122: "Unlabeled", 123: "Unlabeled", 124: "Unlabeled", 131: "Unlabeled",
    132: "Unlabeled", 133: "Unlabeled", 141: "Unlabeled", 142: "Unlabeled",
    211: "Arable land", 212: "Arable land", 213: "Arable land",
    221: "Permanent crops", 222: "Permanent crops", 223: "Permanent crops",
    231: "Pastures", 241: "Permanent crops", 242: "Complex cultivation patterns",
    243: "Land principally occupied by agriculture, with significant areas of natural vegetation",
    244: "Agro-forestry areas", 311: "Broad-leaved forest", 312: "Coniferous forest",
    313: "Mixed forest", 321: "Natural grassland and sparsely vegetated areas",
    322: "Moors, heathland and sclerophyllous vegetation",
    323: "Moors, heathland and sclerophyllous vegetation",
    324: "Transitional woodland, shrub", 331: "Beaches, dunes, sands",
    332: "Unlabeled", 333: "Natural grassland and sparsely vegetated areas",
    334: "Unlabeled", 335: "Unlabeled", 411: "Inland wetlands",
    412: "Inland wetlands", 421: "Coastal wetlands", 422: "Coastal wetlands",
    423: "Unlabeled", 511: "Inland waters", 512: "Inland waters",
    521: "Marine waters", 522: "Marine waters", 523: "Marine waters", 999: "Unlabeled",
}
_PATCH = re.compile(
    r"^S2[AB]_MSIL2A_\d{8}T\d{6}_N\d{4}_R\d{3}_T\d{2}[A-Z]{3}_\d{2}_\d{2}$"
)
_S1 = re.compile(
    r"^S1[AB]_IW_GRDH_1S[A-Z]{2}_\d{8}T\d{6}_\d{2}[A-Z]{3}_\d{1,2}_\d{1,2}$"
)
_GROUP = re.compile(r"_(T\d{2}[A-Z]{3})_(\d{2})_(\d{2})$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_SPLITS = ("train", "validation", "test", "bench")


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source_registry(registry: dict[str, Any]) -> dict[str, Any]:
    if registry.get("version") != REGISTRY_VERSION:
        raise ValueError("Unsupported source registry version")
    sources = registry.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Source registry requires at least one source")
    names: set[str] = set()
    for source in sources:
        required = {
            "name",
            "canonical_url",
            "dataset",
            "dataset_version",
            "license",
            "retrieved_at",
            "size_bytes",
            "sha256",
            "distribution",
            "local_path",
        }
        if not isinstance(source, dict) or required - source.keys():
            raise ValueError("Source registry entry is incomplete")
        if source["name"] in names:
            raise ValueError("Source registry names must be unique")
        names.add(source["name"])
        if not str(source["canonical_url"]).startswith("https://"):
            raise ValueError("Source URL must use HTTPS")
        if source["distribution"] not in {"official", "mirror"}:
            raise ValueError("Source distribution must be official or mirror")
        if not isinstance(source["size_bytes"], int) or source["size_bytes"] <= 0:
            raise ValueError("Source byte size must be positive")
        if not _SHA256.fullmatch(str(source["sha256"])):
            raise ValueError("Source checksum must be SHA-256")
        retrieved = datetime.fromisoformat(str(source["retrieved_at"]).replace("Z", "+00:00"))
        if retrieved.utcoffset() is None:
            raise ValueError("Source retrieval timestamp must include a timezone")
        if not source.get("etag") and not source.get("remote_revision"):
            raise ValueError("Source entry requires an ETag or remote revision")
    return registry


def verify_source_registry(registry: dict[str, Any], root: Path) -> None:
    validate_source_registry(registry)
    for source in registry["sources"]:
        path = root / source["local_path"]
        if path.stat().st_size != source["size_bytes"]:
            raise ValueError(f"Source size mismatch: {source['name']}")
        if sha256_file(path) != source["sha256"]:
            raise ValueError(f"Source checksum mismatch: {source['name']}")


def geographic_group(patch_id: str) -> str | None:
    match = _GROUP.search(patch_id)
    return "_".join(match.groups()) if match else None


def _count_matches(values: Any, pattern: str) -> int:
    matches = pc.match_substring_regex(values, pattern)
    return int(pc.sum(pc.fill_null(matches, False)).as_py() or 0)


def _metadata_records(paths: Iterable[Path]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    duplicate_patches = 0
    conflicting_pairs = 0
    for path in paths:
        table = pq.read_table(path)
        for row in table.to_pylist():
            patch_id = row["patch_id"]
            if patch_id in records:
                duplicate_patches += 1
                conflicting_pairs += records[patch_id]["s1_name"] != row["s1_name"]
            else:
                records[patch_id] = row
    return records, {
        "rows": len(records) + duplicate_patches,
        "unique_patch_ids": len(records),
        "duplicate_patch_ids": duplicate_patches,
        "conflicting_s1_mappings": conflicting_pairs,
    }


def audit_annotations(
    annotation_path: Path, metadata_paths: Iterable[Path]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    parquet = pq.ParquetFile(annotation_path)
    row_count = parquet.metadata.num_rows
    seen_ids = bytearray(row_count + 1)
    out_of_range_ids: set[int] = set()
    duplicate_ids = 0
    patches: dict[str, dict[str, Any]] = {}
    s1_names: set[str] = set()
    pairs: set[tuple[str, str]] = set()
    split_rows: Counter[str] = Counter()
    split_patches: dict[str, set[str]] = defaultdict(set)
    split_s1: dict[str, set[str]] = defaultdict(set)
    type_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    country_rows: Counter[str] = Counter()
    season_rows: Counter[str] = Counter()
    missing: Counter[str] = Counter()
    malformed: Counter[str] = Counter()
    conflicts: Counter[str] = Counter()
    search = {term: {"input": 0, "output": 0, "either": 0} for term in SEARCH_PATTERNS}

    columns = [
        "ID",
        "s1_name",
        "patch_id",
        "input",
        "output",
        "type",
        "category",
        "split",
        "latitude",
        "longitude",
        "country",
        "season",
    ]
    for batch in parquet.iter_batches(batch_size=65_536, columns=columns):
        data = batch.to_pydict()
        for term, pattern in SEARCH_PATTERNS.items():
            search[term]["input"] += _count_matches(batch.column(3), pattern)
            search[term]["output"] += _count_matches(batch.column(4), pattern)
            either = pc.binary_join_element_wise(batch.column(3), batch.column(4), " ")
            search[term]["either"] += _count_matches(either, pattern)
        for index, patch_id in enumerate(data["patch_id"]):
            annotation_id = data["ID"][index]
            if annotation_id is None:
                missing["ID"] += 1
            elif 0 <= annotation_id <= row_count:
                duplicate_ids += bool(seen_ids[annotation_id])
                seen_ids[annotation_id] = 1
            else:
                duplicate_ids += annotation_id in out_of_range_ids
                out_of_range_ids.add(annotation_id)

            s1_name = data["s1_name"][index]
            split = data["split"][index]
            country = data["country"][index]
            season = data["season"][index]
            for key, value in (
                ("patch_id", patch_id),
                ("s1_name", s1_name),
                ("split", split),
                ("country", country),
                ("season", season),
            ):
                missing[key] += value is None or value == ""
            malformed["patch_id"] += not isinstance(patch_id, str) or not _PATCH.fullmatch(patch_id)
            malformed["s1_name"] += not isinstance(s1_name, str) or not _S1.fullmatch(s1_name)
            malformed["split"] += split not in _SPLITS
            if not isinstance(patch_id, str) or not isinstance(s1_name, str):
                continue

            s1_names.add(s1_name)
            pairs.add((patch_id, s1_name))
            split_rows[str(split)] += 1
            split_patches[str(split)].add(patch_id)
            split_s1[str(split)].add(s1_name)
            type_counts[str(data["type"][index])] += 1
            category_counts[str(data["category"][index])] += 1
            country_rows[str(country)] += 1
            season_rows[str(season)] += 1
            current = patches.get(patch_id)
            fields = {
                "patch_id": patch_id,
                "s1_name": s1_name,
                "split": split,
                "country": country,
                "season": season,
                "latitude": data["latitude"][index],
                "longitude": data["longitude"][index],
            }
            if current is None:
                patches[patch_id] = {**fields, "annotation_count": 1}
            else:
                current["annotation_count"] += 1
                for key in fields.keys() - {"patch_id"}:
                    conflicts[key] += current[key] != fields[key]

    metadata, metadata_stats = _metadata_records(metadata_paths)
    unresolved_patches = sorted(set(patches) - set(metadata))
    pair_mismatches = sorted(
        patch_id
        for patch_id, record in patches.items()
        if patch_id in metadata and record["s1_name"] != metadata[patch_id]["s1_name"]
    )
    candidates: list[dict[str, Any]] = []
    for patch_id, record in patches.items():
        meta = metadata.get(patch_id)
        if not meta:
            continue
        candidates.append(
            {
                **record,
                "labels": sorted(meta["labels"] or []),
                "metadata_split": meta["split"],
                "metadata_country": meta["country"],
                "contains_seasonal_snow": meta["contains_seasonal_snow"],
                "contains_cloud_or_shadow": meta["contains_cloud_or_shadow"],
                "geographic_group": geographic_group(patch_id),
            }
        )

    country_scenes = Counter(record["country"] for record in patches.values())
    season_scenes = Counter(record["season"] for record in patches.values())

    audit = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "annotation_rows": row_count,
        "unique_patch_ids": len(patches),
        "unique_s1_names": len(s1_names),
        "unique_scene_pairs": len(pairs),
        "split_rows": dict(sorted(split_rows.items())),
        "unique_scenes_per_split": {
            split: {
                "patch_ids": len(split_patches[split]),
                "s1_names": len(split_s1[split]),
            }
            for split in sorted(split_rows)
        },
        "task_types": dict(type_counts.most_common()),
        "categories": dict(category_counts.most_common()),
        "country_rows": dict(country_rows.most_common()),
        "country_scenes": dict(country_scenes.most_common()),
        "season_rows": dict(season_rows.most_common()),
        "season_scenes": dict(season_scenes.most_common()),
        "missing_identifiers": {
            key: missing[key] for key in ("ID", "patch_id", "s1_name", "split", "country", "season")
        },
        "malformed_identifiers": {
            key: malformed[key] for key in ("patch_id", "s1_name", "split")
        },
        "duplicate_annotation_ids": duplicate_ids,
        "within_patch_conflicts": dict(conflicts),
        "text_search": {
            "method": "case-insensitive whole-token RE2 regex over input, output, and their concatenation",
            "patterns": SEARCH_PATTERNS,
            "counts": search,
        },
        "metadata": metadata_stats,
        "mapping": {
            "annotation_patches_missing_from_v2_metadata": len(unresolved_patches),
            "sample_unresolved_patch_ids": unresolved_patches[:20],
            "annotation_to_metadata_s1_mismatches": len(pair_mismatches),
            "sample_s1_mismatches": pair_mismatches[:20],
        },
    }
    return audit, candidates


def _stable_hash(seed: int, value: str) -> str:
    return hashlib.sha256(f"{seed}:{value}".encode()).hexdigest()


def expected_asset_paths(patch_id: str, s1_name: str) -> dict[str, Any]:
    s2_tile = patch_id.rsplit("_", 2)[0]
    s1_tile = s1_name.rsplit("_", 3)[0]
    return {
        "s2_bands": [
            f"BigEarthNet-S2/{s2_tile}/{patch_id}/{patch_id}_{band}.tif"
            for band in ("B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B09", "B11", "B12")
        ],
        "s1_bands": [
            f"BigEarthNet-S1/{s1_tile}/{s1_name}/{s1_name}_{polarization}.tif"
            for polarization in ("VV", "VH")
        ],
        "reference_map": (
            f"Reference_Maps/{s2_tile}/{patch_id}/{patch_id}_reference_map.tif"
        ),
    }


def select_pilot(
    candidates: Iterable[dict[str, Any]], max_pairs: int = 100, seed: int = DEFAULT_SEED
) -> list[dict[str, Any]]:
    if not 1 <= max_pairs <= 100:
        raise ValueError("Pilot selection must contain between 1 and 100 pairs")
    by_patch: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        patch_id = candidate["patch_id"]
        if patch_id in by_patch and by_patch[patch_id]["s1_name"] != candidate["s1_name"]:
            raise ValueError(f"Patch has conflicting S1 mappings: {patch_id}")
        by_patch[patch_id] = candidate

    buckets: dict[str, dict[tuple[str, str, str], deque[dict[str, Any]]]] = defaultdict(dict)
    grouped: dict[str, dict[tuple[str, str, str], list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for candidate in by_patch.values():
        split = candidate["split"]
        if split not in _SPLITS or not candidate.get("geographic_group"):
            continue
        labels = candidate.get("labels") or ["unlabelled"]
        stratum = (str(candidate.get("country")), str(candidate.get("season")), min(labels))
        grouped[split][stratum].append(candidate)
    for split, strata in grouped.items():
        for stratum, records in strata.items():
            records.sort(key=lambda row: _stable_hash(seed, row["patch_id"]))
            buckets[split][stratum] = deque(records)

    selected: list[dict[str, Any]] = []
    used_groups: set[str] = set()
    country_counts: Counter[str] = Counter()
    season_counts: Counter[str] = Counter()
    label_counts: Counter[str] = Counter()
    while len(selected) < max_pairs:
        progress = False
        for split in _SPLITS:
            keys = sorted(
                buckets[split],
                key=lambda key: (
                    country_counts[key[0]],
                    season_counts[key[1]],
                    label_counts[key[2]],
                    _stable_hash(seed, "|".join(key)),
                ),
            )
            if not keys:
                continue
            for key in keys:
                queue = buckets[split][key]
                while queue and queue[0]["geographic_group"] in used_groups:
                    queue.popleft()
                if not queue:
                    continue
                record = dict(queue.popleft())
                record["permitted_roles"] = {
                    "train": ["training"],
                    "validation": ["model_selection_or_calibration_not_both"],
                    "test": ["official_test_evaluation_only"],
                    "bench": ["manual_benchmark_evaluation_only"],
                }[split]
                record["expected_assets"] = expected_asset_paths(
                    record["patch_id"], record["s1_name"]
                )
                selected.append(record)
                used_groups.add(record["geographic_group"])
                country_counts[key[0]] += 1
                season_counts[key[1]] += 1
                label_counts[key[2]] += 1
                progress = True
                break
            if len(selected) >= max_pairs:
                break
        if not progress:
            break
    return selected


def attach_annotation_ids(annotation_path: Path, selected: list[dict[str, Any]]) -> None:
    by_patch = {row["patch_id"]: row for row in selected}
    for row in selected:
        row["annotation_ids"] = []
    parquet = pq.ParquetFile(annotation_path)
    for batch in parquet.iter_batches(batch_size=65_536, columns=["ID", "patch_id"]):
        data = batch.to_pydict()
        for annotation_id, patch_id in zip(data["ID"], data["patch_id"]):
            if patch_id in by_patch:
                by_patch[patch_id]["annotation_ids"].append(annotation_id)
    for row in selected:
        if len(row["annotation_ids"]) != row["annotation_count"]:
            raise ValueError(f"Incomplete annotation group for {row['patch_id']}")


def build_pilot_manifest(selected: list[dict[str, Any]], seed: int) -> dict[str, Any]:
    manifest: dict[str, Any] = {
        "version": PILOT_VERSION,
        "dataset": "BigEarthNet.txt / BigEarthNet v2.0",
        "selection_seed": seed,
        "selection_method": "round-robin by official split and country/season/land-cover stratum",
        "pair_count": len(selected),
        "pairs": selected,
    }
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    manifest["manifest_sha256"] = hashlib.sha256(canonical).hexdigest()
    return manifest


def write_asset_lists(selected: list[dict[str, Any]], output_dir: Path) -> None:
    assets = {
        "s1-members.v1.txt": [
            path for row in selected for path in row["expected_assets"]["s1_bands"]
        ],
        "s2-members.v1.txt": [
            path for row in selected for path in row["expected_assets"]["s2_bands"]
        ],
        "reference-map-members.v1.txt": [
            row["expected_assets"]["reference_map"] for row in selected
        ],
    }
    for name, paths in assets.items():
        (output_dir / name).write_text("\n".join(paths) + "\n")


def audit_reference_maps(root: Path, selected: list[dict[str, Any]]) -> dict[str, Any]:
    import rasterio

    expected = {row["expected_assets"]["reference_map"] for row in selected}
    files = sorted(root.rglob("*.tif"))
    records = []
    class_pixels: Counter[int] = Counter()
    for path in files:
        relative = path.relative_to(root).as_posix()
        patch_id = path.name.removesuffix("_reference_map.tif")
        with rasterio.open(path) as dataset:
            pixels = Counter(map(int, dataset.read(1).ravel()))
            class_pixels.update(pixels)
            records.append(
                {
                    "patch_id": patch_id,
                    "archive_member": relative,
                    "size_bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                    "width": dataset.width,
                    "height": dataset.height,
                    "band_count": dataset.count,
                    "dtype": dataset.dtypes[0],
                    "nodata": dataset.nodata,
                    "crs": str(dataset.crs),
                    "transform": list(dataset.transform)[:6],
                    "resolution": list(dataset.res),
                    "bounds": list(dataset.bounds),
                    "class_ids": sorted(pixels),
                    "acquisition_timestamp": patch_id.split("_")[2],
                    "acquisition_timestamp_provenance": "parsed from patch_id; TIFF has no date tag",
                }
            )
    actual = {record["archive_member"] for record in records}
    return {
        "version": "1.0",
        "source": "BigEarthNet v2.0 Reference_Maps.tar.zst, Zenodo record 10891137",
        "label_provenance": "CLC2018 v2020_u1; derived reference data, not flawless ground truth",
        "class_definition_source": "https://bigearth.net/static/documents/Description_BigEarthNet_v2.pdf",
        "file_count": len(records),
        "total_extracted_bytes": sum(record["size_bytes"] for record in records),
        "missing_expected_members": sorted(expected - actual),
        "unexpected_members": sorted(actual - expected),
        "crs_counts": dict(Counter(record["crs"] for record in records)),
        "resolution_counts": dict(Counter(map(str, (record["resolution"] for record in records)))),
        "shape_counts": dict(
            Counter(str((record["width"], record["height"], record["band_count"])) for record in records)
        ),
        "nodata_counts": dict(Counter(str(record["nodata"]) for record in records)),
        "class_pixel_counts": {str(key): value for key, value in sorted(class_pixels.items())},
        "class_definitions": {
            str(key): CLC_TO_19.get(key, "UNKNOWN") for key in sorted(class_pixels)
        },
        "records": records,
    }


def verify_pilot_manifest(manifest: dict[str, Any]) -> None:
    expected = manifest.get("manifest_sha256")
    content = {key: value for key, value in manifest.items() if key != "manifest_sha256"}
    actual = hashlib.sha256(
        json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if expected != actual:
        raise ValueError("Pilot manifest checksum mismatch")
    pairs = manifest.get("pairs", [])
    if len(pairs) > 100 or len({row["patch_id"] for row in pairs}) != len(pairs):
        raise ValueError("Pilot manifest contains duplicate or excessive scene pairs")
    if len({(row["patch_id"], row["s1_name"]) for row in pairs}) != len(pairs):
        raise ValueError("Pilot manifest contains duplicate scene pairs")
    if len({row["geographic_group"] for row in pairs}) != len(pairs):
        raise ValueError("Pilot manifest contains duplicate geographic groups")
    if any(
        len(row["annotation_ids"]) != row["annotation_count"]
        or len(set(row["annotation_ids"])) != row["annotation_count"]
        for row in pairs
    ):
        raise ValueError("Pilot manifest has incomplete annotation groups")
    for row in pairs:
        valid_split_mapping = row["split"] == row["metadata_split"] or (
            row["split"] == "bench" and row["metadata_split"] == "test"
        )
        if not valid_split_mapping:
            raise ValueError("Pilot manifest changed an official split")
        if row["split"] in {"test", "bench"} and any(
            role in {"training", "calibration"} for role in row["permitted_roles"]
        ):
            raise ValueError("Evaluation scene assigned to training or calibration")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--external-dir", type=Path, default=Path("data/external/bigearthnet"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/manifests/bigearthnet"))
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    annotation = args.external_dir / "BigEarthNet.txt.parquet"
    metadata = [
        args.external_dir / "metadata.parquet",
        args.external_dir / "metadata_for_patches_with_snow_cloud_or_shadow.parquet",
    ]
    audit, candidates = audit_annotations(annotation, metadata)
    selected = select_pilot(candidates, seed=args.seed)
    attach_annotation_ids(annotation, selected)
    manifest = build_pilot_manifest(selected, args.seed)
    verify_pilot_manifest(manifest)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "annotation-audit.v1.json").write_text(
        json.dumps(audit, indent=2, sort_keys=True) + "\n"
    )
    (args.output_dir / "pilot-candidates.v1.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    write_asset_lists(selected, args.output_dir)


if __name__ == "__main__":
    main()
