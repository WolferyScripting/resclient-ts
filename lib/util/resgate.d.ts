// copy to dist
import type { States, ACTION_DELETE } from "../Constants.js";
import type CacheItem from "../models/CacheItem.js";

export interface RIDRef {
    rid: string;
}

export interface Shared {
    collections?: Record<string, Array<RIDRef>>;
    errors?: Record<string, Partial<ErrorData>>;
    models?: Record<string, Record<string,unknown> & { id: string; }>;
}

export interface ChangeEventData extends Shared {
    values: Record<string, string | typeof ACTION_DELETE>;
}

export interface AddEventData extends Shared {
    idx: number;
    value: RIDRef;
}

export interface RemoveEventData {
    idx: number;
}

export interface UnsubscribeEventData {
    reason: ErrorData;
}

export interface ErrorData {
    code: string;
    message: string;
}

export interface Ref {
    ci: CacheItem;
    rc: number;
    st: States;
}

export type Refs = Exclude<Shared[keyof Shared], undefined>;
