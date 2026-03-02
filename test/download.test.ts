import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { checkImgOrDownload } from "../modules/download.ts";

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "imgtest-"));

test("throws when url is undefined", async () => {
    await assert.rejects(() => checkImgOrDownload(undefined as unknown as string, "/tmp", {}), TypeError);
});

test("throws when url is empty string", async () => {
    await assert.rejects(() => checkImgOrDownload("", "/tmp", {}), TypeError);
});

test("returns cached filename without fetching when file exists", async () => {
    const dir = tmpDir();
    const imgName = "tex.UNIT_BOBAFETT.png";
    fs.writeFileSync(path.join(dir, imgName), "fake");

    const fetchCalled = mock.fn();
    mock.method(globalThis, "fetch", fetchCalled);

    const result = await checkImgOrDownload(`https://example.com/${imgName}`, dir, {});

    assert.equal(result, imgName);
    assert.equal(fetchCalled.mock.calls.length, 0);

    mock.restoreAll();
    fs.rmSync(dir, { recursive: true });
});

test("downloads and saves file when not cached", async () => {
    const dir = tmpDir();
    const imgName = "tex.UNIT_BOBAFETT.png";
    const fakeContent = Buffer.from("fake-image-data");

    mock.method(globalThis, "fetch", async () => ({
        ok: true,
        blob: async () => ({
            arrayBuffer: async () => fakeContent.buffer,
        }),
    }));

    const result = await checkImgOrDownload(`https://example.com/${imgName}`, dir, {});

    assert.equal(result, imgName);
    assert.ok(fs.existsSync(path.join(dir, imgName)));

    mock.restoreAll();
    fs.rmSync(dir, { recursive: true });
});

test("throws on non-ok fetch response instead of writing undefined", async () => {
    const dir = tmpDir();

    mock.method(globalThis, "fetch", async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
    }));

    await assert.rejects(
        () => checkImgOrDownload("https://example.com/tex.UNIT_BOBAFETT.png", dir, {}),
        /Failed to download asset: 404/,
    );

    mock.restoreAll();
    fs.rmSync(dir, { recursive: true });
});

test("throws on fetch network error", async () => {
    const dir = tmpDir();

    mock.method(globalThis, "fetch", async () => {
        throw new Error("ECONNREFUSED");
    });

    await assert.rejects(
        () => checkImgOrDownload("https://example.com/tex.UNIT_BOBAFETT.png", dir, {}),
        /ECONNREFUSED/,
    );

    mock.restoreAll();
    fs.rmSync(dir, { recursive: true });
});

test("builds correct assetUrl when assetPort is set", async () => {
    const dir = tmpDir();
    const imgName = "tex.UNIT_BOBAFETT.png";
    let capturedUrl = "";

    mock.method(globalThis, "fetch", async (url: string) => {
        capturedUrl = url;
        return {
            ok: true,
            blob: async () => ({ arrayBuffer: async () => Buffer.alloc(0).buffer }),
        };
    });

    await checkImgOrDownload(`https://example.com/${imgName}`, dir, {
        assetPort: 3500,
        assetVersion: "v42",
    });

    assert.match(capturedUrl, /localhost:3500\/Asset\/single/);
    assert.match(capturedUrl, /assetName=UNIT_BOBAFETT/);
    assert.match(capturedUrl, /version=v42/);

    mock.restoreAll();
    fs.rmSync(dir, { recursive: true });
});

test("throws when assetPort is set but filename has wrong format", async () => {
    const dir = tmpDir();

    await assert.rejects(
        () => checkImgOrDownload("https://example.com/badname.png", dir, {
            assetPort: 3500,
            assetVersion: "v42",
        }),
        /Unexpected asset filename format/,
    );

    fs.rmSync(dir, { recursive: true });
});
