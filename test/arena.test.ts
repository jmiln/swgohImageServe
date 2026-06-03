import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import ejs from "ejs";

const templatePath = path.join(import.meta.dirname, "../ejs/arena.ejs");

const charUnit = {
    charUrl: "http://localhost:3600/CharIcons/DARTHREVAN.png",
    defId: "DARTHREVAN",
    name: "Darth Revan",
    rarity: 7,
    level: 85,
    gear: 13,
    zetas: 3,
    relic: 7,
    omicron: 1,
    side: "dark",
};

const fleetUnit = {
    charUrl: "http://localhost:3600/CharIcons/CAPITALCHIMAERA.png",
    defId: "CAPITALCHIMAERA",
    name: "Chimaera",
    rarity: 7,
    level: 85,
    gear: 0,
    zetas: 0,
    relic: 0,
    omicron: 0,
    side: "dark",
};

const baseVars = {
    baseURL: "http://localhost:3600",
    name: "PlayerName",
    allyCode: "123-456-789",
    charRank: 42,
    fleetRank: 15,
    charTeam: [charUnit],
    fleetTeam: [fleetUnit],
    width: 200,
};

test("renders player header when name and allyCode are provided", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes("PlayerName"), "missing player name in header");
    assert.ok(html.includes("123-456-789"), "missing ally code in header");
});

test("omits player header when name and allyCode are absent", async () => {
    const html = await ejs.renderFile(templatePath, { ...baseVars, name: undefined, allyCode: undefined });
    assert.ok(!html.includes('id="player-header"'), "player-header element should be absent");
});

test("renders character arena section label with rank", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes("Character Arena"), "missing 'Character Arena' label");
    assert.ok(html.includes("42"), "missing char rank number");
});

test("renders fleet arena section label with rank", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes("Fleet Arena"), "missing 'Fleet Arena' label");
    assert.ok(html.includes("15"), "missing fleet rank number");
});

test("renders both charTeam and fleetTeam portrait images", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes("DARTHREVAN.png"), "missing char team portrait src");
    assert.ok(html.includes("CAPITALCHIMAERA.png"), "missing fleet team portrait src");
});

test("fleet portraits have no gear frame overlay (gear forced to 0)", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    // char.ejs only renders <div class="char-portrait-full-gear"> when char.gear > 0
    // charUnit has gear:13 (1 overlay), fleetUnit has gear:0 (0 overlays) -> total: 1
    const gearOverlayCount = (html.match(/class="char-portrait-full-gear"/g) ?? []).length;
    assert.equal(gearOverlayCount, 1, "only the char team unit should have a gear overlay div");
});

test("includes base href pointing to baseURL", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes('href="http://localhost:3600"'), "missing base href");
});

test("renders player header with name only when allyCode is absent", async () => {
    const html = await ejs.renderFile(templatePath, { ...baseVars, allyCode: undefined });
    assert.ok(html.includes('id="player-header"'), "player-header element should be present");
    assert.ok(html.includes("PlayerName"), "missing player name");
    assert.ok(!html.includes("undefined"), "should not render undefined");
});

test("renders player header with allyCode only when name is absent", async () => {
    const html = await ejs.renderFile(templatePath, { ...baseVars, name: undefined });
    assert.ok(html.includes('id="player-header"'), "player-header element should be present");
    assert.ok(html.includes("123-456-789"), "missing ally code");
    assert.ok(!html.includes("undefined"), "should not render undefined");
});
