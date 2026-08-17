#!/usr/bin/env bash
# Publishes a release: the container image and the git tag it was built from.
#
# Separate from the build because this needs `docker login ghcr.io`, it is the only
# irreversible step, and a failed push should not force a rebuild.
set -euo pipefail

IMAGE=ghcr.io/jmiln/swgohimageserve
REMOTE=${GIT_REMOTE:-origin}
VERSION=$(node -p "require('./package.json').version")

if ! docker image inspect "${IMAGE}:${VERSION}" >/dev/null 2>&1; then
    echo "No local image ${IMAGE}:${VERSION}. Run 'npm run release:image' first." >&2
    exit 1
fi

if ! git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; then
    echo "No local git tag ${VERSION}, so there is nothing to publish alongside the image." >&2
    echo "Run 'npm version <patch|minor|major>' to create it." >&2
    exit 1
fi

# Image first: it is the slower step and the one most likely to fail (auth, network,
# size), so a failure here leaves no published tag pointing at a release that does not exist.
docker push "${IMAGE}:${VERSION}"
docker push "${IMAGE}:latest"

# The tag and the image are two halves of one release. Without the tag on the remote, the
# image's org.opencontainers.image.revision label points at a commit nobody else can resolve.
# Idempotent: re-running against an already-pushed tag is a no-op rather than an error.
git push "${REMOTE}" "refs/tags/${VERSION}"

echo
echo "Published ${IMAGE}:${VERSION} (and :latest), and pushed tag ${VERSION} to ${REMOTE}."
