"""The accelerator gate must fail closed, and MPS must stay opt-in.

These run without torch installed: _resolve_device takes the torch module as an
argument, so a stub covers every branch. That keeps the gate testable in the light
CI environment, which is the only place it is checked on every push.
"""

import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import patch

from models.qwen_vl.model import ALLOW_MPS_ENV, QwenVLModel


def fake_torch(*, cuda: bool, mps: bool) -> SimpleNamespace:
    return SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: cuda),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)),
    )


class DeviceGateTests(unittest.TestCase):
    def resolve(self, *, cuda: bool, mps: bool, env: str | None) -> str:
        environment = {} if env is None else {ALLOW_MPS_ENV: env}
        with patch.dict("os.environ", environment, clear=True):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                return QwenVLModel._resolve_device(fake_torch(cuda=cuda, mps=mps))

    def test_cuda_is_preferred_and_ignores_the_opt_in(self) -> None:
        self.assertEqual(self.resolve(cuda=True, mps=True, env=None), "cuda")
        self.assertEqual(self.resolve(cuda=True, mps=False, env="1"), "cuda")

    def test_no_accelerator_fails_closed_rather_than_falling_back_to_cpu(self) -> None:
        with self.assertRaises(RuntimeError) as caught:
            self.resolve(cuda=False, mps=False, env=None)
        self.assertIn("CUDA GPU", str(caught.exception))

    def test_mps_is_refused_unless_explicitly_opted_in(self) -> None:
        """An Apple laptop must not start serving inference just by being one."""
        with self.assertRaises(RuntimeError):
            self.resolve(cuda=False, mps=True, env=None)

    def test_opt_in_must_be_exactly_one_not_merely_truthy(self) -> None:
        for value in ("0", "", "true", "yes", "TRUE"):
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                self.resolve(cuda=False, mps=True, env=value)

    def test_opt_in_selects_mps_when_it_is_actually_available(self) -> None:
        self.assertEqual(self.resolve(cuda=False, mps=True, env="1"), "mps")

    def test_opt_in_without_mps_hardware_still_fails_closed(self) -> None:
        with self.assertRaises(RuntimeError):
            self.resolve(cuda=False, mps=False, env="1")

    def test_choosing_mps_warns_that_it_is_not_a_baseline(self) -> None:
        """This warning is the only thing between a local run and a number someone
        later quotes as a measurement."""
        with patch.dict("os.environ", {ALLOW_MPS_ENV: "1"}, clear=True):
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                QwenVLModel._resolve_device(fake_torch(cuda=False, mps=True))
        self.assertEqual(len(caught), 1)
        self.assertIs(caught[0].category, RuntimeWarning)
        self.assertIn("not comparable", str(caught[0].message).lower())

    def test_cuda_path_does_not_warn(self) -> None:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            QwenVLModel._resolve_device(fake_torch(cuda=True, mps=False))
        self.assertEqual(caught, [])


if __name__ == "__main__":
    unittest.main()
