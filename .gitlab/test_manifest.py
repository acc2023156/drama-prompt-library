import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('manifest', pathlib.Path(__file__).with_name('manifest.py'))
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)

REGISTRY = 'registry.test/g/p'
DIGEST = 'sha256:' + 'b' * 64


class ManifestTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)

    def metadata(self, name, digest):
        (self.dir / (name + '.json')).write_text(json.dumps({'containerimage.digest': digest}))

    def test_requires_every_expected_image(self):
        with self.assertRaises(ValueError):
            manifest.create(self.dir, ['app'], 'a' * 40, REGISTRY)

    def test_rejects_tag_instead_of_digest(self):
        self.metadata('app', 'latest')
        with self.assertRaises(ValueError):
            manifest.create(self.dir, ['app'], 'a' * 40, REGISTRY)

    def test_rejects_duplicate_or_unsafe_names_and_bad_source(self):
        self.metadata('app', DIGEST)
        for names, sha in ((['app', 'app'], 'a' * 40), (['../app'], 'a' * 40), (['app'], 'latest')):
            with self.assertRaises(ValueError):
                manifest.create(self.dir, names, sha, REGISTRY)

    def test_records_source_and_digests_only(self):
        self.metadata('app', DIGEST)
        self.assertEqual(manifest.create(self.dir, ['app'], 'a' * 40, REGISTRY),
                         {'source_commit': 'a' * 40, 'images': {'app': REGISTRY + '/app@' + DIGEST}})


if __name__ == '__main__':
    unittest.main()
