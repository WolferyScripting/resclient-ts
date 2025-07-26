export function versionToInt(version: string) {
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

export const SUPPORTED_PROTOCOL = "1.2.1";
export const LEGACY_PROTOCOL = versionToInt("1.1.1");
export const CURRENT_PROTOCOL = versionToInt("1.2.1");

export const CACHE_ITEM_UNSUBSCRIBE_DELAY = 5000;
export const ACTION_DELETE = {
    action: "delete"
} as const;

export const COLLECTION_TYPE = "collection";
export const ERROR_TYPE = "error";
export const MODEL_TYPE = "model";
export const RESOURCE_TYPES = [COLLECTION_TYPE, ERROR_TYPE, MODEL_TYPE] as const;
export type ResourceType = typeof RESOURCE_TYPES[number];

export const RECONNECT_DELAY = 3000;
export const SUBSCRIBE_STALE_DELAY = 2000;

export enum States {
    NONE = 0,
    DELETE = 1,
    KEEP = 2,
    STALE = 3
}

export enum SystemErrorCodes {
    // System
    INVALID_REQUEST = "system.invalidRequest",
    CONNECTION_ERROR = "system.connectionError",
    DISCONNECT = "system.disconnect",
}
