import type ResClient from "./ResClient.js";
import { CACHE_ITEM_UNSUBSCRIBE_DELAY, type ResourceType } from "../Constants.js";
import Properties from "../util/Properties.js";
import { type AnyRes } from "../util/types.js";

export interface CacheItemOptions<T extends AnyRes = AnyRes> {
    forceKeep?: boolean;
    onKeep?(ci: CacheItem<T>): void;
    onUnkeep?(ci: CacheItem<T>): void;
    unsubscribe(ci: CacheItem<T>): void;
}

export default class CacheItem<T extends AnyRes = AnyRes> {
    private _onKeep?: (ci: CacheItem<T>) => void;
    private _onUnkeep?: (ci: CacheItem<T>) => void;
    private _unsubscribe!: (ci: CacheItem<T>) => void;
    private _unsubscribeTimeout!: NodeJS.Timeout | null;
    direct = 0;
    forceKeep!: boolean;
    indirect = 0;
    item!: T;
    promise: Promise<unknown> | null = null;
    rid!: string;
    subscribed = 0;
    type: ResourceType | null = null;
    constructor(rid: string, options: CacheItemOptions<T>) {
        Properties.of(this)
            // eslint-disable-next-line @typescript-eslint/unbound-method -- methods should be bound when given
            .writableBulk("promise", ["_unsubscribe", options.unsubscribe], "_unsubscribeTimeout", ["forceKeep", options.forceKeep ?? false], ["_onKeep", options.onKeep], ["_onUnkeep", options.onUnkeep])
            .readOnly("rid", rid);
    }

    static createDefault<T extends AnyRes = AnyRes>(rid: string, client: ResClient): CacheItem<T> {
        return new CacheItem(rid, {
            onKeep:      (item): void => client.keepCached(item, true),
            onUnkeep:    (item): void => client.unkeepCached(item, true),
            unsubscribe: client["unsubscribe"]
        }) as never;
    }

    private _checkUnsubscribe(): void {
        if (!this.subscribed || this.direct || this._unsubscribeTimeout || this.forceKeep) {
            return;
        }

        this._unsubscribeTimeout = setTimeout(() => this._unsubscribe(this), CACHE_ITEM_UNSUBSCRIBE_DELAY);
    }

    addDirect(): void {
        if (this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
        }
        this.direct++;
    }

    addIndirect(val = 1): void {
        this.indirect += val;
        if (this.indirect < 0) {
            throw new Error("Indirect count reached below 0");
        }
    }

    addSubscribed(dir: number): void {
        this.subscribed += dir === 0 ? -this.subscribed : dir;
        if (!this.subscribed && this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
        }
    }

    keep(): this {
        if (this.forceKeep) return this;
        this._onKeep?.(this);
        this.forceKeep = true;
        this.resetTimeout();
        return this;
    }

    removeDirect(): void {
        this.direct--;
        if (this.direct < 0) {
            throw new Error("Direct count reached below 0");
        }
        if (this.subscribed) {
            this._checkUnsubscribe();
        } else {
            // The subscription might be stale and should then be removed directly
            this._unsubscribe(this);
        }
    }

    resetTimeout(): void {
        if (this._unsubscribeTimeout) {
            clearTimeout(this._unsubscribeTimeout);
            this._unsubscribeTimeout = null;
            this._checkUnsubscribe();
        }
    }

    setItem(item: T, type: ResourceType): this {
        this.item = item;
        this.type = type ;
        this.promise = null;
        this._checkUnsubscribe();
        return this;
    }

    setPromise<P extends Promise<unknown>>(promise: P): P {
        if (!this.item) {
            this.promise = promise;
        }
        return promise;
    }

    setType(modelType: ResourceType): this {
        this.type = modelType;
        return this;
    }

    unkeep(): this {
        if (!this.forceKeep) return this;
        this._onUnkeep?.(this);
        this.forceKeep = false;
        this.resetTimeout();
        return this;
    }
}
