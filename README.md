# imageServe

A Node.js microservice that generates PNG images of Star Wars Galaxy of Heroes (SWGOH) characters for use
in Discord bots. It renders EJS templates with character stats, screenshots them via Puppeteer, and returns
the PNG buffer.

Character icons are fetched from swgoh.gg (or a local swgoh-ae2 asset server) on first request and cached
in `public/CharIcons/`.

## Requirements

- A running [Comlink](https://github.com/swgoh-utils/comlink) instance
- A running [swgoh-ae2](https://github.com/swgoh-utils/swgoh-ae2) instance for game-direct assets
- Either Docker with Compose v2, or Node.js 22+ (native TypeScript type stripping — no build step)

## Setup

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your values — see the Docker note under Configuration
docker compose up -d --build
docker compose ps          # wait for (healthy)
```

The image bundles a version-matched Chrome and the fonts needed for text rendering, so nothing beyond
Docker is required on the host. `docker-compose.yml` joins an existing external network rather than creating
its own; see [Docker](#docker) below.

### Directly on the host

```bash
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

Puppeteer downloads its own Chrome during `npm install`. On a bare Linux host you may also need
Chrome's shared libraries and a font package, or rendered PNGs will show empty boxes instead of text.

## Configuration

| Variable              | Required | Description                                                    |
|-----------------------|----------|----------------------------------------------------------------|
| `PORT`                | Yes      | Port this server listens on (e.g. `3600`)                      |
| `ASSET_URL`           | Yes      | Base URL of your swgoh-ae2 instance (e.g. `http://localhost:3500`) |
| `COMLINK_CLIENT_URL`  | Yes      | URL of your Comlink instance (e.g. `http://localhost:3360`)    |
| `COMLINK_ACCESS_KEY`  | Yes      | Comlink access key                                             |
| `COMLINK_SECRET_KEY`  | Yes      | Comlink secret key                                             |
| `ICON_DIR`            | No       | Docker only. Host dir for the icon cache; defaults to `./public/CharIcons` |

**`ASSET_URL` and `COMLINK_CLIENT_URL` depend on how you run the service.** Running directly on the
host, point them at wherever Comlink and swgoh-ae2 are published, typically `http://localhost:3360`
and `http://localhost:3500`.

Running in a container, both values must change, because:

- `localhost` inside a container is the container itself, not the host.
- Published ports (the `3360:3360` half of a port mapping) exist only on the host. Container-to-container
  traffic goes direct to the **in-container** port, which is often a different number.

So use whatever DNS name resolves to your Comlink and swgoh-ae2 containers on the shared network,
with the port each one actually listens on inside its container:

```
ASSET_URL=http://<ae2-service-name>:8080
COMLINK_CLIENT_URL=http://<comlink-service-name>:<its port>
```

The names depend entirely on your setup. A single Comlink container is usually reachable at its
service name directly; if you run a pool behind a reverse proxy, point at the proxy instead. To find
the in-container port for a service, check what it binds rather than what it publishes:

```bash
docker inspect -f '{{.Config.ExposedPorts}}' <container>
```

A single `.env` cannot serve both host and container modes. If you need both, keep a second file and
point `env_file` at it.

## Commands

```bash
npm start           # Start server (node --env-file=.env index.ts)
npm test            # Run tests
npm run lint        # Lint and format check (Biome)
npm run lint:write  # Auto-fix lint and formatting
npx tsc --noEmit    # Type-check
```

```bash
docker compose up -d --build      # Build and start
docker compose logs -f imageserve # Follow logs
docker compose ps                 # Check health status
docker compose down               # Stop and remove
```

## Docker

### Network

imageServe has to reach Comlink and swgoh-ae2 over a Docker network they all share. The shipped
`docker-compose.yml` joins an **external** network, meaning the network is created and owned by
whichever compose project runs those services, and this one only attaches to it:

```yaml
networks:
  swgoh:
    name: <the network your comlink/ae2 stack uses>
    external: true
```

That stack must be up first, or `docker compose up` fails with a missing-network error. Find the name
with `docker network ls`, or inspect a running Comlink container:

```bash
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' <comlink-container>
```

If you instead run everything from one compose file, delete the `networks:` blocks entirely: services
in the same project share a default network automatically, and the service names become the hostnames
for `ASSET_URL` and `COMLINK_CLIENT_URL`.

The port stays published because callers outside Docker, such as a bot running on the host, still need
to reach it. Drop the `ports:` block if every caller is a container on the same network.

### State

| Path | Persisted | Why |
|---|---|---|
| `public/CharIcons/` | Bind mount, `ICON_DIR` | Hundreds of portraits; re-downloading them on every container recreate is wasteful |
| `data/` | No | Holds only `metadata.json`, refetched from Comlink at startup |
| `cacheDir/` | No | Chromium profile; caches nothing worth keeping, and a stale `SingletonLock` can block launch |

The container runs as the non-root `node` user (uid 1000). Docker creates a missing bind-mount source
as root, so if `ICON_DIR` points somewhere that does not exist yet, create it first or `chown` it to
uid 1000 — otherwise the container cannot write downloaded icons.

### Publishing

To publish the image for another host:

```bash
docker build -t ghcr.io/jmiln/imageserve:latest .
docker push ghcr.io/jmiln/imageserve:latest
```

## Endpoints

Full request/response schemas for every endpoint are in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

### GET /health

Returns `200` with `{"status":"ok","browser":"connected"}` while Puppeteer is alive, and `503` with
`{"status":"degraded","browser":"disconnected"}` if Chromium has died. Backs the compose healthcheck:
Express keeps accepting connections after a browser crash, so a plain TCP check would call a
non-rendering process healthy.

### POST /char

Returns a 210x210 PNG of a single character.

```js
const res = await fetch("http://localhost:3600/char", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        charUrl: "https://swgoh.gg/game-asset/u/bobafett/",
        defId: "BOBAFETT",
        rarity: 7,
        level: 85,
        gear: 13,
        zetas: 3,
        relic: 9,    // raw relic tier (0-11), mapped to display tier internally
        omicron: 1,
        side: "dark",
    }),
});
const buf = Buffer.from(await res.arrayBuffer());
```

### POST /panic

Returns a dynamic-height PNG table of units with gear/relic requirement columns.

```js
const res = await fetch("http://localhost:3600/panic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        header: "My Guild Event Requirements",
        lastUpdated: new Date().toISOString(),
        units: [
            {
                charUrl: "https://swgoh.gg/game-asset/u/bobafett/",
                defId: "BOBAFETT",
                name: "Boba Fett",
                rarity: 7,
                gear: 13,
                relic: 9,
                side: "dark",
                gp: 25000,
                gpReq: 20000,
                rarityReq: 7,
                gearReq: 13,
                relicReq: 7,
                isValid: true,
                isShip: false,
                isRequired: true,
            },
        ],
    }),
});
```

### POST /multi-char

Returns a PNG grid of up to 200 characters (max 8 per row, 200px per cell).

```js
const res = await fetch("http://localhost:3600/multi-char", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        header: "My Characters",
        lastUpdated: new Date().toISOString(),
        characters: [
            {
                charUrl: "https://swgoh.gg/game-asset/u/bobafett/",
                defId: "BOBAFETT",
                name: "Boba Fett",
                rarity: 7,
                level: 85,
                gear: 13,
                zetas: 3,
                relic: 9,
                omicron: 1,
                side: "dark",
            },
        ],
    }),
});
```

### POST /chart

Returns a PNG of a Chart.js chart. `datasets` entries are passed straight through to Chart.js, so any
valid dataset property works.

```js
const res = await fetch("http://localhost:3600/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        datasets: [
            {
                label: "Char Arena",
                data: [15, 22, 35, 48, 62],
                borderColor: "#4a90d9",
                pointStyle: "circle",
                pointRadius: 5,
                tension: 0.3,
            },
            {
                label: "Fleet Arena",
                data: [90, 78, 65, 50, 38],
                borderColor: "#e8874a",
                pointStyle: "triangle",
                pointRadius: 6,
                borderDash: [6, 4],
                tension: 0.3,
            },
        ],
        type: "line",        // default "line"; "bar", "pie", etc. also work
        title: "Arena Rank - Last 5 Days",
        width: 800,          // default 800, max 4096
        height: 400,         // default 400, max 4096
        showLegend: true,    // default true
    }),
});
```

`responsive`, `animation`, and y-axis `beginAtZero` are hardcoded (`false`, `false`, `true`) for
reliable headless screenshotting. Because `beginAtZero` is forced, rank-style data where 0 is not
meaningful needs a value range that keeps the line visually centred.

### POST /arena

Returns a PNG of a player's character and fleet arena squads, each with a rank label. Width is
`200 * max(charTeam.length, fleetTeam.length)` px.

```js
const res = await fetch("http://localhost:3600/arena", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        name: "PlayerName",        // optional
        allyCode: "123-456-789",   // optional; header is omitted if both are absent
        charRank: 42,
        charTeam: [                // max 5 units, same shape as /multi-char
            {
                charUrl: "tex.charui_sithrevan.png",
                defId: "SITHREVAN",
                name: "Darth Revan",
                rarity: 7,
                gear: 13,
                relic: 9,
                zetas: 3,
                omicron: 1,
                side: "dark",
            },
        ],
        fleetRank: 15,
        fleetTeam: [               // max 8: 1 capital + 3 starting + 4 reinforcements
            {
                charUrl: "tex.charui_chimaera.png",
                defId: "CAPITALCHIMAERA",
                name: "Chimaera",
                rarity: 7,
                side: "dark",
            },
        ],
    }),
});
```

Ships have no gear or relics, so `gear` and `relic` are forced to `0` for `fleetTeam` entries and can
be omitted.

## Architecture

All logic lives in `index.ts`. A single Puppeteer browser instance and a single page are reused across
all requests via a promise-based mutex (`withPage`), serialising all page operations to prevent
concurrent-request corruption.

The browser is launched before `app.listen()`, so a Chromium failure at startup means the port never
opens rather than the service accepting requests it cannot serve. SIGTERM and SIGINT close the browser
and the HTTP server, with a 10s forced-exit fallback, so `docker compose stop` shuts down cleanly.
