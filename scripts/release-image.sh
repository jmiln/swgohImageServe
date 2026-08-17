#!/usr/bin/env bash
# Builds version-tagged images. Refuses to run unless HEAD is exactly the tag matching
# package.json's version, so a version tag can never be built from a tree that is not that version.
set -euo pipefail

IMAGE=ghcr.io/jmiln/swgohimageserve
VERSION=$(node -p "require('./package.json').version")

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Refusing to build: working tree has uncommitted changes." >&2
    echo "Commit or stash them, then retry." >&2
    exit 1
fi

# Tags are unprefixed (2.1.0) to match the Docker image tag exactly; see .npmrc.
# A leading v is stripped anyway so a tag made before that config existed still works.
HEAD_TAG=$(git describe --exact-match --tags HEAD 2>/dev/null || true)
if [ "${HEAD_TAG#v}" != "${VERSION}" ]; then
    echo "Refusing to build: HEAD is not tagged ${VERSION}." >&2
    echo "  package.json version: ${VERSION}" >&2
    echo "  HEAD tag:             ${HEAD_TAG:-<none>}" >&2
    echo "Run 'npm version <patch|minor|major>' first, or check out the release tag." >&2
    exit 1
fi

docker build \
    --label "org.opencontainers.image.version=${VERSION}" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "org.opencontainers.image.source=https://github.com/jmiln/swgohImageServe" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "${IMAGE}:${VERSION}" \
    -t "${IMAGE}:latest" \
    .

echo
echo "Built ${IMAGE}:${VERSION} and ${IMAGE}:latest"
echo "Push with: npm run release:push"
