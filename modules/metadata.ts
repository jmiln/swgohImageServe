export interface MetaData {
    assetVersion: string;
    latestGamedataVersion: string;
    latestLocalizationBundleVersion: string;
}

/** Only what this module needs from the Comlink stub, so tests can pass a plain object. */
export interface MetadataSource {
    getMetaData(): Promise<Record<string, string>>;
}

/** Only what this module needs from the logger, for the same reason. */
export interface MetadataLogger {
    info(content: unknown, msg?: string): void;
}

export interface MetadataStore {
    refresh(): Promise<void>;
    get(): MetaData;
}

const META_KEYS: (keyof MetaData)[] = ["assetVersion", "latestGamedataVersion", "latestLocalizationBundleVersion"];

/**
 * Holds game metadata in memory, refreshed from Comlink.
 *
 * Deliberately not persisted: every consumer reads the in-memory copy, and the data is refetched at
 * startup and hourly regardless, so a file on disk would only ever be written and never meaningfully
 * read.
 */
export function createMetadataStore(source: MetadataSource, log: MetadataLogger): MetadataStore {
    let current: MetaData | undefined;

    return {
        async refresh(): Promise<void> {
            const fetched = await source.getMetaData();
            const next = {} as MetaData;
            for (const key of META_KEYS) {
                next[key] = fetched[key];
            }

            if (current && current.assetVersion !== next.assetVersion) {
                log.info(`Asset version changed: ${current.assetVersion} -> ${next.assetVersion}`);
            }

            current = next;
        },

        get(): MetaData {
            if (!current) {
                throw new Error("Metadata has not been loaded yet; call refresh() before get()");
            }
            return current;
        },
    };
}
