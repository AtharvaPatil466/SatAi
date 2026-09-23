import subprocess
import sys
from pathlib import Path


def test_cli_help_does_not_require_cuda() -> None:
    script = Path(__file__).with_name("run_grounding_dior_rsvg.py")
    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "--sample-size" in result.stdout
    assert "CUDA GPU not found" not in result.stderr
