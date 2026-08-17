import assert from "node:assert/strict";
import { test } from "node:test";
import { createMetadataStore } from "../modules/metadata.ts";

const meta = (assetVersion: string) => ({
    assetVersion,
    latestGamedataVersion: "gd-1",
    latestLocalizationBundleVersion: "loc-1",
    somethingElse: "should be dropped",
});

/** Records info-level calls so tests can assert on what was logged. */
const fakeLogger = () => {
    const calls: string[] = [];
    return {
        log: {
            info(content: unknown, msg?: string) {
                calls.push(msg ?? String(content));
            },
        },
        calls,
    };
};

test("refresh keeps only the three known keys", async () => {
    const { log } = fakeLogger();
    const store = createMetadataStore({ getMetaData: async () => meta("v1") }, log);

    await store.refresh();

    assert.deepEqual(store.get(), {
        assetVersion: "v1",
        latestGamedataVersion: "gd-1",
        latestLocalizationBundleVersion: "loc-1",
    });
});

test("get throws with an actionable message before the first refresh", () => {
    const { log } = fakeLogger();
    const store = createMetadataStore({ getMetaData: async () => meta("v1") }, log);

    assert.throws(() => store.get(), /refresh/i);
});

test("get returns the most recent refresh", async () => {
    const { log } = fakeLogger();
    let current = "v1";
    const store = createMetadataStore({ getMetaData: async () => meta(current) }, log);

    await store.refresh();
    current = "v2";
    await store.refresh();

    assert.equal(store.get().assetVersion, "v2");
});

test("logs when assetVersion changes between refreshes", async () => {
    const { log, calls } = fakeLogger();
    let current = "v1";
    const store = createMetadataStore({ getMetaData: async () => meta(current) }, log);

    await store.refresh();
    current = "v2";
    await store.refresh();

    const changeLogs = calls.filter((c) => /asset version/i.test(c));
    assert.equal(changeLogs.length, 1);
    assert.match(changeLogs[0], /v1/);
    assert.match(changeLogs[0], /v2/);
});

test("does not log when assetVersion is unchanged", async () => {
    const { log, calls } = fakeLogger();
    const store = createMetadataStore({ getMetaData: async () => meta("v1") }, log);

    await store.refresh();
    await store.refresh();

    assert.equal(calls.filter((c) => /asset version/i.test(c)).length, 0);
});

test("does not log a change on the very first refresh", async () => {
    const { log, calls } = fakeLogger();
    const store = createMetadataStore({ getMetaData: async () => meta("v1") }, log);

    await store.refresh();

    assert.equal(calls.filter((c) => /asset version/i.test(c)).length, 0);
});
