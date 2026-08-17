// Minimal stand-in for swgoh-comlink, used by the CI smoke test so the container can start
// without real credentials or network access to a live Comlink instance.
//
// It also writes the fixture portrait into the icon cache directory: checkImgOrDownload() skips
// the network entirely when the file is already cached, which is what keeps this stub simple.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const PORT = Number(process.env.STUB_PORT ?? 9999);
const ICON_DIR = process.env.STUB_ICON_DIR ?? "./ci-icons";
const ICON_NAME = "tex.charui_test.png";

// A 1x1 transparent PNG. The content is irrelevant: the smoke test checks that Chromium launches,
// the template renders, and a screenshot comes back at the right size, not what the portrait shows.
const PNG_1X1 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

mkdirSync(ICON_DIR, { recursive: true });
writeFileSync(join(ICON_DIR, ICON_NAME), Buffer.from(PNG_1X1, "base64"));

const metadata = {
    assetVersion: "ci-asset-version",
    latestGamedataVersion: "ci-gamedata-version",
    latestLocalizationBundleVersion: "ci-localization-version",
};

// Every request gets the same payload. HMAC request signing is ignored on purpose: verifying it is
// the real server's job, and the client checks nothing on the response.
const server = createServer((req, res) => {
    // Drain the request body. Without this, `end` never fires for the POST the client sends and
    // the container hangs at startup instead of failing usefully.
    req.resume();
    req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(metadata));
    });
});

server.listen(PORT, () => {
    console.log(`fake-comlink listening on ${PORT}, seeded ${join(ICON_DIR, ICON_NAME)}`);
});
