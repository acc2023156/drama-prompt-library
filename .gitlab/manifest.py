#!/usr/bin/env python3
"""Record the published image digests of one full build for the artifacts reconciler."""
import json
import os
import pathlib
import re
import sys


def create(directory, expected, sha, registry):
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid source commit')
    images = {}
    for name in expected:
        if not re.fullmatch(r'[a-z0-9-]+', name) or name in images:
            raise ValueError('Invalid or duplicate image name')
        try:
            metadata = json.loads((directory / (name + '.json')).read_text())
        except (OSError, ValueError) as exc:
            raise ValueError('Missing image metadata: ' + name) from exc
        digest = metadata.get('containerimage.digest', '')
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
            raise ValueError('Invalid image digest: ' + name)
        images[name] = registry + '/' + name + '@' + digest
    return {'source_commit': sha, 'images': images}


if __name__ == '__main__':
    result = create(pathlib.Path('image-metadata'), sys.argv[1:],
                    os.environ['CI_COMMIT_SHA'], os.environ['CI_REGISTRY_IMAGE'])
    pathlib.Path('release-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
