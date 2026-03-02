import fs from "node:fs";
import ComlinkStub from "@swgoh-utils/comlink";
import ejs from "ejs";
import express, { type Request, type Response } from "express";
import pino from "pino";
import puppeteer from "puppeteer";
import { env } from "./modules/config.ts";
import { checkImgOrDownload } from "./modules/download.ts";

const logger = pino({ base: { hostname: undefined } });

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
    if (fs.existsSync(META_FILE)) {
        metaFile = JSON.parse(fs.readFileSync(META_FILE, "utf-8")) as Partial<MetaData>;
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
        fs.writeFileSync(META_FILE, JSON.stringify(metaOut), { encoding: "utf8" });
    }
    metadataFile = metaOut;
    return isUpdated;
}

const relicTier = [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zetas: 0, relic: 0, side: "", omicron: 0 };
const assetPort = env.ASSET_PORT ?? null;

const cachedUrl = async (rawUrl: string) =>
    `http://localhost:${env.PORT}/CharIcons/${await checkImgOrDownload(rawUrl, "./public/CharIcons", {
        assetPort,
        assetVersion: metadataFile.assetVersion,
    })}`;

const MAX_UNITS = 200;

const init = async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: minimal_args,
        userDataDir: "./cacheDir",
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
    setInterval(
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
            relic: relicTier[req.body.relic as number] ?? charDef.relic,
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
            await page.addStyleTag({ path: `${import.meta.dirname}/public/css/styles.css` });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/panic", async (req: Request, res: Response) => {
        const charListIn = req.body.units as unknown[];
        if (!charListIn?.length) return res.status(400).send("Missing units list");
        if (!Array.isArray(charListIn)) return res.status(400).send("units must be an array");
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
                        relic: relicTier[thisChar.relic as number] ?? charDef.relic,
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
        if (unitList.find((u) => !u.ship)) unitsOut.charList = unitList.filter((u) => !u.ship);
        if (unitList.find((u) => u.ship)) unitsOut.shipList = unitList.filter((u) => u.ship);

        const isRequired = !!unitList.find((u) => u.required);

        let headerHeight = 0;
        if (req.body?.header) {
            const rowCount = Math.floor((req.body.header as string).length / 30);
            headerHeight = rowCount ? rowCount * 55 : 55;
        }

        const charRowHeight = 65;
        const maxWidth = 1168;
        const maxHeight =
            40 +
            (Object.keys(unitsOut).length - 1) * 30 +
            (unitList.length + 1) * charRowHeight +
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
            objIn.footer = `Last updated ${new Date(req.body.lastUpdated as string).toUTCString()}`;
        }

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/panicReq.ejs`, objIn);
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width: maxWidth, height: maxHeight });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ path: `${import.meta.dirname}/public/css/styles.css` });
            return page.screenshot({ type: "png", omitBackground: true });
        });
        res.contentType("image/png");
        res.send(Buffer.from(ssBuffer));
    });

    app.post("/multi-char", async (req: Request, res: Response) => {
        const charListIn = req.body.characters as unknown[];
        if (!charListIn?.length) return res.status(400).send("Missing characters list");
        if (!Array.isArray(charListIn)) return res.status(400).send("characters must be an array");
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
                        relic: relicTier[thisChar.relic as number] ?? charDef.relic,
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
        const maxHeight = 55 + 250 * maxCharHeight + (req.body?.lastUpdated ? 55 : 0);

        const objIn: Record<string, unknown> = {
            baseURL: `http://localhost:${env.PORT}`,
            maxCharWidth: maxWidth,
            header: req.body.header as string | undefined,
            characters: charList,
            footer: "",
        };
        if (req.body.lastUpdated) {
            objIn.footer = `Last updated ${new Date(req.body.lastUpdated as string).toUTCString()}`;
        }

        const result = await ejs.renderFile(`${import.meta.dirname}/ejs/multi-char.ejs`, objIn);
        const ssBuffer = await withPage(async () => {
            await page.setViewport({ width: maxWidth, height: maxHeight });
            await page.setContent(result, { waitUntil: ["load"] });
            await page.addStyleTag({ path: `${import.meta.dirname}/public/css/styles.css` });
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

    app.listen(env.PORT, () => {
        logger.info(`ImageServe: Service started on port ${env.PORT}`);
    });
};

init();
