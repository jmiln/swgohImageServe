import fs from "node:fs";

interface DownloadOpts {
    assetPort?: number | null;
    assetVersion?: string;
}

export async function checkImgOrDownload(url: string, dir: string, opts: DownloadOpts = {}): Promise<string> {
    if (!url) throw new TypeError("url is required");

    const imgName = url.split("/").pop() as string;
    const filePath = `${dir}/${imgName}`;

    if (fs.existsSync(filePath)) {
        return imgName;
    }

    let assetUrl: string | undefined;
    if (opts.assetPort) {
        const parts = imgName.split(".");
        if (parts.length < 3) throw new Error(`Unexpected asset filename format: "${imgName}"`);
        const assetName = parts[1];
        assetUrl = `http://localhost:${opts.assetPort}/Asset/single?forceReDownload=true&version=${opts.assetVersion}&assetName=${assetName}`;
    }

    const res = await fetch(assetUrl ?? url);
    if (!res.ok) throw new Error(`Failed to download asset: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);
    return imgName;
}
