const express = require("express");
const puppeteer = require("puppeteer");
const ejs = require("ejs");
const fs = require("fs");

const init = async function() {
    const browser = await puppeteer.launch({args: ["--no-sandbox", ]});
    const page = await browser.newPage();

    const app = express();
    app.use(express.static(__dirname + "/GearIcons"));

    // Set the dimensions of the character image
    await page.setViewport({width: 210, height: 210});
    const relicTier = [0,0,0,1,2,3,4,5,6,7];
    const charDef = { defId: "", rarity: 1, level: 0, gear: 1, zeta: 0, relic: 0, side: ""};

    app.get("/char/:charId/:rarity/:level/:gear/:zeta/:relic/:side", async function(req, res) {
        req.params.relic = relicTier[req.params.relic];

        const charStats = {
            unit: {
                defId:  req.params.charId,
                rarity: req.params.rarity || charDef.rarity,
                level:  req.params.level  || charDef.level,
                gear:   req.params.gear   || charDef.gear,
                zetas:  req.params.zeta   || charDef.zeta,
                relic:  req.params.relic  || charDef.relic,
                side:   req.params.side   || charDef.side
            }
        };
        const ssPath = __dirname + "/imageOut/" + Object.keys(charStats.unit).map(k => charStats.unit[k]).join("-") + ".png";
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

    app.listen(3600, () => {console.log("Express server listening");});
};

init();
