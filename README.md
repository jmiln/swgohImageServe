# imageServe

A Node.js microservice that generates PNG images of Star Wars Galaxy of Heroes (SWGOH) characters for use
in Discord bots. It renders EJS templates with character stats, screenshots them via Puppeteer, and returns
the PNG buffer.

Character icons are fetched from swgoh.gg (or a local swgoh-ae2 asset server) on first request and cached
in `public/CharIcons/`.

## Requirements

- Node.js 22+ (uses native TypeScript type stripping — no build step)
- A running [Comlink](https://github.com/swgoh-utils/comlink) instance
- Optionally: a running [swgoh-ae2](https://github.com/swgoh-utils/swgoh-ae2) instance for game-direct assets

## Setup

```bash
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

## Configuration

| Variable              | Required | Description                                                    |
|-----------------------|----------|----------------------------------------------------------------|
| `PORT`                | Yes      | Port this server listens on (e.g. `3600`)                      |
| `ASSET_PORT`          | No       | Local swgoh-ae2 port. Omit to fall back to swgoh.gg URL        |
| `COMLINK_CLIENT_URL`  | Yes      | URL of your Comlink instance (e.g. `http://localhost:3360`)    |
| `COMLINK_ACCESS_KEY`  | Yes      | Comlink access key                                             |
| `COMLINK_SECRET_KEY`  | Yes      | Comlink secret key                                             |

## Commands

```bash
npm start           # Start server (node --env-file=.env index.ts)
npm test            # Run tests
npm run lint        # Lint and format check (Biome)
npm run lint:write  # Auto-fix lint and formatting
npx tsc --noEmit    # Type-check
```

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

## Architecture

All logic lives in `index.ts`. A single Puppeteer browser instance and a single page are reused across
all requests via a promise-based mutex (`withPage`), serialising all page operations to prevent
concurrent-request corruption.
