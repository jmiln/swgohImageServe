const config = require("./config.js");
const express = require("express");
const puppeteer = require("puppeteer");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const fs = require("fs");

const init = async function() {
    const browser = await puppeteer.launch({args: ["--no-sandbox", ]});
    const page = await browser.newPage();

    const app = express();
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.use(express.static(__dirname + "/GearIcons"));

    const relicTier = [0,0,0,1,2,3,4,5,6,7,8,9];
    const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zeta: 0, relic: 0, side: ""};

    app.post("/char", async (req, res) => {
        // Set the dimensions of the character image
        await page.setViewport({width: 210, height: 210});
        const charStats = {
            defId:   req.body.defId,
            charUrl: req.body.charUrl,
            rarity:  req.body.rarity           || charDef.rarity,
            level:   req.body.level            || charDef.level,
            gear:    req.body.gear             || charDef.gear,
            zetas:   req.body.zetas            || charDef.zetas,
            relic:   relicTier[req.body.relic] || charDef.relic,
            side:    req.body.side             || charDef.side
        };
        const ssPath = __dirname + "/imageOut/" + Object.keys(charStats).filter(k => k !== "charUrl").map(k => charStats[k]).join("-") + ".png";
        if (fs.existsSync(ssPath)) {
            // File exists, send it
            res.sendFile(ssPath);
        } else {
            // Doesn't exist, create it
            let out;
            ejs.renderFile(__dirname + "/ejs/char.ejs", {
                char: charStats
            }, (err, result) => {
                if (err) {
                    return console.log("info", "error encountered: " + err);
                } else {
                    out = result;
                }
            });

            await page.setContent(out);
            await page.screenshot({path: ssPath, type: "png", omitBackground: true});
            res.sendFile(ssPath);
        }
    });

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
                charUrl: thisChar.charUrl,
                name:    thisChar.name,
                rarity:  thisChar.rarity           || charDef.rarity,
                level:   thisChar.level            || charDef.level,
                gear:    thisChar.gear             || charDef.gear,
                zetas:   thisChar.zetas            || charDef.zetas,
                relic:   relicTier[thisChar.relic] || charDef.relic,
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

        // TODO Stick the timestamp/ lastUpdated into the path, so it can be compared against, then
        // send an old one if possible.
        const fileName = req.body.header.replace("'", "").replace(/[^A-Za-z0-9 ]/g, "-");

        const ssPath = __dirname + "/imageOut/multi/" + fileName + ".png";

        let out;
        const objIn = {
            maxCharWidth: maxWidth,
            header: req.body.header,
            characters: charList
        };
        if (req.body.lastUpdated) {
            objIn.footer = `Last updated ${new Date(req.body.lastUpdated).toUTCString()}`;
        }
        ejs.renderFile(__dirname + "/ejs/multi-char.ejs", objIn, (err, result) => {
            if (err) {
                return console.log("info", "error encountered: " + err);
            } else {
                fs.writeFileSync(`./data/${fileName}.html`, result);
                out = result;
            }
        });

        await page.setContent(out);
        await page.screenshot({path: ssPath, type: "png", omitBackground: true});
        res.sendFile(ssPath);
    });

    app.listen(config.port, () => {console.log("Express server listening");});
};

init();
