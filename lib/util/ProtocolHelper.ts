export function versionToInt(version: string): number {
    if (!version) {
        return 0;
    }
    const p = version.split(".");
    let v = 0;
    for (let i = 0; i < 3; i++) {
        v = v * 1000 + Number(p[i]);
    }
    return v;
}

export default class ProtocolHelper {
    static CLIENT_SUPPORTED = "1.2.1";
    static CURRENT = "1.2.3";
    static LEGACY = "1.1.1";
    static SERVER_SUPPORTED = "1.2.1";
    static UNSUBSCRIBE_COUNT = "1.2.1";
    client: string;
    server: string;
    constructor() {
        this.client = ProtocolHelper.CURRENT;
        this.server = ProtocolHelper.LEGACY;
    }

    get clientSupported(): boolean {
        return versionToInt(this.client) >= versionToInt(ProtocolHelper.CLIENT_SUPPORTED);
    }

    get serverSupported(): boolean {
        return versionToInt(this.server) >= versionToInt(ProtocolHelper.SERVER_SUPPORTED);
    }

    get unsubscribeCountSupported(): boolean {
        return versionToInt(this.server) >= versionToInt(ProtocolHelper.UNSUBSCRIBE_COUNT);
    }

    setClient(protocol: string): void {
        this.client = protocol;
    }

    setServer(protocol: string): void {
        this.server = protocol;
    }
}
