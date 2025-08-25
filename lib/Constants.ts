export const CACHE_ITEM_UNSUBSCRIBE_DELAY = 5000;
export const ACTION_DELETE = {
    action: "delete"
} as const;

export const MODEL_TYPE = "model" as const;
export const ERROR_TYPE = "error" as const;
export const COLLECTION_TYPE = "collection" as const;

// the order matters here, this is the order in which resources will be
// created, initialized, and then syncronized in
// for ids to work in collections, models MUST be before collections
export const RESOURCE_TYPES = [MODEL_TYPE, ERROR_TYPE, COLLECTION_TYPE] as const;
export type ResourceType = typeof RESOURCE_TYPES[number];

export const RECONNECT_DELAY = 3000;
export const SUBSCRIBE_STALE_DELAY = 2000;

export enum States {
    NONE = 0,
    DELETE = 1,
    KEEP = 2,
    STALE = 3,
}

export enum ErrorCodes {
    // System
    INVALID_REQUEST = "system.invalidRequest",
    CONNECTION_ERROR = "system.connectionError",
    DISCONNECT = "system.disconnect",
    UNKNOWN = "system.unknownError",

    // Common
    TOO_ACTIVE = "common.tooActive",
}
