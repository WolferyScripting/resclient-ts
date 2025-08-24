import type { States, ACTION_DELETE } from "../Constants.js";
import type CacheItem from "../models/CacheItem.js";
import type ResCollection from "../models/ResCollection.js";
import type ResError from "../models/ResError.js";
import type ResModel from "../models/ResModel.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: Array<any>) => any;
export type AnyObject<T = unknown> = Record<string, T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClass<T = unknown> = new (...args: Array<any>) => T;

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

export type AnyRes = ResModel | ResCollection | ResError;
