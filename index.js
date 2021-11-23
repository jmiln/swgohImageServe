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

    // Set the dimensions of the character image
    await page.setViewport({width: 210, height: 210});
    const relicTier = [0,0,0,1,2,3,4,5,6,7,8,9];
    const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zeta: 0, relic: 0, side: ""};

    app.post("/char", async (req, res) => {
        const charStats = {
            unit: {
                defId:   req.body.defId,
                charUrl: req.body.charUrl,
                rarity:  req.body.rarity           || charDef.rarity,
                level:   req.body.level            || charDef.level,
                gear:    req.body.gear             || charDef.gear,
                zetas:   req.body.zetas            || charDef.zetas,
                relic:   relicTier[req.body.relic] || charDef.relic,
                side:    req.body.side             || charDef.side
            }
        };
        const ssPath = __dirname + "/imageOut/" + Object.keys(charStats.unit).filter(k => k !== "charUrl").map(k => charStats.unit[k]).join("-") + ".png";
        console.log(ssPath);
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

    app.listen(config.port, () => {console.log("Express server listening");});
};

init();
