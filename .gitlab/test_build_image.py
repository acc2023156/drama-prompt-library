import base64
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().with_name('build-image.sh')
# Stands in for buildctl-daemonless.sh: records its arguments and the registry config it was given.
STUB = '''#!/bin/sh
printf '%s\\n' "$@" > args
cp "$DOCKER_CONFIG/config.json" config.json
stat -c %a "$DOCKER_CONFIG" "$DOCKER_CONFIG/config.json" > modes
echo "$DOCKER_CONFIG" > docker-config
'''
ENV = {'CI_REGISTRY': 'registry.test', 'CI_REGISTRY_IMAGE': 'registry.test/group/demo',
       'CI_REGISTRY_USER': 'ci-user', 'CI_REGISTRY_PASSWORD': 'ci-secret', 'CI_COMMIT_SHA': 'a' * 40,
       'IMAGE_NAME': 'app', 'DOCKERFILE': 'Dockerfile', 'BUILD_CONTEXT': '.'}


class BuildImageTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)
        stub = self.dir / 'bin/buildctl-daemonless.sh'
        stub.parent.mkdir()
        stub.write_text(STUB)
        stub.chmod(0o755)

    def build(self, **overrides):
        env = {'PATH': str(self.dir / 'bin') + os.pathsep + os.environ['PATH'], **ENV, **overrides}
        return subprocess.run(['sh', str(SCRIPT)], cwd=self.dir, env=env, capture_output=True, text=True)

    def output(self):
        return [a for a in (self.dir / 'args').read_text().splitlines() if a.startswith('type=image,')]

    def test_pushes_commit_tag_with_private_credentials(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output(), ['type=image,name=registry.test/group/demo/app:' + 'a' * 40 + ',push=true'])
        args = (self.dir / 'args').read_text()
        self.assertIn('image-metadata/app.json', args.splitlines())
        self.assertNotIn('ci-secret', args)
        auth = base64.b64encode(b'ci-user:ci-secret').decode()
        self.assertEqual(json.loads((self.dir / 'config.json').read_text()), {'auths': {'registry.test': {'auth': auth}}})
        self.assertEqual((self.dir / 'modes').read_text().split(), ['700', '600'])
        self.assertFalse(pathlib.Path((self.dir / 'docker-config').read_text().strip()).exists())

    def test_image_tag_overrides_commit_tag(self):
        # The artifacts toolchain job builds ci-tools with IMAGE_TAG="$TOOLS_TAG".
        result = self.build(IMAGE_TAG='tools')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output(), ['type=image,name=registry.test/group/demo/app:tools,push=true'])

    def test_rejects_invalid_name_or_missing_variable(self):
        for overrides in ({'IMAGE_NAME': 'App_1'}, {'CI_REGISTRY_PASSWORD': ''}):
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.build(**overrides).returncode, 0)
                self.assertFalse((self.dir / 'args').exists())


if __name__ == '__main__':
    unittest.main()
