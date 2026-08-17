import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { createHealthHandler } from "../modules/health.ts";

/** Minimal stand-in for an Express response that records what the handler set. */
const fakeRes = () => {
    const captured = { statusCode: 0, body: undefined as unknown };
    const res = {
        status(code: number) {
            captured.statusCode = code;
            return res;
        },
        json(payload: unknown) {
            captured.body = payload;
            return res;
        },
    };
    return { res: res as unknown as Response, captured };
};

test("returns 200 and ok when the browser is connected", () => {
    const handler = createHealthHandler(() => true, "2.0.0");
    const { res, captured } = fakeRes();

    handler({} as Request, res);

    assert.equal(captured.statusCode, 200);
    assert.deepEqual(captured.body, { status: "ok", browser: "connected", version: "2.0.0" });
});

test("returns 503 and degraded when the browser is disconnected", () => {
    const handler = createHealthHandler(() => false, "2.0.0");
    const { res, captured } = fakeRes();

    handler({} as Request, res);

    assert.equal(captured.statusCode, 503);
    assert.deepEqual(captured.body, { status: "degraded", browser: "disconnected", version: "2.0.0" });
});

test("reports whatever version it was given", () => {
    const handler = createHealthHandler(() => true, "9.9.9-test");
    const { res, captured } = fakeRes();

    handler({} as Request, res);

    assert.deepEqual(captured.body, { status: "ok", browser: "connected", version: "9.9.9-test" });
});

test("re-reads browser state on every call rather than capturing it once", () => {
    let connected = true;
    const handler = createHealthHandler(() => connected, "2.0.0");

    const first = fakeRes();
    handler({} as Request, first.res);
    assert.equal(first.captured.statusCode, 200);

    connected = false;
    const second = fakeRes();
    handler({} as Request, second.res);
    assert.equal(second.captured.statusCode, 503);
});
