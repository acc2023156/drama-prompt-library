#!/bin/sh
set -eu
: "${CI_REGISTRY:?}" "${CI_REGISTRY_IMAGE:?}" "${CI_REGISTRY_USER:?}" "${CI_REGISTRY_PASSWORD:?}" "${CI_COMMIT_SHA:?}" "${IMAGE_NAME:?}" "${DOCKERFILE:?}" "${BUILD_CONTEXT:?}"
case "$IMAGE_NAME" in ''|*[!a-z0-9-]*) echo 'Invalid image name' >&2; exit 2;; esac
# Credentials stay outside the build context and disappear when this job exits.
umask 077
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT HUP INT TERM
auth=$(printf '%s:%s' "$CI_REGISTRY_USER" "$CI_REGISTRY_PASSWORD" | base64 | tr -d '\n')
printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$CI_REGISTRY" "$auth" > "$DOCKER_CONFIG/config.json"
unset auth
mkdir -p image-metadata
buildctl-daemonless.sh build \
  --frontend dockerfile.v0 \
  --local context="$BUILD_CONTEXT" \
  --local dockerfile="$(dirname "$DOCKERFILE")" \
  --opt filename="$(basename "$DOCKERFILE")" \
  --opt platform=linux/amd64 \
  --opt "label:org.opencontainers.image.revision=$CI_COMMIT_SHA" \
  --import-cache "type=registry,ref=$CI_REGISTRY_IMAGE/$IMAGE_NAME:buildcache" \
  --export-cache "type=registry,ref=$CI_REGISTRY_IMAGE/$IMAGE_NAME:buildcache,mode=max" \
  --output "type=image,name=$CI_REGISTRY_IMAGE/$IMAGE_NAME:${IMAGE_TAG:-$CI_COMMIT_SHA},push=true" \
  --metadata-file "image-metadata/$IMAGE_NAME.json"
