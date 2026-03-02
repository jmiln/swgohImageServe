declare module "@swgoh-utils/comlink" {
    interface ComlinkConfig {
        url: string;
        accessKey: string;
        secretKey: string;
    }

    interface MetaData {
        assetVersion: string;
        latestGamedataVersion: string;
        latestLocalizationBundleVersion: string;
        [key: string]: string;
    }

    export default class ComlinkStub {
        constructor(config: ComlinkConfig);
        getMetaData(): Promise<MetaData>;
    }
}
