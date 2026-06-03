import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import ejs from "ejs";

const templatePath = path.join(import.meta.dirname, "../ejs/chart.ejs");
const baseVars = {
    baseURL: "http://localhost:3600",
    width: 800,
    height: 400,
};

test("renders canvas with correct dimensions", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes('id="chart"'), "missing canvas#chart");
    assert.ok(html.includes('width="800"'), "missing width attr");
    assert.ok(html.includes('height="400"'), "missing height attr");
});

test("renders canvas with custom dimensions", async () => {
    const html = await ejs.renderFile(templatePath, { ...baseVars, width: 600, height: 300 });
    assert.ok(html.includes('width="600"'), "missing custom width");
    assert.ok(html.includes('height="300"'), "missing custom height");
});

test("includes base href pointing to baseURL", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(html.includes('href="http://localhost:3600"'), "missing base href");
});

test("contains no external script tags", async () => {
    const html = await ejs.renderFile(templatePath, baseVars);
    assert.ok(!html.includes('<script src'), "template should not contain external script src (scripts are injected via addScriptTag)");
});
