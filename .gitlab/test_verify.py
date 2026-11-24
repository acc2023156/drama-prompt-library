import importlib.util
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('plan', ROOT / '.gitlab/plan.py')
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)


class VerifyTests(unittest.TestCase):
    def test_unknown_check_fails(self):
        result = subprocess.run(['sh', '.gitlab/verify.sh', 'nope'], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual((result.returncode, result.stderr.strip()), (2, 'Unknown check: nope'))

    def test_every_planned_check_has_a_branch(self):
        # The checks themselves run as their own jobs; policy must not run them again.
        script = (ROOT / '.gitlab/verify.sh').read_text()
        for check in plan.CHECKS:
            self.assertRegex(script, r'(?m)^\s*' + re.escape(check) + r'\)', check)


if __name__ == '__main__':
    unittest.main()
