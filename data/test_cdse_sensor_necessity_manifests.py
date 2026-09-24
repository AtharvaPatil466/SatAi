import json
import math
import re
from pathlib import Path


MANIFEST_DIR = Path(__file__).parent / "manifests" / "cdse"
SCENES = json.loads((MANIFEST_DIR / "scenes.v1.json").read_text())
RESULTS = json.loads(
    (MANIFEST_DIR / "sensor-necessity-results.v1.json").read_text()
)


def test_scene_manifest_has_exactly_two_complete_real_scenes():
    assert SCENES["schema_version"] == "1.0"
    assert SCENES["scene_count"] == len(SCENES["scenes"]) == 2
    assert len({scene["scene_id"] for scene in SCENES["scenes"]}) == 2
    for scene in SCENES["scenes"]:
        assert len(scene["bbox"]) == 4
        assert scene["geographic_description"]
        assert scene["temporal_separation_seconds"] > 0
        assert scene["output_grid"]["width"] > 0
        assert scene["output_grid"]["height"] > 0
        assert scene["output_grid"]["crs"] == "EPSG:4326"
        assert scene["s1"]["selected_product_id"].startswith("S1")
        assert scene["s1"]["polarization"] == ["VV", "VH"]
        assert scene["s1"]["orbit_direction"] in {"ascending", "descending"}
        assert scene["s1"]["relative_orbit"] > 0
        assert scene["s1"]["processing"] == {
            "acquisition_mode": "IW",
            "resolution": "HIGH",
            "orthorectification": True,
            "dem_instance": "COPERNICUS_30",
            "backscatter_coefficient": "GAMMA0_TERRAIN",
            "stored_units": "linear",
        }
        assert scene["s2"]["selected_product_id"].startswith("S2")
        assert 0 <= scene["s2"]["cloud_cover_percent"] <= 100
        assert scene["provenance_limitations"]


def test_manifests_contain_no_sensitive_fields_or_values():
    text = json.dumps({"scenes": SCENES, "results": RESULTS}).lower()
    for forbidden in (
        "cdse_client_id",
        "cdse_client_secret",
        "access_token",
        "refresh_token",
        "client_secret",
        "api_key",
        "password",
    ):
        assert forbidden not in text


def test_frozen_rule_is_identical_and_replication_was_not_retuned():
    assert len(RESULTS["experiments"]) == 2
    locked = RESULTS["locked_rule"]
    assert locked["ndwi_strictly_greater_than"] == 0.048095703125
    assert locked["vv_linear_gamma0_terrain_max"] == 0.053388334810733795
    assert locked["vh_linear_gamma0_terrain_max"] == 0.00929180160164833
    assert locked["component_connectivity"] == 8
    assert locked["minimum_component_pixels_inclusive"] == 64
    assert locked["target"] == "one-pixel inner boundary of filtered fused support"
    assert all(experiment["applied_rule"] == locked for experiment in RESULTS["experiments"])
    replication = next(
        experiment
        for experiment in RESULTS["experiments"]
        if experiment["role"] == "independent-frozen-rule-replication"
    )
    assert replication["retuned"] is False


def test_recorded_result_arithmetic_is_consistent():
    for experiment in RESULTS["experiments"]:
        correct = experiment["correct_support_pixels"]
        mismatched = experiment["mismatched_support_pixels"]
        assert math.isclose(
            experiment["correct_to_mismatched_support_ratio"],
            correct / mismatched,
        )
        assert math.isclose(
            experiment["support_reduction_percent_when_mismatched"],
            100 * (correct - mismatched) / correct,
        )
        for prefix, counts in (
            ("support", {"correct": correct, "mismatched": mismatched}),
            (
                "boundary",
                {
                    "correct": experiment["boundary_overlap"]["correct_pixels"],
                    "mismatched": experiment["boundary_overlap"]["mismatched_pixels"],
                },
            ),
        ):
            overlap = experiment[f"{prefix}_overlap"]
            assert overlap["union_pixels"] == (
                counts["correct"] + counts["mismatched"] - overlap["intersection_pixels"]
            )
            assert math.isclose(
                overlap["iou"],
                overlap["intersection_pixels"] / overlap["union_pixels"],
            )
            assert math.isclose(
                overlap["dice"],
                2 * overlap["intersection_pixels"]
                / (counts["correct"] + counts["mismatched"]),
            )


def test_source_hashes_are_lowercase_sha256():
    for scene in SCENES["scenes"]:
        for sensor in ("s1", "s2"):
            geotiff = scene[sensor]["geotiff"]
            assert re.fullmatch(r"[0-9a-f]{64}", geotiff["sha256"])
            assert geotiff["size_bytes"] > 0
