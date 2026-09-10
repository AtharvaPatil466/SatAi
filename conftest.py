"""Isolate project tests from the application's persisted audit chain."""

import pytest

from orchestrator import trace


@pytest.fixture(autouse=True)
def isolated_execution_trace(tmp_path, monkeypatch):
    monkeypatch.setattr(trace, "TRACE_PATH", tmp_path / "trace.jsonl")
    monkeypatch.setattr(trace, "_TRACE", [])
    monkeypatch.setattr(trace, "_LOADED_PATH", None)
