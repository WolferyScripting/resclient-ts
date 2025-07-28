/* eslint-disable @typescript-eslint/ban-types, @typescript-eslint/unbound-method */
import type ResClient from "./ResClient.js";
import { copy, equal, update, type PropertyDefinition } from "../includes/utils/obj.js";
import Properties from "../util/Properties.js";

export interface ResModelOptions {
    definition?: Record<string, PropertyDefinition>;
}
export default class ResModel {
    protected _definition?: Record<string, PropertyDefinition>;
    protected _props!: Record<string, unknown>;
    protected api!: ResClient;
    rid!: string;
    constructor(api: ResClient, rid: string, options?: ResModelOptions) {
        update(this, options ?? {}, {
            definition: { type: "?object", property: "_definition" }
        });
        Properties.of(this)
            .writable("_definition")
            .readOnly("_props", {})
            .readOnly("api", api)
            .define("rid", false, true, true, rid);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected _shouldPromoteKey(key: string, value: unknown) {
        return true;
    }

    auth(method: string, params: unknown) {
        return this.api.authenticate(this.rid, method, params);
    }

    call<T = unknown>(method: string, params?: unknown) {
        return this.api.call<T>(this.rid, method, params);
    }

    getClient() {
        return this.api;
    }

    init(data?: Record<string, unknown>) {
        if (data) {
            this.update(data);
        }

        return this;
    }

    off(events: string | Array<string> | null, handler: Function) {
        this.api.resourceOff(this.rid, events, handler);
        return this;
    }

    on(events: string | Array<string> | null, handler: Function) {
        this.api.resourceOn(this.rid, events, handler);
        return this;
    }

    setModel(props: Record<string, unknown>) {
        return this.api.setModel(this.rid, props);
    }

    toJSON() {
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

    update(props: Record<string, unknown>, reset = false) {
        if (!props) {
            return null;
        }

        let changed: Record<string, unknown> | null = null, v: unknown, promote: boolean;
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
                if ((Object.hasOwn(this, key) || !(this as Record<string, unknown>)[key]) && key[0] !== "_" && Object.getOwnPropertyDescriptor(this, key)?.writable !== false) {
                    v = p[key];
                    if (v === undefined) {
                        delete (this as Record<string, unknown>)[key];
                    } else {
                        (this as Record<string, unknown>)[key] = v;
                    }
                }
            }
        } else {
            // eslint-disable-next-line guard-for-in
            for (const key in props) {
                v = props[key];
                promote = (Object.hasOwn(this, key) || !(this as Record<string, unknown>)[key]) && key[0] !== "_" && Object.getOwnPropertyDescriptor(this, key)?.writable !== false && this._shouldPromoteKey(key, v);
                if (!equal(p[key], v)) {
                    changed = changed || {};
                    changed[key] = p[key];
                    if (v === undefined) {
                        delete p[key];
                        if (promote) {
                            delete (this as Record<string, unknown>)[key];
                        }
                    } else {
                        p[key] = v;
                        if (promote) {
                            (this as Record<string, unknown>)[key] = v;
                        }
                    }
                }
            }
        }

        return changed;
    }
}
