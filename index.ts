import fs from "node:fs/promises";
import ComlinkStub from "@swgoh-utils/comlink";
import ejs from "ejs";
import express, { type Request, type Response } from "express";
import puppeteer from "puppeteer";
import { env } from "./modules/config.ts";
import { checkImgOrDownload } from "./modules/download.ts";
import logger from "./modules/logger.ts";

// Optimization args from https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/
const minimal_args = [
    "--autoplay-policy=user-gesture-required",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-domain-reliability",
    "--disable-extensions",
    "--disable-features=AudioServiceOutOfProcess",
    "--disable-hang-monitor",
    "--disable-ipc-flooding-protection",
    "--disable-notifications",
    "--disable-offer-store-unmasked-wallet-cards",
    "--disable-popup-blocking",
    "--disable-print-preview",
    "--disable-prompt-on-repost",
    "--disable-renderer-backgrounding",
    "--disable-setuid-sandbox",
    "--disable-speech-api",
    "--disable-sync",
    "--hide-scrollbars",
    "--ignore-gpu-blacklist",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-pings",
    "--no-sandbox",
    "--no-zygote",
    "--password-store=basic",
    "--use-gl=swiftshader",
    "--use-mock-keychain",
];

interface MetaData {
    assetVersion: string;
    latestGamedataVersion: string;
    latestLocalizationBundleVersion: string;
}

let metadataFile: MetaData;

const comlinkStub = new ComlinkStub({
    url: env.COMLINK_CLIENT_URL,
    accessKey: env.COMLINK_ACCESS_KEY,
    secretKey: env.COMLINK_SECRET_KEY,
});
const META_FILE = new URL("./data/metadata.json", import.meta.url).pathname;
const META_KEYS: (keyof MetaData)[] = ["assetVersion", "latestGamedataVersion", "latestLocalizationBundleVersion"];

async function updateMetaData(): Promise<boolean> {
    const meta = await comlinkStub.getMetaData();
    let metaFile: Partial<MetaData> = {};
    try {
        metaFile = JSON.parse(await fs.readFile(META_FILE, "utf-8")) as Partial<MetaData>;
    } catch {
        // file doesn't exist yet
    }
    let isUpdated = false;
    const metaOut = {} as MetaData;
    for (const key of META_KEYS) {
        if (meta[key] !== metaFile[key]) {
            isUpdated = true;
        }
        metaOut[key] = meta[key];
    }
    if (isUpdated) {
        await fs.writeFile(META_FILE, JSON.stringify(metaOut), { encoding: "utf8" });
    }
    metadataFile = metaOut;
    return isUpdated;
}

const toRelicLevel = (raw: number): number => Math.max(0, (raw || 0) - 2);
const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zetas: 0, relic: 0, side: "", omicron: 0 };
const assetPort = env.ASSET_PORT;

const cachedUrl = async (rawUrl: string) =>
    `http://localhost:${env.PORT}/CharIcons/${await checkImgOrDownload(rawUrl, `${import.meta.dirname}/public/CharIcons`, {
        assetPort,
        assetVersion: metadataFile.assetVersion,
    })}`;

const MAX_UNITS = 200;

const init = async () => {
    const cssContent = await fs.readFile(`${import.meta.dirname}/public/css/styles.css`, "utf-8");
    const chartJsContent = await fs.readFile(`${import.meta.dirname}/node_modules/chart.js/dist/chart.umd.js`, "utf-8");

    const browser = await puppeteer.launch({
        headless: true,
        args: minimal_args,
        userDataDir: `${import.meta.dirname}/cacheDir`,
    });
    const page = await browser.newPage();

    const createMutex = () => {
        let queue = Promise.resolve();
        return <T>(fn: () => Promise<T>): Promise<T> => {
            const next = queue.then(fn);
            queue = next.then(
                () => {},
                () => {},
            );
            return next;
        };
    };
    const withPage = createMutex();

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(express.static(`${import.meta.dirname}/public`));
    await updateMetaData();
    const metaInterval = setInterval(
        () => {
            updateMetaData().catch((err) => logger.error({ err }, "Metadata refresh failed"));
        },
        60 * 60 * 1000,
    );

    app.post("/char", async (req: Request, res: Response) => {
        if (!req.body.charUrl) return res.status(400).send("Missing charUrl");

        const charStats = {
            defId: req.body.defId as string,
            charUrl: await cachedUrl(req.body.charUrl as string),
            rarity: (req.body.rarity as number) || charDef.rarity,
            level: (req.body.level as number) || charDef.level,
            gear: (req.body.gear as number) || charDef.gear,
            zetas: (req.body.zetas as number) || charDef.zetas,
            relic: toRelicLevel(req.body.relic as number),
            omicron: (req.body.omicron as number) || charDef.omicron,
            side: (req.body.side as string) || charDef.side,
        };

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/char.ejs`, {
            baseURL: `http://localhost:${env.PORT}`,
            char: charStats,
        });
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width: 210, height: 210 });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ content: cssContent });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/panic", async (req: Request, res: Response) => {
        const charListIn = req.body.units as unknown[];
        if (!Array.isArray(charListIn) || !charListIn.length) return res.status(400).send("Missing units list");
        if (charListIn.length > MAX_UNITS) return res.status(400).send(`units must not exceed ${MAX_UNITS} items`);

        let unitList: {
            defId: string;
            charUrl: string;
            name: string | undefined;
            rarity: number;
            gear: number;
            relic: number;
            side: string;
            gp: number | string;
            gpReq: number;
            rarityReq: number;
            gearReq: number;
            relicReq: number;
            valid: boolean;
            ship: boolean;
            required: boolean;
        }[];
        try {
            unitList = await Promise.all(
                charListIn.map(async (u) => {
                    const thisChar = u as Record<string, unknown>;
                    if (!thisChar.charUrl) throw new Error(`Unit ${thisChar.defId} missing charUrl`);
                    return {
                        defId: thisChar.defId as string,
                        charUrl: await cachedUrl(thisChar.charUrl as string),
                        name: thisChar.name as string | undefined,
                        rarity: (thisChar.rarity as number) || charDef.rarity,
                        gear: (thisChar.gear as number) || charDef.gear,
                        relic: toRelicLevel(thisChar.relic as number),
                        side: (thisChar.side as string) || charDef.side,
                        gp: (thisChar.gp as number | string) || "N/A",
                        gpReq: (thisChar.gpReq as number) || 0,
                        rarityReq: (thisChar.rarityReq as number) || 0,
                        gearReq: (thisChar.gearReq as number) || 0,
                        relicReq: (thisChar.relicReq as number) || 0,
                        valid: (thisChar.isValid as boolean) || false,
                        ship: (thisChar.isShip as boolean) || false,
                        required: (thisChar.isRequired as boolean) || false,
                    };
                }),
            );
        } catch (err) {
            return res.status(400).send((err as Error).message);
        }

        const unitsOut: { charList?: typeof unitList; shipList?: typeof unitList } = {};
        const chars = unitList.filter((u) => !u.ship);
        const ships = unitList.filter((u) => u.ship);
        if (chars.length) unitsOut.charList = chars;
        if (ships.length) unitsOut.shipList = ships;

        const isRequired = unitList.some((u) => u.required);

        let headerHeight = 0;
        if (req.body?.header) {
            const rowCount = Math.floor((req.body.header as string).length / 30);
            headerHeight = (rowCount + 1) * 55;
        }

        const charRowHeight = 65;
        const maxWidth = 1168;
        const tableCount = Object.keys(unitsOut).length;
        const maxHeight =
            40 +
            (tableCount - 1) * 30 +
            (unitList.length + tableCount) * charRowHeight +
            (req.body?.lastUpdated ? 55 : 0) +
            headerHeight +
            (isRequired ? 30 : 0) +
            (unitsOut?.charList?.length && unitsOut?.shipList?.length ? 40 : 0);

        const objIn: Record<string, unknown> = {
            baseURL: `http://localhost:${env.PORT}`,
            maxCharWidth: maxWidth,
            header: req.body.header as string | undefined,
            units: unitsOut,
            required: isRequired,
        };
        if (req.body.lastUpdated) {
            const d = new Date(req.body.lastUpdated as string);
            if (Number.isNaN(d.getTime())) return res.status(400).send("lastUpdated is not a valid date");
            objIn.footer = `Last updated ${d.toUTCString()}`;
        }

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/panicReq.ejs`, objIn);
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width: maxWidth, height: maxHeight });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ content: cssContent });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/multi-char", async (req: Request, res: Response) => {
        const charListIn = req.body.characters as unknown[];
        if (!Array.isArray(charListIn) || !charListIn.length) return res.status(400).send("Missing characters list");
        if (charListIn.length > MAX_UNITS) return res.status(400).send(`characters must not exceed ${MAX_UNITS} items`);

        let charList: {
            defId: string;
            charUrl: string;
            name: string | undefined;
            rarity: number;
            level: number;
            gear: number;
            zetas: number;
            relic: number;
            omicron: number;
            side: string;
        }[];
        try {
            charList = await Promise.all(
                charListIn.map(async (c) => {
                    const thisChar = c as Record<string, unknown>;
                    if (!thisChar.charUrl) throw new Error(`Character ${thisChar.defId} missing charUrl`);
                    return {
                        defId: thisChar.defId as string,
                        charUrl: await cachedUrl(thisChar.charUrl as string),
                        name: thisChar.name as string | undefined,
                        rarity: (thisChar.rarity as number) || charDef.rarity,
                        level: (thisChar.level as number) || charDef.level,
                        gear: (thisChar.gear as number) || charDef.gear,
                        zetas: (thisChar.zetas as number) || charDef.zetas,
                        relic: toRelicLevel(thisChar.relic as number),
                        omicron: (thisChar.omicron as number) || charDef.omicron,
                        side: (thisChar.side as string) || charDef.side,
                    };
                }),
            );
        } catch (err) {
            return res.status(400).send((err as Error).message);
        }

        const maxPerRow = 8;
        const maxCharWidth = Math.min(charList.length, maxPerRow);
        const maxCharHeight = Math.ceil(charList.length / maxPerRow);
        const maxWidth = 200 * maxCharWidth;

        let headerHeight = 0;
        if (req.body?.header) {
            const rowCount = Math.floor((req.body.header as string).length / 30);
            headerHeight = (rowCount + 1) * 55;
        }

        const maxHeight = headerHeight + 250 * maxCharHeight + (req.body?.lastUpdated ? 55 : 0);

        const objIn: Record<string, unknown> = {
            baseURL: `http://localhost:${env.PORT}`,
            maxCharWidth: maxWidth,
            header: req.body.header as string | undefined,
            characters: charList,
            footer: "",
        };
        if (req.body.lastUpdated) {
            const d = new Date(req.body.lastUpdated as string);
            if (Number.isNaN(d.getTime())) return res.status(400).send("lastUpdated is not a valid date");
            objIn.footer = `Last updated ${d.toUTCString()}`;
        }

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/multi-char.ejs`, objIn);
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width: maxWidth, height: maxHeight });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ content: cssContent });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/chart", async (req: Request, res: Response) => {
        if (!Array.isArray(req.body.labels)) return res.status(400).send("Missing labels");
        if (!Array.isArray(req.body.datasets)) return res.status(400).send("Missing datasets");

        const MAX_CHART_DIMENSION = 4096;
        const width = Math.min((req.body.width as number) || 800, MAX_CHART_DIMENSION);
        const height = Math.min((req.body.height as number) || 400, MAX_CHART_DIMENSION);

        const chartType = (req.body.type as string) || "line";
        const labels = (req.body.labels as unknown[]).map((l) => l ?? "");
        const datasets = (req.body.datasets as unknown[]).filter((d) => d != null);
        const title = (req.body.title as string) || undefined;
        const showLegend = req.body.showLegend !== false;
        const showPointLabels = req.body.pointLabels === true;

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/chart.ejs`, {
            baseURL: `http://localhost:${env.PORT}`,
            width,
            height,
        });
        const pointLabelsPluginDef = showPointLabels
            ? `
            const pointLabelsPlugin = {
                id: 'pointLabels',
                afterDatasetsDraw(chart) {
                    const canvasCtx = chart.ctx;
                    const placedBoxes = [];
                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                        const meta = chart.getDatasetMeta(datasetIndex);
                        if (!dataset.data) return;
                        meta.data.forEach((element, index) => {
                            const value = dataset.data[index];
                            if (value == null) return;
                            const label = String(value);
                            const x = element.x;
                            const y = element.y - 12;
                            canvasCtx.save();
                            canvasCtx.font = 'bold 11px sans-serif';
                            const textWidth = canvasCtx.measureText(label).width;
                            const pad = 2;
                            const box = { left: x - textWidth / 2 - pad, right: x + textWidth / 2 + pad, top: y - 13, bottom: y + 2 };
                            const overlaps = placedBoxes.some(b =>
                                box.left < b.right && box.right > b.left &&
                                box.top < b.bottom && box.bottom > b.top
                            );
                            if (!overlaps) {
                                placedBoxes.push(box);
                                canvasCtx.fillStyle = typeof dataset.borderColor === 'string' ? dataset.borderColor : '#333';
                                canvasCtx.textAlign = 'center';
                                canvasCtx.textBaseline = 'bottom';
                                canvasCtx.fillText(label, x, y);
                            }
                            canvasCtx.restore();
                        });
                    });
                }
            };`
            : "";
        const chartInitScript = `(function() {
            const ctx = document.getElementById("chart").getContext("2d");
            ${pointLabelsPluginDef}
            new Chart(ctx, {
                type: ${JSON.stringify(chartType)},
                data: {
                    labels: ${JSON.stringify(labels)},
                    datasets: ${JSON.stringify(datasets)},
                },
                options: {
                    responsive: false,
                    animation: false,
                    plugins: {
                        legend: { display: ${showLegend} },
                        ${title ? `title: { display: true, text: ${JSON.stringify(title)} },` : ""}
                    },
                    scales: {
                        y: { beginAtZero: true },
                    },
                },
                ${showPointLabels ? "plugins: [pointLabelsPlugin]," : ""}
            });
        })();`;
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width, height });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addScriptTag({ content: chartJsContent });
            await page.addScriptTag({ content: chartInitScript });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/arena", async (req: Request, res: Response) => {
        const charTeamIn = req.body.charTeam as unknown[];
        const fleetTeamIn = req.body.fleetTeam as unknown[];
        if (!Array.isArray(charTeamIn) || !charTeamIn.length) return res.status(400).send("Missing charTeam");
        if (!Array.isArray(fleetTeamIn) || !fleetTeamIn.length) return res.status(400).send("Missing fleetTeam");
        const MAX_CHAR_SQUAD = 5;
        const MAX_FLEET_SQUAD = 8; // 1 capital + 3 starting + 4 reinforcements
        if (charTeamIn.length > MAX_CHAR_SQUAD) return res.status(400).send(`charTeam must not exceed ${MAX_CHAR_SQUAD} items`);
        if (fleetTeamIn.length > MAX_FLEET_SQUAD) return res.status(400).send(`fleetTeam must not exceed ${MAX_FLEET_SQUAD} items`);

        type ArenaUnit = {
            defId: string;
            charUrl: string;
            name: string | undefined;
            rarity: number;
            level: number;
            gear: number;
            zetas: number;
            relic: number;
            omicron: number;
            side: string;
        };

        const mapUnit = async (u: unknown, isFleet: boolean): Promise<ArenaUnit> => {
            const thisChar = u as Record<string, unknown>;
            if (!thisChar.charUrl) throw new Error(`${isFleet ? "fleetTeam" : "charTeam"} unit ${thisChar.defId} missing charUrl`);
            return {
                defId: thisChar.defId as string,
                charUrl: await cachedUrl(thisChar.charUrl as string),
                name: thisChar.name as string | undefined,
                rarity: (thisChar.rarity as number) || charDef.rarity,
                level: (thisChar.level as number) || charDef.level,
                gear: isFleet ? 0 : (thisChar.gear as number) || charDef.gear,
                zetas: (thisChar.zetas as number) || charDef.zetas,
                relic: isFleet ? 0 : toRelicLevel(thisChar.relic as number),
                omicron: (thisChar.omicron as number) || charDef.omicron,
                side: (thisChar.side as string) || charDef.side,
            };
        };

        let charTeam: ArenaUnit[];
        let fleetTeam: ArenaUnit[];
        try {
            charTeam = await Promise.all(charTeamIn.map((u) => mapUnit(u, false)));
            fleetTeam = await Promise.all(fleetTeamIn.map((u) => mapUnit(u, true)));
        } catch (err) {
            return res.status(400).send((err as Error).message);
        }

        const width = 200 * Math.max(charTeam.length, fleetTeam.length);
        const PLAYER_HEADER_H = req.body.name || req.body.allyCode ? 50 : 0; // px: header font-size 28 + padding
        // 20 body padding + optional header + char label (45) + char row (250) + divider (27) + fleet label (45) + fleet row (250)
        const height = 20 + PLAYER_HEADER_H + 45 + 250 + 27 + 45 + 250;

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/arena.ejs`, {
            baseURL: `http://localhost:${env.PORT}`,
            name: (req.body.name as string) || undefined,
            allyCode: (req.body.allyCode as string) || undefined,
            charRank: (req.body.charRank as number) || 0,
            fleetRank: (req.body.fleetRank as number) || 0,
            charTeam,
            fleetTeam,
            width,
        });

        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width, height });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ content: cssContent });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
        logger.error({ err }, "Unhandled request error");
        if (!res.headersSent) {
            res.status(500).send("Internal server error");
        }
    });

    const server = app.listen(env.PORT, () => {
        logger.info(`ImageServe: Service started on port ${env.PORT}`);
    });

    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        logger.info(`Received ${signal}, shutting down`);
        clearInterval(metaInterval);
        await browser.close();
        server.close(() => {
            logger.info("HTTP server closed");
            process.exit(0);
        });
        setTimeout(() => {
            logger.warn("Forced exit after shutdown timeout");
            process.exit(1);
        }, 10_000).unref();
    };

    const onSignal = (signal: string) =>
        shutdown(signal).catch((err) => {
            logger.error({ err }, "Shutdown error");
            process.exit(1);
        });

    process.once("SIGTERM", () => onSignal("SIGTERM"));
    process.once("SIGINT", () => onSignal("SIGINT"));
};

init().catch((err) => {
    logger.error({ err }, "Fatal startup error");
    process.exit(1);
});
