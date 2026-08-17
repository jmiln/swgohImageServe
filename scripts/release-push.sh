#!/usr/bin/env bash
# Pushes the version tag and :latest. Separate from the build because this needs
# `docker login ghcr.io`, it is the only irreversible step, and a failed push should not
# force a rebuild.
set -euo pipefail

IMAGE=ghcr.io/jmiln/swgohimageserve
VERSION=$(node -p "require('./package.json').version")

if ! docker image inspect "${IMAGE}:${VERSION}" >/dev/null 2>&1; then
    echo "No local image ${IMAGE}:${VERSION}. Run 'npm run release:image' first." >&2
    exit 1
fi

docker push "${IMAGE}:${VERSION}"
docker push "${IMAGE}:latest"
