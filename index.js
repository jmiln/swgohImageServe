const config = require("./config.js");
const express = require("express");
const puppeteer = require("puppeteer");
const bodyParser = require("body-parser");
const ejs = require("ejs");

const fs = require("fs");

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


const init = async function() {
    const browser = await puppeteer.launch({
        headless: true,
        args: minimal_args,
        userDataDir: "./cacheDir"
    });
    const page = await browser.newPage();

    const app = express();
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.use(express.static(__dirname + "/public"));

    const relicTier = [0,0,0,1,2,3,4,5,6,7,8,9];
    const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zeta: 0, relic: 0, side: "", omicron: 0};

    app.post("/char", async (req, res) => {
        // Set the dimensions of the character image
        await page.setViewport({width: 210, height: 210});
        const charStats = {
            defId:   req.body.defId,
            charUrl: `http://localhost:${config.port}/CharIcons/` + await checkImgOrDownload(req.body.charUrl, "./public/CharIcons"),
            rarity:  req.body.rarity           || charDef.rarity,
            level:   req.body.level            || charDef.level,
            gear:    req.body.gear             || charDef.gear,
            zetas:   req.body.zetas            || charDef.zetas,
            relic:   relicTier[req.body.relic] || charDef.relic,
            omicron: req.body.omicron          || charDef.omicron,
            side:    req.body.side             || charDef.side
        };
        ejs.renderFile(__dirname + "/ejs/char.ejs", {
            baseURL: `http://localhost:${config.port}`,
            char: charStats
        }, async (err, result) => {
            if (err) return console.log("info", "error encountered: " + err);
            await page.setContent(result, {
                waitUntil: ["load"]
            });
            await page.addStyleTag({path: "./public/css/styles.css"});
            const ssBuffer = await page.screenshot({type: "png", omitBackground: true});
            res.contentType("image/png");
            res.send(Buffer.from(ssBuffer, "binary"));
        });
    });

    // app.get("/chart", async (req, res) => {
    // app.post("/chart", async (req, res) => {
    //     const chartPage = await browser.newPage();
    //     // const labels = req.body.labels;
    //     // const data = req.body.data;
    //     //
    //     // if (!labels?.length || !data?.length) return res.status(500).send(new Error("Label or data missing!"));
    //     // if (labels.length !== data.length) return res.status(500).send(new Error("Label length and data length MUST be the same!"));
    //
    //     ejs.renderFile(__dirname + "/ejs/chart.ejs", {
    //         labels: ["One", "February", "March", "April", "May", "June", "July", "TEST"],
    //         datasets: [
    //             {
    //                 label: "set1",
    //                 data: [
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                 ]
    //             },
    //             {
    //                 label: "set2",
    //                 data: [
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100),
    //                     Math.floor(Math.random() * 100)
    //                 ]
    //             },
    //         ],
    //     }, async (err, result) => {
    //         if (err) return console.error("Error: " + err);
    //         // res.send(result);
    //         await chartPage.addScriptTag({
    //             path: "./node_modules/chart.js/dist/chart.umd.js"
    //         });
    //         await chartPage.setContent(result, {
    //             waitUntil: ["load"]
    //         });
    //         const chartElement = await chartPage.$("#testChart");
    //         const ssBuffer = await chartElement.screenshot({type: "png", omitBackground: true});
    //         await chartPage.close();
    //         res.contentType("image/png");
    //         res.send(Buffer.from(ssBuffer, "binary"));
    //     });
    // });

    app.post("/multi-char", async (req, res) => {
        // Take in an array of characters, put it into rows up up to 5?
        // - This can be used to show factions, sets of teams for events, other stuff?
        // - If for events, there needs to be a way to show that something is or isn't ready, maybe a transparent red overlay for not
        const charList = [];
        const charListIn = req.body.characters;
        if (!charListIn?.length) return console.error("[multi-char] Missing character list");

        if (!Array.isArray(charListIn)) return console.error("[multi-char] Character list is not an array");
        for (const thisChar of charListIn) {
            charList.push({
                defId:   thisChar.defId,
                charUrl: `http://localhost:${config.port}/CharIcons/` + await checkImgOrDownload(thisChar.charUrl, "./public/CharIcons"),
                name:    thisChar.name,
                rarity:  thisChar.rarity           || charDef.rarity,
                level:   thisChar.level            || charDef.level,
                gear:    thisChar.gear             || charDef.gear,
                zetas:   thisChar.zetas            || charDef.zetas,
                relic:   relicTier[thisChar.relic] || charDef.relic,
                omicron: thisChar.omicron          || charDef.omicron,
                side:    thisChar.side             || charDef.side
            });
        }

        const maxPerRow = 8;

        // Set the dimensions of the character image
        const maxCharWidth  = charList.length > maxPerRow ? maxPerRow : charList.length;
        const maxCharHeight = Math.ceil(charList.length / maxPerRow);
        const maxWidth = 200 * maxCharWidth;
        const maxHeight = 55 + (250 * maxCharHeight) + (req?.body?.lastUpdated ? 55 : 0);
        await page.setViewport({width: maxWidth, height: maxHeight});

        const objIn = {
            baseURL: `http://localhost:${config.port}`,
            maxCharWidth: maxWidth,
            header: req.body.header,
            characters: charList,
            footer: ""
        };
        if (req.body.lastUpdated) {
            objIn.footer = `Last updated ${new Date(req.body.lastUpdated).toUTCString()}`;
        }

        ejs.renderFile(__dirname + "/ejs/multi-char.ejs", objIn, async (err, result) => {
            if (err) return console.log("info", "error encountered: " + err);
            await page.setContent(result, {
                waitUntil: ["load"]
            });
            await page.addStyleTag({path: "./public/css/styles.css"});
            const ssBuffer = await page.screenshot({type: "png", omitBackground: true});
            res.contentType("image/png");
            res.send(Buffer.from(ssBuffer, "binary"));
        });
    });

    app.listen(config.port, () => {
        console.log(`Express server listening on port ${config.port}`);
    });
};

async function checkImgOrDownload(url, dir) {
    const imgName = url.split("/").pop();
    const path = `${dir}/${imgName}`;

    // TODO This needs to be gotten automatically so it can update, but this is the current version
    const assetVersion = 3206;

    if (fs.existsSync(path)) {
        // If it exists, then just give the name
        return imgName;
    }

    let assetUrl;
    if (config.assetPort) {
        const assetName = imgName.split(".")[1];    // Generally `tex.ASSET_NAME.png`, so grabbing just the name out
        assetUrl  = `http://localhost:${config.assetPort}/Asset/single?forceReDownload=true&version=${assetVersion}&assetName=${assetName}`;
    }

    // Otherwise, download & save the image, then give the name
    const buffer = await fetch(assetUrl || url)
        .then(async res => res.blob())
        .then(async res => res.arrayBuffer())
        .then(async res => Buffer.from(res));
    await fs.promises.writeFile(path, buffer);
    return imgName;
}

init();
