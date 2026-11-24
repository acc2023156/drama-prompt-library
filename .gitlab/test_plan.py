import importlib.util
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

PLAN = pathlib.Path(__file__).with_name('plan.py')
spec = importlib.util.spec_from_file_location('plan', PLAN)
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)

REGISTRY = 'registry.test/group/demo'
SHA = 'a' * 40
TAG = '0123456789abcdef0123'


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()


class DetectTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = pathlib.Path(tmp.name)
        git(self.repo, 'init', '-q')
        git(self.repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'init')
        self.head = git(self.repo, 'rev-parse', 'HEAD')

    def test_detect_always_full(self):
        expected = {'base': '', 'head': self.head, 'full': True, 'files': []}
        self.assertEqual(plan.detect(self.repo, '', self.head), expected)
        self.assertEqual(plan.detect(self.repo, 'b' * 40, self.head), expected)

    def test_detect_rejects_bad_head(self):
        for head in ('latest', 'f' * 40):
            with self.assertRaises(ValueError):
                plan.detect(self.repo, '', head)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.cfg = plan.pipeline({'base': '', 'head': SHA, 'full': True, 'files': []}, REGISTRY, SHA, TAG)

    # Expectations follow CHECKS and IMAGES so a service can edit them; the fixed points are
    # what the artifacts native CI and reconciler rely on.
    def test_pipeline_jobs(self):
        cfg = self.cfg
        checks = ['check:' + c for c in plan.CHECKS]
        images = ['image:' + n for n in plan.IMAGES]
        self.assertIn('policy', plan.CHECKS)
        self.assertTrue(plan.IMAGES)
        self.assertEqual(set(cfg), {'stages', 'default', 'variables', 'manifest', *checks, *images})
        self.assertEqual(cfg['stages'], ['verify', 'build', 'manifest'])
        self.assertEqual(cfg['default']['image'], REGISTRY + '/ci-tools:' + TAG)
        self.assertEqual(cfg['default']['tags'], [plan.RUNNER + '-verify'])
        for name, (dockerfile, context) in plan.IMAGES.items():
            image = cfg['image:' + name]
            self.assertEqual(image['tags'], [plan.RUNNER + '-image'])
            self.assertEqual(image['image']['name'], plan.BUILDKIT)
            self.assertEqual(image['resource_group'], plan.RUNNER + '-image-build')
            self.assertEqual(set(image['needs']), set(checks))
            self.assertEqual({k: image['variables'][k] for k in ('IMAGE_NAME', 'DOCKERFILE', 'BUILD_CONTEXT')},
                             {'IMAGE_NAME': name, 'DOCKERFILE': dockerfile, 'BUILD_CONTEXT': context})
            self.assertEqual(image['artifacts']['paths'], ['image-metadata/' + name + '.json'])
        self.assertEqual(cfg['manifest']['needs'], images)
        self.assertEqual(cfg['manifest']['script'], ['python3 .gitlab/manifest.py ' + ' '.join(plan.IMAGES)])
        self.assertEqual(cfg['manifest']['artifacts']['paths'], ['release-manifest.json'])

    def test_checks_survive_verification_only(self):
        checks = [name for name in self.cfg if name.startswith('check:')]
        self.assertEqual(checks, ['check:' + c for c in plan.CHECKS])
        for name in checks:
            job = self.cfg[name]
            self.assertEqual(job['stage'], 'verify')
            self.assertEqual(job['script'], ['sh .gitlab/verify.sh ' + name.split(':', 1)[1]])
            self.assertFalse({'needs', 'tags', 'image'} & set(job), name)


class ImagesTests(unittest.TestCase):
    # MR pipelines run only check:*, so a bad entry would otherwise first fail in the build after merge.
    def test_images_are_buildable(self):
        root = PLAN.resolve().parents[1]
        for name, (dockerfile, context) in plan.IMAGES.items():
            with self.subTest(name=name):
                self.assertTrue(re.fullmatch('[a-z0-9-]+', name))
                # The artifacts toolchain job pushes the check image as ci-tools.
                self.assertNotEqual(name, 'ci-tools')
                self.assertTrue((root / dockerfile).is_file(), dockerfile)
                self.assertTrue((root / context).is_dir(), context)


class CliTests(unittest.TestCase):
    def test_checks_cli(self):
        out = subprocess.run([sys.executable, str(PLAN), 'checks'], check=True, capture_output=True, text=True).stdout
        self.assertEqual(out, ''.join(c + '\n' for c in plan.CHECKS))


if __name__ == '__main__':
    unittest.main()
