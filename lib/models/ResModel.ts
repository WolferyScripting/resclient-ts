import type ResClient from "./ResClient.js";
import type CacheItem from "./CacheItem.js";
import { copy, equal, update, type PropertyDefinition } from "../includes/utils/obj.js";
import Properties from "../util/Properties.js";
import type { AnyFunction, AnyObject } from "../util/types.js";

export interface ResModelOptions {
    definition?: Record<string, PropertyDefinition>;
}
export default class ResModel {
    protected _definition?: Record<string, PropertyDefinition>;
    protected _props!: AnyObject;
    protected api!: ResClient;
    rid!: string;
    constructor(api: ResClient, rid: string, options?: ResModelOptions) {
        update(this, options ?? {}, {
            definition: { type: "?object", property: "_definition" }
        });
        this.p
            .writable("_definition")
            .readOnly("_props", {})
            .readOnly("api", api)
            .define("rid", false, true, true, rid);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected _shouldPromoteKey(key: string, value: unknown): boolean {
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async listen(on: boolean): Promise<void> {
        // empty
    }

    protected get cacheItem(): CacheItem<ResModel> {
        return this.getClient().cache[this.rid] as CacheItem<ResModel>;
    }

    protected get p(): Properties {
        return Properties.of(this);
    }

    get props(): AnyObject {
        return this._props;
    }

    auth<T = unknown>(method: string, params: unknown): Promise<T> {
        return this.api.authenticate<T>(this.rid, method, params);
    }

    call<T = unknown>(method: string, params?: unknown): Promise<T> {
        return this.api.call<T>(this.rid, method, params);
    }

    /** Called when the model is unsubscribed. */
    async dispose(): Promise<void> {
        await this.listen(false);
    }

    getClient(): ResClient {
        return this.api;
    }

    async init(data?: AnyObject): Promise<this> {
        if (data) {
            this.update(data);
        }

        await this.listen(true);
        return this;
    }

    /** Prevent this model from being unsubscribed. */
    keep(): void {
        this.cacheItem.keep();
    }

    off(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.off(this, events, handler);
        return this;
    }

    on(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.on(this, events, handler);
        return this;
    }

    resourceOff(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.resourceOff(this.rid, events, handler);
        return this;
    }

    resourceOn(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.resourceOn(this.rid, events, handler);
        return this;
    }

    // TODO: needs better typing
    setModel(props: AnyObject): Promise<unknown> {
        return this.api.setModel(this.rid, props);
    }

    toJSON(): AnyObject {
        const o = this._definition
            ? copy(this._props, this._definition)
            : ({ ...this._props });
        // eslint-disable-next-line guard-for-in
        for (const k in o) {
            const v = o[k];
            if (typeof v === "object" && v !== null && "toJSON" in v) {
                o[k] = (v as { toJSON(): object; }).toJSON();
            }
        }
        return o;
    }

    /** Undo preventing this model from being unsubscribed. */
    unkeep(): void {
        this.cacheItem.unkeep();
    }

    update(props: AnyObject, reset = false): AnyObject | null {
        if (!props) {
            return null;
        }

        let changed: AnyObject | null = null, v: unknown, promote: boolean;
        const p = this._props;


        if (reset) {
            props = { ...props };
            for (const k in p) {
                if (!Object.hasOwn(props, k)) {
                    props[k] = undefined;
                }
            }
        }

        if (this._definition) {
            changed = update(p, props, this._definition);
            for (const key in changed) {
                if ((Object.hasOwn(this, key) || !(this as AnyObject)[key]) && key[0] !== "_" && Object.getOwnPropertyDescriptor(this, key)?.writable !== false) {
                    v = p[key];
                    if (v === undefined) {
                        delete (this as AnyObject)[key];
                    } else {
                        (this as AnyObject)[key] = v;
                    }
                }
            }
        } else {
            // eslint-disable-next-line guard-for-in
            for (const key in props) {
                v = props[key];
                promote = (Object.hasOwn(this, key) || !(this as AnyObject)[key]) && key[0] !== "_" && Object.getOwnPropertyDescriptor(this, key)?.writable !== false && this._shouldPromoteKey(key, v);
                if (!equal(p[key], v)) {
                    changed = changed || {};
                    changed[key] = p[key];
                    if (v === undefined) {
                        delete p[key];
                        if (promote) {
                            delete (this as AnyObject)[key];
                        }
                    } else {
                        p[key] = v;
                        if (promote) {
                            (this as AnyObject)[key] = v;
                        }
                    }
                }
            }
        }

        return changed;
    }
}
