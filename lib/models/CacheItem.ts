import type ResModel from "./ResModel.js";
import type ResCollection from "./ResCollection.js";
import type ResError from "./ResError.js";
import { CACHE_ITEM_UNSUBSCRIBE_DELAY, type ResourceType } from "../Constants.js";
import Properties from "../util/Properties.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class CacheItem<T extends ResModel | ResCollection | ResError = ResModel | ResCollection | ResError> {
    private _unsubscribe: (ci: T) => void;
    private _unsubscribeTimeout: NodeJS.Timeout | null;
    direct = 0;
    indirect = 0;
    item: T;
    promise: Promise<any> | null = null;
    rid: string;
    subscribed = 0;
    type: ResourceType | null = null;
    constructor(rid: string, unsubscribe: (ci: CacheItem<T>) => void) {
        Properties.of(this)
            .writableBulk("promise", ["_unsubscribe", unsubscribe], "_unsubscribeTimeout")
            .readOnly("rid", rid);
    }

    private _checkUnsubscribe() {
        if (!this.subscribed || this.direct || this._unsubscribeTimeout) {
            return;
        }

        this._unsubscribeTimeout = setTimeout(() => this._unsubscribe(this as unknown as T), CACHE_ITEM_UNSUBSCRIBE_DELAY);
    }

    addDirect() {
        if (this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
        }
        this.direct++;
    }

    addIndirect(val = 1) {
        this.indirect += val;
        if (this.indirect < 0) {
            throw new Error("Indirect count reached below 0");
        }
    }

    addSubscribed(dir: number) {
        this.subscribed += dir === 0 ? -this.subscribed : dir;
        if (!this.subscribed && this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
        }
    }

    removeDirect() {
        this.direct--;
        if (this.direct < 0) {
            throw new Error("Direct count reached below 0");
        }
        if (this.subscribed) {
            this._checkUnsubscribe();
        } else {
            // The subscription might be stale and should then be removed directly
            this._unsubscribe(this as unknown as T);
        }
    }

    resetTimeout() {
        if (this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
            this._checkUnsubscribe();
        }
    }

    setItem(item: T, type: ResourceType) {
        this.item = item;
        this.type = type ;
        this.promise = null;
        this._checkUnsubscribe();
        return this;
    }

    setPromise(promise: Promise<any>) {
        if (!this.item) {
            this.promise = promise;
        }
        return promise;
    }

    setType(modelType: ResourceType) {
        this.type = modelType;
        return this;
    }
}
