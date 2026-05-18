import fs from "node:fs/promises";

interface DownloadOpts {
    assetPort?: number | null;
    assetVersion?: string;
}

const inFlight = new Map<string, Promise<string>>();

async function fileExists(filePath: string): Promise<boolean> {
    return fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
}

export async function checkImgOrDownload(url: string, dir: string, opts: DownloadOpts = {}): Promise<string> {
    if (!url) throw new TypeError("url is required");

    const imgName = url.split("/").pop() as string;
    const filePath = `${dir}/${imgName}`;

    if (await fileExists(filePath)) {
        return imgName;
    }

    const existing = inFlight.get(filePath);
    if (existing) return existing;

    const download = (async () => {
        let assetUrl: string | undefined;
        if (opts.assetPort) {
            const parts = imgName.split(".");
            if (parts.length < 3) throw new Error(`Unexpected asset filename format: "${imgName}"`);
            const assetName = parts[1];
            assetUrl = `http://localhost:${opts.assetPort}/Asset/single?forceReDownload=true&version=${opts.assetVersion}&assetName=${assetName}`;
        }

        const res = await fetch(assetUrl ?? url);
        if (!res.ok) throw new Error(`Failed to download asset: ${res.status} ${res.statusText}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(filePath, buffer);
        return imgName;
    })();

    inFlight.set(filePath, download);
    try {
        return await download;
    } finally {
        // Always remove so failed downloads can be retried; concurrent retries are safe (idempotent write).
        inFlight.delete(filePath);
    }
}
