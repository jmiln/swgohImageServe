# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-08-17

### Changed

- Puppeteer 25.1.0 → 25.5.0, moving the bundled Chrome from 149 to 151
- Images are now built and published by GitHub Actions on tag push rather than locally; the
  workflow runs lint, type checks, and unit tests, then boots the image against a stub Comlink and
  renders a character before anything is published

### Fixed

- Removed an obsolete `<!DOCTYPE svg>` from two gear-tier icons that Biome 2.5.7 could not parse

### Removed

- `scripts/release-image.sh` and `scripts/release-push.sh`, superseded by the CI workflow


## [2.0.0] - 2026-08-17

### Added

- Docker image and `docker-compose.yml`; the service runs as a container with a version-matched
  Chrome and the fonts required for text rendering
- `GET /health`, reporting Puppeteer browser connectivity and the running version
- `ICON_DIR` to relocate the character icon cache outside the repo
- Versioned image tags with OCI labels, and `IMAGE_TAG` for rollback

### Changed

- **BREAKING:** `ASSET_PORT` (a port number) replaced by `ASSET_URL` (a full base URL), so the asset
  server can be reached across container boundaries. Any trailing slash is stripped
- Game metadata is held in memory instead of written to `data/metadata.json`; it is refetched from
  Comlink at startup and hourly, so the file was written but never meaningfully read

### Removed

- `data/metadata.json` and the `data/` directory

### Migration

Replace `ASSET_PORT=3500` in `.env` with `ASSET_URL=http://localhost:3500` for host runs, or the
service name and in-container port when running under Docker. `COMLINK_CLIENT_URL` likewise needs the
container-reachable form when containerised.

## [1.0.0] - 2026-06-09

Pre-Docker baseline, tagged at `ee95583`. Run directly on the host under pm2.
