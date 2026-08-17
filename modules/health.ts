import type { Request, Response } from "express";

/**
 * Builds the GET /health handler.
 *
 * The browser state is injected as a callback rather than a boolean so the handler samples it on
 * every request. Express stays up when Chromium dies, so a cached value would report healthy for a
 * process that can no longer render anything.
 */
export const createHealthHandler =
    (isBrowserConnected: () => boolean) =>
    (_req: Request, res: Response): void => {
        const connected = isBrowserConnected();
        res.status(connected ? 200 : 503).json({
            status: connected ? "ok" : "degraded",
            browser: connected ? "connected" : "disconnected",
        });
    };
