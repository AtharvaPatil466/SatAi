import copy
import hashlib
import json
from pathlib import Path

import pytest

from data.bigearthnet_pilot import (
    build_pilot_manifest,
    select_pilot,
    sha256_file,
    validate_source_registry,
    verify_pilot_manifest,
    verify_source_registry,
)


def _candidate(index: int, split: str) -> dict:
    return {
        "patch_id": f"S2A_MSIL2A_20170613T101031_N9999_R022_T33UUP_{index:02d}_00",
        "s1_name": f"S1B_IW_GRDH_1SDV_20170612T165809_33UUP_{index:02d}_00",
        "split": split,
        "metadata_split": split,
        "country": "Austria" if index % 2 else "Belgium",
        "metadata_country": "Austria" if index % 2 else "Belgium",
        "season": "Summer" if index % 2 else "Winter",
        "latitude": 48.0,
        "longitude": 12.0,
        "labels": ["Arable land" if index % 2 else "Mixed forest"],
        "annotation_count": 2,
        "contains_seasonal_snow": False,
        "contains_cloud_or_shadow": False,
        "geographic_group": f"T33UUP_{index:02d}_00",
        "annotation_ids": [index * 2, index * 2 + 1],
    }


def test_selection_is_deterministic_unique_grouped_and_split_safe():
    candidates = [_candidate(i, ("train", "validation", "test", "bench")[i % 4]) for i in range(20)]
    for candidate in candidates:
        if candidate["split"] == "bench":
            candidate["metadata_split"] = "test"
    first = select_pilot(candidates, max_pairs=12, seed=7)
    second = select_pilot(reversed(candidates), max_pairs=12, seed=7)
    assert [row["patch_id"] for row in first] == [row["patch_id"] for row in second]
    assert len({(row["patch_id"], row["s1_name"]) for row in first}) == 12
    assert len({row["geographic_group"] for row in first}) == 12
    assert all(len(row["expected_assets"]["s2_bands"]) == 12 for row in first)
    assert all(len(row["expected_assets"]["s1_bands"]) == 2 for row in first)
    manifest = build_pilot_manifest(first, 7)
    verify_pilot_manifest(manifest)
    assert all(
        row["permitted_roles"] == ["official_test_evaluation_only"]
        for row in first
        if row["split"] == "test"
    )
    assert all(
        row["permitted_roles"] == ["manual_benchmark_evaluation_only"]
        for row in first
        if row["split"] == "bench"
    )


def test_manifest_rejects_changed_split_and_incomplete_annotation_group():
    selected = select_pilot([_candidate(1, "test")], max_pairs=1, seed=3)
    manifest = build_pilot_manifest(selected, 3)
    manifest["pairs"][0]["metadata_split"] = "train"
    content = {key: value for key, value in manifest.items() if key != "manifest_sha256"}
    manifest["manifest_sha256"] = hashlib.sha256(
        json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    with pytest.raises(ValueError, match="official split"):
        verify_pilot_manifest(manifest)


def test_registry_validation_and_checksum(tmp_path: Path):
    source = tmp_path / "source.bin"
    source.write_bytes(b"official bytes")
    registry = {
        "version": "1.0",
        "sources": [
            {
                "name": "sample",
                "canonical_url": "https://example.test/source.bin",
                "dataset": "sample",
                "dataset_version": "1",
                "license": "CDLA-Permissive-1.0",
                "retrieved_at": "2026-09-19T00:00:00+00:00",
                "size_bytes": source.stat().st_size,
                "etag": None,
                "remote_revision": "1",
                "sha256": sha256_file(source),
                "distribution": "official",
                "local_path": "source.bin",
            }
        ],
    }
    assert validate_source_registry(registry) is registry
    verify_source_registry(registry, tmp_path)
    bad = copy.deepcopy(registry)
    bad["sources"][0]["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="checksum"):
        verify_source_registry(bad, tmp_path)
