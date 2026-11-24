#!/usr/bin/env python3
"""Source-owned plan for the artifacts native CI: checks, images and the release manifest.

The artifacts plan job imports this file and calls detect() and pipeline(); it uses only the
standard library. Edit IMAGES and CHECKS (with matching cases in verify.sh) for the service.
"""
import re
import subprocess
import sys

# Component name registered by the admin, not necessarily the project name. Runner prefix:
# <RUNNER>-verify runs checks and the manifest, <RUNNER>-image builds.
RUNNER = 'outdoor-tianji'
BUILDKIT = 'moby/buildkit:rootless@sha256:5987568f92dafbfb679879de59c1cd8d26597f5f6635c314e166164e2615870c'
# Artifact name -> (Dockerfile, build context). Images are pushed as $CI_REGISTRY_IMAGE/<artifact>.
IMAGES = {'app': ('Dockerfile', '.')}
CHECKS = ('policy', 'web', 'worker', 'web-react')


def detect(repo, base, head):
    """Every build is full; the reconciler only promotes full builds of the current head."""
    if not re.fullmatch('[0-9a-f]{40}', head or ''):
        raise ValueError('Invalid head SHA')
    found = subprocess.run(['git', '-C', str(repo), 'cat-file', '-e', head + '^{commit}'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if found.returncode:
        raise ValueError('Head commit is not in the repository')
    return {'base': '', 'head': head, 'full': True, 'files': []}


def pipeline(plan, registry, sha, tools_tag):
    cfg = {'stages': ['verify', 'build', 'manifest'],
           'default': {'image': registry + '/ci-tools:' + tools_tag, 'tags': [RUNNER + '-verify'],
                       'interruptible': True,
                       'before_script': ['git config --global --add safe.directory "$CI_PROJECT_DIR"']},
           'variables': {'GIT_DEPTH': '20'}}
    for check in CHECKS:
        cfg['check:' + check] = {'stage': 'verify', 'script': ['sh .gitlab/verify.sh ' + check], 'timeout': '30m'}
    for name, (dockerfile, context) in IMAGES.items():
        cfg['image:' + name] = {
            'stage': 'build', 'tags': [RUNNER + '-image'], 'image': {'name': BUILDKIT, 'entrypoint': ['']},
            'before_script': [], 'needs': ['check:' + c for c in CHECKS],
            'script': ['sh .gitlab/build-image.sh'], 'resource_group': RUNNER + '-image-build', 'timeout': '1h',
            'variables': {'IMAGE_NAME': name, 'DOCKERFILE': dockerfile, 'BUILD_CONTEXT': context,
                          'BUILDKITD_FLAGS': '--oci-worker-no-process-sandbox --oci-worker-snapshotter=overlayfs --oci-worker-gc-keepstorage=30000'},
            'artifacts': {'paths': ['image-metadata/' + name + '.json'], 'expire_in': '7 days'}}
    cfg['manifest'] = {'stage': 'manifest', 'needs': ['image:' + n for n in IMAGES],
                       'script': ['python3 .gitlab/manifest.py ' + ' '.join(IMAGES)],
                       'artifacts': {'paths': ['release-manifest.json'], 'expire_in': '7 days'}}
    return cfg


if __name__ == '__main__':
    if sys.argv[1:] != ['checks']:
        raise SystemExit('usage: plan.py checks')
    print('\n'.join(CHECKS))
