import CacheItem from "./CacheItem.js";
import TypeList, { type ItemFactory } from "./TypeList.js";
import ResCollection from "./ResCollection.js";
import ResError from "./ResError.js";
import ResModel from "./ResModel.js";
import ResRef from "./ResRef.js";
import eventBus, { type EventBus } from "../includes/eventbus/index.js";
import {
    ACTION_DELETE,
    COLLECTION_TYPE,
    ERROR_TYPE,
    MODEL_TYPE,
    States,
    RESOURCE_TYPES,
    RECONNECT_DELAY,
    SUBSCRIBE_STALE_DELAY,
    ErrorCodes
} from "../Constants.js";
import type {
    AddEventData,
    RemoveEventData,
    ChangeEventData,
    ErrorData,
    Ref,
    Shared,
    RIDRef,
    Refs,
    AnyFunction,
    AnyObject,
    AnyRes,
    AnyClass
} from "../util/types.js";
import { Debug } from "../util/Debug.js";
import ensurePromiseReturn from "../util/ensurePromiseReturn.js";
import Properties from "../util/Properties.js";
import { lcsDiffAsync } from "../util/util.js";
import ProtocolHelper from "../util/ProtocolHelper.js";
import WebSocket, { type MessageEvent } from "ws";
import assert from "node:assert";

export type OnConnectFunction = (api: ResClient) => unknown;
export type OnConnectErrorFunction = (api: ResClient, err: unknown) => unknown;
export interface ClientOptions {
    defaultCollectionFactory?: ItemFactory<ResCollection>;
    defaultErrorFactory?: ItemFactory<ResError>;
    defaultModelFactory?: ItemFactory<ResModel>;
    eventBus?: EventBus;
    namespace?: string;
    onConnect?: OnConnectFunction;
    onConnectError?: OnConnectErrorFunction;
    protocol?: string;
    retryOnTooActive?: boolean;
}

export interface Request {
    method: string;
    params: unknown;
    reject(err: Error | ResError): void;
    resolve(value: unknown): void;
}

export function getRID(v: unknown): string | null {
    if (typeof v === "object" && v !== null && "getResourceID" in v && typeof v.getResourceID === "function") {
        return v.getResourceID() as string;
    }
    // checking for the rid property causes ResRef to be processed as a regular cacheItem in change events
    /* if ("rid" in v && typeof v.rid === "string") {
            return v.rid;
        } */

    return null;
}

export interface ResType<K extends string, T extends AnyRes = AnyRes, D = unknown> {
    id: K;
    list: TypeList<T>;
    getFactory(rid: string): ItemFactory<T>;
    prepareData(data: unknown): D;
    synchronize(cacheItem: CacheItem<T>, data: unknown): unknown;
}

export type AnyResType = ResClient["types"][keyof ResClient["types"]];
export default class ResClient {
    private onClose = this._onClose.bind(this);
    private onError = this._onError.bind(this);
    private onMessage = this._onMessage.bind(this);
    private onOpen = this._onOpen.bind(this);
    private unsubscribe = this._unsubscribe.bind(this);
    cache: Record<string, CacheItem> = {};
    connectCallback: { reject(err: ErrorData): void; resolve(): void; } | null = null;
    connectPromise: Promise<void> | null = null;
    connected = false;
    defaultCollectionFactory!: ItemFactory<ResCollection>;
    defaultErrorFactory!: ItemFactory<ResError>;
    defaultModelFactory!: ItemFactory<ResModel>;
    eventBus = eventBus;
    namespace = "resclient";
    onConnect: OnConnectFunction | null = null;
    onConnectError: OnConnectErrorFunction | null = null;
    protocol!: ProtocolHelper;
    requestID = 1;
    requests: Record<number, Request> = {};
    retryOnTooActive = false;
    stale: Record<string, boolean> | null = null;
    tryConnect = false;
    types = {
        collection: {
            id:          COLLECTION_TYPE,
            list:        new TypeList((api, rid, data) => this.defaultCollectionFactory(api, rid, data)),
            prepareData: (data: Array<unknown>): Array<unknown> => data.map(item => this._prepareValue(item as never, true)),
            getFactory(rid: string): ItemFactory<ResCollection> {
                return this.list.getFactory(rid);
            },
            synchronize: this._syncCollection.bind(this)
        } satisfies ResType<typeof COLLECTION_TYPE, ResCollection, Array<unknown>> as ResType<typeof COLLECTION_TYPE, ResCollection, Array<unknown>>,
        error: {
            id:          ERROR_TYPE,
            list:        new TypeList((api, rid, data) => this.defaultErrorFactory(api, rid, data)),
            prepareData: (data: unknown): unknown => data,
            getFactory(rid: string): ItemFactory<ResError> {
                return this.list.getFactory(rid);
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
            synchronize(cacheItem: CacheItem<ResError>, data: Array<RIDRef>): void {}
        } satisfies ResType<typeof ERROR_TYPE, ResError, unknown> as ResType<typeof ERROR_TYPE, ResError, unknown>,
        model: {
            id:          MODEL_TYPE,
            list:        new TypeList((api, rid, data) => this.defaultModelFactory(api, rid, data)),
            prepareData: (data: AnyObject): AnyObject => {
                const obj = {} as AnyObject;
                // eslint-disable-next-line guard-for-in
                for (const key of Object.keys(data)) {
                    obj[key] = this._prepareValue(data[key] as never, true);
                }
                return obj;
            },
            getFactory(rid: string): ItemFactory<ResModel> {
                return this.list.getFactory(rid);
            },
            synchronize: this._syncModel.bind(this)
        } satisfies ResType<typeof MODEL_TYPE, ResModel, AnyObject> as ResType<typeof MODEL_TYPE, ResModel, AnyObject>
    };
    ws: WebSocket | null = null;
    wsFactory!: (() => WebSocket);
    constructor(hostUrlOrFactory: string | (() => WebSocket), options: ClientOptions = {}) {
        this.eventBus = options.eventBus || this.eventBus;
        if (options.eventBus !== undefined) {
            this.eventBus = options.eventBus;
        }

        if (options.namespace !== undefined) {
            this.namespace = options.namespace;
        }

        if (options.onConnect !== undefined) {
            this.onConnect = options.onConnect;
        }

        if (options.onConnectError !== undefined) {
            this.onConnectError = options.onConnectError;
        }

        if (options.retryOnTooActive !== undefined) {
            this.retryOnTooActive = options.retryOnTooActive;
        }

        this.defaultCollectionFactory = options.defaultCollectionFactory ?? ((api: ResClient, rid: string): ResCollection => new ResCollection(api, rid));
        this.defaultErrorFactory = options.defaultErrorFactory ?? ((api: ResClient, rid: string): ResError => new ResError(api, rid));
        this.defaultModelFactory = options.defaultModelFactory ?? ((api: ResClient, rid: string): ResModel => new ResModel(api, rid));
        this.wsFactory = typeof hostUrlOrFactory === "string" ? (): WebSocket => new WebSocket(hostUrlOrFactory) : hostUrlOrFactory;
        this.protocol = new ProtocolHelper();
        if (options.protocol) this.protocol.setClient(options.protocol);

        if (!this.protocol.clientSupported) {
            throw new Error(`Unsupported client protocol version: ${this.protocol.client}`);
        }

        Properties.of(this)
            .readOnlyBulk("cache", "eventBus", "onClose", "onError", "onMessage", "onOpen", "requests", "types", "unsubscribe", "wsFactory", "protocol")
            .writableBulk("connectCallback", "connected", "connectPromise", "namespace", "onConnect", "onConnectError", "requestID", "stale", "tryConnect", "ws");
    }

    private _addStale(rid: string): void {
        if (!this.stale) {
            this.stale = {};
        }
        this.stale[rid] = true;
    }

    private async _cacheResources(r: Shared): Promise<void> {
        if (!r || !(r.models || r.collections || r.errors)) {
            return;
        }

        const sync = {} as Record<typeof RESOURCE_TYPES[number], Record<string, Ref>>;
        const rr =  (t: typeof RESOURCE_TYPES[number]): Refs => ({ collection: r.collections, model: r.models, error: r.errors }[t]!);
        // eslint-disable-next-line unicorn/no-array-for-each
        RESOURCE_TYPES.forEach(t => (sync[t] = this._createItems(rr(t), this.types[t])! as never));
        // must be initialized in specific order
        for (const type of RESOURCE_TYPES) await this._initItems(rr(type), this.types[type]);
        for (const type of RESOURCE_TYPES) await this._listenItems(rr(type));
        for (const type of RESOURCE_TYPES) await this._syncItems(sync[type], this.types[type]);

    }

    private async _call<T = unknown>(type: string, rid: string, method?: string, params?: unknown): Promise<T> {
        return this._send<{ payload: T; rid?: string; }>(type, rid, method || "", params)
            .then(async result => {
                if (result.rid) {
                    await this._cacheResources(result as never);
                    const ci = this.cache[result.rid];
                    assert(ci, `Missing CacheItem (rid: ${result.rid})`);
                    ci.addSubscribed(1);
                    return ci.item as T;
                }
                return result.payload;
            });
    }

    private _connectReject(e: ErrorData & { data?: unknown; }): void {
        this.connectPromise = null;
        this.ws = null;

        if (this.connectCallback) {
            this.connectCallback.reject(e);
            this.connectCallback = null;
        }
    }

    private _connectResolve(): void {
        if (this.connectCallback) {
            this.connectCallback.resolve();
            this.connectCallback = null;
        }
    }

    private _createItems(refs: Refs, type: AnyResType): AnyObject | undefined {
        if (!refs) {
            return;
        }

        let sync: AnyObject | undefined;
        for (const rid of Object.keys(refs)) {
            let ci = this.cache[rid];
            if (ci) {
                // Remove item as stale if needed
                this._removeStale(rid);
            } else {
                ci = this.cache[rid] = CacheItem.createDefault(rid, this);
            }
            // If an item is already set,
            // it has gone stale and needs to be synchronized.
            if (ci.item) {
                if (ci.type === type.id) {
                    sync = sync || {};
                    sync[rid] = refs[rid];
                } else {
                    Debug("warn", "Resource type inconsistency", rid, ci.type, type.id);
                }
                delete refs[rid];
            } else {
                const f = type.getFactory(rid);
                ci.setItem(f(this, rid, refs[rid] as never), type.id);
            }
        }

        return sync;
    }

    private _deleteRef(ci: CacheItem<AnyRes>): void {
        const item = ci.item;
        let ri: CacheItem | null = null;
        switch (ci.type) {
            case COLLECTION_TYPE: {
                for (const v of item as ResCollection) {
                    ri = this._getRefItem(v);
                    if (ri) {
                        ri.addIndirect(-1);
                    }
                }
                break;
            }
            case MODEL_TYPE: {
                for (const k in item) {
                    if (Object.hasOwn(item, k)) {
                        ri = this._getRefItem(item[k as never]);
                        if (ri) {
                            ri.addIndirect(-1);
                        }
                    }
                }
                break;
            }
        }

        delete this.cache[ci.rid];
        this._removeStale(ci.rid);
    }

    private _emit(event: string, data: unknown): void {
        this.eventBus.emit(this, event, data, this.namespace);
    }

    private _getRefItem(v: unknown): CacheItem | null {
        const rid = getRID(v);
        if (!rid) {
            return null;
        }
        const refItem = this.cache[rid];
        // refItem not in cache means
        // item has been deleted as part of
        // a refState object.
        if (!refItem) {
            return null;
        }
        return refItem;
    }

    private _getRefState(ci: CacheItem): AnyObject<Ref> {
        const refs = {} as AnyObject<Ref>;
        // Quick exit
        if (ci.subscribed) {
            return refs;
        }
        refs[ci.rid] = { ci, rc: ci.indirect, st: States.NONE };
        this._traverse(ci, this._seekRefs.bind(this, refs), 0, true);
        this._traverse(ci, this._markDelete.bind(this, refs) as never, States.DELETE);
        return refs;
    }

    private async _handleAddEvent(ci: CacheItem<ResCollection>, event: string, data: AddEventData): Promise<boolean> {
        if (ci.type !== COLLECTION_TYPE) {
            return false;
        }

        await this._cacheResources(data);
        const v = this._prepareValue(data.value, true);
        const idx = data.idx;

        ci.item.add(v, idx);
        this.eventBus.emit(ci.item, `${this.namespace}.resource.${ci.rid}.${event}`, { item: v, idx });
        return true;
    }

    private async _handleChangeEvent(cacheItem: CacheItem<ResModel>, event: string, data: ChangeEventData, reset: boolean): Promise<boolean> {
        if (cacheItem.type !== MODEL_TYPE) {
            return false;
        }

        await this._cacheResources(data);

        const item = cacheItem.item;
        let rid;
        const vals = data.values;
        for (const key of Object.keys(vals)) {
            vals[key] = this._prepareValue(vals[key]!) as string;
        }

        // Update the model with new values
        const changed = item.update(vals, reset);
        if (!changed) {
            return false;
        }

        // Used changed object to determine which resource references has been
        // added or removed.
        const ind: Record<string, number> = {};
        for (const key of Object.keys(changed)) {
            if ((rid = getRID(changed[key]))) {
                ind[rid] = (ind[rid] || 0) - 1;
            }
            if ((rid = getRID(vals[key]))) {
                ind[rid] = (ind[rid] || 0) + 1;
            }
        }

        // Remove indirect reference to resources no longer referenced in the model
        for (const [key, value] of Object.entries(ind)) {
            const ci = this.cache[key];
            assert(ci, `Missing CacheItem (rid: ${key})`);
            ci.addIndirect(value);
            if (value > 0) {
                this._tryDelete(ci);
            }
        }

        this.eventBus.emit(cacheItem.item, `${this.namespace}.resource.${cacheItem.rid}.${event}`, changed);
        return true;
    }

    private async _handleErrorResponse(req: Request, data: unknown): Promise<void> {
        const m = req.method;
        // Extract the rid if possible
        let rid = "";
        let i = m.indexOf(".");
        if (i >= 0) {
            rid = m.slice(i + 1);
            const a = m.slice(0, Math.max(0, i));
            if (a === "call" || a === "auth") {
                i = rid.lastIndexOf(".");
                if (i >= 0) {
                    rid = rid.slice(0, Math.max(0, i));
                }
            }
        }
        const errorData = (data as Record<"error", ErrorData & { data?: unknown; }>).error;
        if (this.retryOnTooActive && "code" in errorData && errorData.code === ErrorCodes.TOO_ACTIVE) {
            const seconds = (Number((errorData.data as { seconds: number; } | undefined)?.seconds) || 0) + 1;
            Debug("tooActive", `Got ${ErrorCodes.TOO_ACTIVE}, waiting ${seconds} second${seconds === 1 ? "" : "s"} to retry ${req.method}`);
            await new Promise(resolve => setTimeout(resolve, seconds * 1000)); // can't import timers/promises due to other non-async usages
            const r = await this._sendNow(req.method, req.params);
            req.resolve(r);
            return;
        } else {
            const err = await (new ResError(this, rid.trim(), m, req.params)).init(errorData);
            try {
                this._emit("error", err);
            } catch {}

            // Execute error callback bound to calling object
            req.reject(err);
        }
    }

    private async _handleEvent(data: { data: unknown; event: string; }): Promise<void> {
        // Event
        const index = data.event.lastIndexOf(".");
        if (index === -1 || index === data.event.length - 1) {
            throw new Error(`Malformed event name: ${data.event}`);
        }

        const rid = data.event.slice(0, Math.max(0, index));

        const cacheItem = this.cache[rid];
        if (!cacheItem?.item) {
            throw new Error("Resource not found in cache");
        }

        const event = data.event.slice(index + 1);
        let handled = false;
        switch (event) {
            case "change": {
                handled = await this._handleChangeEvent(cacheItem as CacheItem<ResModel>, event, data.data as ChangeEventData, false);
                break;
            }

            case "add": {
                handled = await this._handleAddEvent(cacheItem as CacheItem<ResCollection>, event, data.data as AddEventData);
                break;
            }

            case "remove": {
                handled = await this._handleRemoveEvent(cacheItem as CacheItem<ResCollection>, event, data.data as RemoveEventData);
                break;
            }

            case "unsubscribe": {
                handled = await this._handleUnsubscribeEvent(cacheItem);
                break;
            }
        }

        if (!handled) {
            this.eventBus.emit(cacheItem.item, `${this.namespace}.resource.${rid}.${event}`, data.data);
        }
    }

    private _handleFailedSubscribe(ci: CacheItem): void {
        ci.addSubscribed(-1);
        this._tryDelete(ci);
    }

    private async _handleRemoveEvent(ci: CacheItem<ResCollection>, event: string, data: RemoveEventData): Promise<boolean> {
        if (ci.type !== COLLECTION_TYPE) {
            return false;
        }

        const idx = data.idx;
        const item = ci.item.remove(idx);
        this.eventBus.emit(ci.item, `${this.namespace}.resource.${ci.rid}.${event}`, { item, idx });

        const rid = getRID(item);
        if (rid) {
            const refItem = this.cache[rid];
            if (!refItem) {
                throw new Error("Removed model is not in cache");
            }

            refItem.addIndirect(-1);
            this._tryDelete(refItem);
        }
        return true;
    }

    private async _handleSuccessResponse(req: Request, data: unknown): Promise<void> {
        req.resolve((data as Record<"result", unknown>).result);
    }

    private async _handleUnsubscribeEvent(ci: CacheItem): Promise<boolean> {
        await ci.item.dispose();
        ci.addSubscribed(0);
        this._tryDelete(ci);
        this.eventBus.emit(ci.item, `${this.namespace}.resource.${ci.rid}.unsubscribe`, { item: ci.item });
        return true;
    }

    private async _initItems(refs: Refs, type: AnyResType): Promise<void> {
        if (!refs) {
            return;
        }

        const promises: Array<Promise<AnyRes>> = [];
        for (const rid of Object.keys(refs)) {
            const cacheItem = this.cache[rid];
            assert(cacheItem, `Missing CacheItem (rid: ${rid})`);
            promises.push(cacheItem.item.init(type.prepareData(refs[rid] as never) as never));
        }
        await Promise.all(promises);
    }

    private async _listenItems(refs: Refs): Promise<void> {
        if (!refs) {
            return;
        }

        const promises: Array<Promise<void>> = [];
        for (const rid of Object.keys(refs)) {
            const cacheItem = this.cache[rid];
            assert(cacheItem, `Missing CacheItem (rid: ${rid})`);
            promises.push((cacheItem.item as unknown as { _listen(on: boolean): Promise<void>; })._listen(true));
        }
        await Promise.all(promises);
    }

    // @FIXME: this is a mess
    private _markDelete(refs: Record<string, Ref>, ci: CacheItem, state: unknown): unknown {
        // Quick exit if it is already subscribed
        if (ci.subscribed) {
            return false;
        }

        const rid = ci.rid;
        const r = refs[rid]!;

        if (r.st === States.KEEP) {
            return false;
        }

        if (state === States.DELETE) {

            if (r.rc > 0) {
                r.st = States.KEEP;
                return rid;
            }

            if (r.st !== States.NONE) {
                return false;
            }

            if (r.ci.direct) {
                r.st = States.STALE;
                return rid;
            }

            r.st = States.DELETE;
            return States.DELETE;
        }

        // A stale item can never cover itself
        if (rid === state) {
            return false;
        }

        r.st = States.KEEP;
        return r.rc > 0 ? rid : state;
    }

    private async _onClose(e: unknown): Promise<void> {
        if (typeof e === "object" && e !== null) {
            if ("message" in e) {
                Debug("ws", "ResClient close", ...[e.message, (e as { code?: string; }).code].filter(Boolean));
            } else if ("code" in e) {
                Debug("ws", "ResClient close", e.code);
            } else {
                Debug("ws", "ResClient close", e);
            }
        }
        this.connectPromise = null;
        this.ws = null;
        const wasConnected = this.connected;
        if (this.connected) {
            this.connected = false;

            // Set any subscribed item in cache to stale
            for (const rid of Object.keys(this.cache)) {
                const ci = this.cache[rid];
                assert(ci, `Missing CacheItem (rid: ${rid})`);
                if (ci.subscribed) {
                    ci.addSubscribed(0);
                    this._addStale(rid);
                    this._tryDelete(ci);
                }
            }

            this._emit("disconnect", e);
        }

        let hasStale = false;

        if (Object.keys(this.cache).length !== 0) {
            hasStale = true;
        }

        this.tryConnect = hasStale && this.tryConnect;

        if (this.tryConnect) {
            await this._reconnect(wasConnected);
        }
    }

    private async _onError(e: unknown): Promise<void> {
        Debug("ws", "ResClient error", e);
        this._connectReject({ code: ErrorCodes.CONNECTION_ERROR, message: "Connection error", data: e });
    }

    private async _onMessage(e: MessageEvent): Promise<void> {
        await this._receive((e as { data: string; }).data);
    }

    private async _onOpen(e: unknown): Promise<void> {
        Debug("ws", "ResClient open");
        let onConnectError: unknown = null;
        await this._sendNow<{ protocol: string; }>("version", { protocol: this.protocol.client })
            .then(ver => {
                if (ver.protocol) this.protocol.setServer(ver.protocol);
            })
            .then(async() => {
                if (!this.protocol.serverSupported) {
                    throw new Error(`Unsupported server protocol version: ${this.protocol.server}`);
                }
                if (this.onConnect) {
                    this.connected = true;
                    await ensurePromiseReturn(this.onConnect, null, this)
                        .catch(async(err: unknown) => {
                            if (this.onConnectError === null) {
                                onConnectError = err;
                            } else {
                                await ensurePromiseReturn(this.onConnectError, null, this, err)
                                    .then(() => {
                                        onConnectError = null;
                                    })
                                    .catch((onerr: unknown) => {
                                        onConnectError = onerr;
                                    });
                            }
                        });
                    this.connected = false;
                }
            })
            .then(async() => {
                this.connected = true;
                await this._subscribeToAllStale();
                this._emit("connect", e);
                this._connectResolve();
            })
            .catch(() => this.ws?.close())
            .then(() => {
                if (onConnectError !== null) {
                    throw onConnectError;
                }
            });
    }

    private async _patchDiff<T>(a: Array<T>, b: Array<T>, onKeep: (item: T, aIndex: number, bIndex: number, idx: number) => Promise<unknown>, onAdd: (item: T, aIndex: number, bIndex: number) => Promise<unknown>, onRemove: (item: T, aIndex: number, idx: number) => Promise<unknown>): Promise<void> {
        return lcsDiffAsync<T>(a, b, onKeep, onAdd, onRemove);
    }

    private _prepareValue(v: { action?: string; data?: unknown; rid?: string; soft?: boolean; } | string, addIndirect = false): unknown {
        let val: unknown = v;
        if (v !== null && typeof v === "object") {
            if (v.rid) {
                // Resource reference
                if (v.soft) {
                    // Soft reference
                    val = new ResRef(this, v.rid);
                } else {
                    // Non-soft reference
                    const ci = this.cache[v.rid];
                    assert(ci, `Missing CacheItem (rid: ${v.rid})`);
                    if (addIndirect) {
                        ci.addIndirect();
                    }
                    val = ci.item;
                }
            } else if (Object.hasOwn(v, "data")) {
                // Data value
                val = v.data;
            } else if (v.action === "delete") {
                val = undefined;
            } else {
                throw new Error("Invalid value: " + JSON.stringify(val));
            }
        }

        return val;
    }

    private async _receive(json: string): Promise<void> {
        const data = JSON.parse(json.trim()) as AnyObject;
        Debug("ws:receive", "<-", data);

        if (Object.hasOwn(data, "id")) {
            const id = data.id as number;

            // Find the stored request
            const req = this.requests[id];
            if (!req) {
                throw new Error("Server response without matching request");
            }

            delete this.requests[id];

            if (Object.hasOwn(data, "error")) {
                await this._handleErrorResponse(req, data);
            } else {
                await this._handleSuccessResponse(req, data);
            }
        } else if (Object.hasOwn(data, "event")) {
            await this._handleEvent(data as never);
        } else {
            throw new Error("Invalid message from server: " + json);
        }
    }

    private async _reconnect(noDelay = false): Promise<void> {
        if (noDelay) {
            await this.connect();
            return;
        }
        setTimeout(async() => {
            if (!this.tryConnect) {
                return;
            }

            await this.connect();
        }, RECONNECT_DELAY);
    }

    private _removeStale(rid: string): void {
        if (this.stale) {
            delete this.stale[rid];
            if (Object.keys(this.stale).length === 0) {
                this.stale = null;
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _seekRefs(refs: Record<string, Ref>, ci: CacheItem, state: States): boolean {
        // Quick exit if it is already subscribed
        if (ci.subscribed) {
            return false;
        }

        const rid = ci.rid;
        const r = refs[rid];
        if (r) {
            r.rc--;
            return false;
        }

        refs[rid] = { ci, rc: ci.indirect - 1, st: States.NONE };
        return true;
    }

    private _send<T = unknown>(action: string, rid: string, method?: string, params?: unknown): Promise<T> {
        if (!rid) {
            throw new Error("Invalid resource ID");
        }

        if (method === "") {
            throw new Error("Invalid method");
        }

        const m = `${action}.${rid}${(method ? `.${method}` : "")}`;

        return this.connected
            ? this._sendNow<T>(m, params)
            : this.connect()
                .catch(async err => {
                    throw (await (new ResError(this, rid, m, params)).init(err as Error));
                })
                .then(() => this._sendNow<T>(m, params));
    }

    private _sendNow<T = unknown>(method: string, params?: unknown): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const req = { id: this.requestID++, method, params };

            this.requests[req.id] = {
                method,
                params: req.params,
                resolve,
                reject
            };

            const json = JSON.stringify(req);
            Debug("ws:send", "->", req);
            this.ws!.send(json);
        });
    }

    private _sendUnsubscribe(ci: CacheItem, count: number): void {
        this._send("unsubscribe", ci.rid, undefined, count > 1 ? { count } : null)
            .then(() => {
                ci.addSubscribed(-count);
                this._tryDelete(ci);
            })
            .catch(() => this._tryDelete(ci));
    }

    private _setStale(rid: string): void {
        this._addStale(rid);
        if (this.connected) {
            setTimeout(() => this._subscribeToStale(rid), SUBSCRIBE_STALE_DELAY);
        }
    }

    private async _subscribe(ci: CacheItem, throwError = false): Promise<void> {
        const rid = ci.rid;
        ci.addSubscribed(1);
        this._removeStale(rid);
        return this._send<Shared>("subscribe", rid)
            .then(response => this._cacheResources(response))
            .catch(async err => {
                if (throwError) {
                    this._handleFailedSubscribe(ci);
                    throw err;
                } else {
                    await this._handleUnsubscribeEvent(ci);
                }
            });
    }

    private async _subscribeReferred(ci: CacheItem): Promise<void> {
        const i = ci.subscribed;
        ci.subscribed = 0;
        const refs = this._getRefState(ci);
        ci.subscribed = i;

        for (const rid of Object.keys(refs)) {
            const r = refs[rid]!;
            if (r.st === States.STALE) {
                await this._subscribe(r.ci);
            }
        }
    }

    private async _subscribeToAllStale(): Promise<void> {
        if (!this.stale) {
            return;
        }

        for (const rid of Object.keys(this.stale)) {
            await this._subscribeToStale(rid);
        }
    }

    private async _subscribeToStale(rid: string): Promise<void> {
        if (!this.connected || !this.stale || !this.stale[rid]) {
            return;
        }

        const ci = this.cache[rid];
        assert(ci, `Missing CacheItem (rid: ${rid})`);
        return this._subscribe(ci);
    }

    private async _syncCollection(cacheItem: CacheItem<ResCollection>, data: Array<RIDRef>): Promise<void> {
        const collection = cacheItem.item;
        let i = collection.length;
        const a = Array.from({ length: i });
        while (i--) {
            a[i] = collection.at(i);
        }

        const b = data.map(v => this._prepareValue(v as never));
        await this._patchDiff<unknown>(a, b,
            async () => {},
            async (id: unknown, n: number, idx: number) => this._handleAddEvent(cacheItem, "add", { value: data[n]!, idx }),
            async (id: unknown, m: number, idx: number) => this._handleRemoveEvent(cacheItem, "remove", { idx })
        );
    }

    private async _syncItems(refs: AnyObject, type: AnyResType): Promise<void> {
        if (!refs) {
            return;
        }

        for (const rid of Object.keys((refs))) {
            const ci = this.cache[rid];
            await type.synchronize(ci as never, refs[rid] as never);
        }
    }

    private async _syncModel(ci: CacheItem<ResModel>, data: ChangeEventData["values"]): Promise<void> {
        await this._handleChangeEvent(ci, "change", { values: data }, true);
    }

    private _traverse(ci: CacheItem, cb: (ci: CacheItem, state: States) => States | boolean, state: States, skipFirst = false): void {
        // Call callback to get new state to pass to
        // children. If false, we should not traverse deeper
        if (!skipFirst) {
            const s = cb(ci, state);
            if (s === false) {
                return;
            } else {
                state = s as States;
            }
        }

        const item = ci.item;
        switch (ci.type) {
            case COLLECTION_TYPE: {
                for (const v of item as ResCollection) {
                    const cii = this._getRefItem(v);
                    if (cii) {
                        this._traverse(cii, cb, state);
                    }
                }
                break;
            }
            case MODEL_TYPE: {
                for (const k in item) {
                    if (Object.hasOwn(item, k)) {
                        const cii = this._getRefItem(item[k as never]);
                        if (cii) {
                            this._traverse(cii, cb, state);
                        }
                    }
                }
                break;
            }
        }
    }

    private _tryDelete(ci: CacheItem): void {
        const refs = this._getRefState(ci);

        for (const rid of Object.keys(refs)) {
            const r = refs[rid]!;
            switch (r.st) {
                case States.STALE: {
                    this._setStale(rid);
                    break;
                }
                case States.DELETE: {
                    this._deleteRef(r.ci as never);
                    break;
                }
            }
        }
    }

    private async _unsubscribe(ci: CacheItem): Promise<void> {
        if (!ci.subscribed) {
            if (this.stale && this.stale[ci.rid]) {
                this._tryDelete(ci);
            }
            return;
        }

        await this._subscribeReferred(ci);

        let i = ci.subscribed;
        if (this.protocol.unsubscribeCountSupported) {
            this._sendUnsubscribe(ci, i);
        } else {
            while (i--) {
                this._sendUnsubscribe(ci, 1);
            }
        }
    }

    authenticate<T = unknown>(rid: string, method: string, params: unknown): Promise<T> {
        return this._call<T>("auth", rid, method, params);
    }

    call<T = unknown>(rid: string, method: string, params?: unknown): Promise<T> {
        return this._call<T>("call", rid, method, params);
    }

    connect(): Promise<void> {
        this.tryConnect = true;
        if (!this.connectPromise) {
            this.connectPromise = new Promise<void>((resolve, reject) => {
                this.connectCallback = { resolve, reject };
                this.ws = this.wsFactory();

                /* eslint-disable unicorn/prefer-add-event-listener */
                this.ws.onopen = this.onOpen;
                this.ws.onerror = this.onError;
                this.ws.onmessage = this.onMessage;
                this.ws.onclose = this.onClose;
                /* eslint-enable unicorn/prefer-add-event-listener */
            });
            this.connectPromise.catch(err => this._emit("connectError", err));
        }

        return this.connectPromise;
    }

    async create(rid: string, params: unknown): Promise<ResModel | ResError | ResCollection> {
        return this._send<Shared>("new", rid, undefined, params)
            .then(async result => {
                await this._cacheResources(result);
                const _rid = (result as { rid: string; }).rid;
                const ci = this.cache[rid];
                assert(ci, `Missing CacheItem (rid: ${_rid})`);
                ci.addSubscribed(1);
                return ci.item;
            });
    }

    async disconnect(): Promise<void> {
        this.tryConnect = false;
        const err = { code: ErrorCodes.DISCONNECT, message: "Disconnect called" };
        const resErr = new ResError(this, "disconnect", undefined, err);

        const req = Object.values(this.requests);
        if (req.length !== 0) {
            for (const r of req) r.reject(resErr);
        }
        if (this.ws) {
            const ws = this.ws;
            ws.removeEventListener("close", this.onClose);
            await this.onClose(resErr);
            ws.close();
            this._connectReject(err);
        }
    }

    async get<T extends AnyRes = AnyRes>(rid: string, forceKeep = false): Promise<T> {
        Debug("client:get", `${rid}${forceKeep ? " (keep)" : ""}`);
        return this.subscribe(rid, forceKeep).then(() => this.getCached<T>(rid)!);
    }

    getCached<T extends AnyRes = AnyRes>(rid: string): T | null {
        Debug("client:getCached", rid);
        return this.cache[rid]?.item as T ?? null;
    }

    async getPaginated<T extends ResModel = ResModel>(rid: string, offset: number, limit: number): Promise<Array<T>> {
        rid = `${rid}?offset=${offset}&limit=${limit}`;
        Debug("client:getPaginated", rid);
        const ci = CacheItem.createDefault(rid, this);
        this.cache[rid] = ci;
        await ci.setPromise(this._subscribe(ci, true));
        const item = ci.item as unknown as ResCollection | ResModel;
        let items: Array<T>;
        if (item instanceof ResModel) {
            items = Object.values(item.props as Record<string, T>);
        } else if (item instanceof ResCollection) {
            items = item.list as Array<T>;
        } else {
            assert(false, `Invalid resource type for paginated request: ${(item as AnyClass).constructor.name}`);
        }
        ci.unsubscribe();
        return items;
    }

    keepCached(item: CacheItem, cb = false): void {
        Debug("client:keepCached", item.rid);
        if (item.forceKeep) return;
        if (!cb) item.keep();
        item.resetTimeout();
    }

    off(handler: AnyFunction): this;
    off(events: string | Array<string> | null, handler: AnyFunction): this;
    off(...args: [string | Array<string> | null, AnyFunction] | [AnyFunction]): this {
        this.eventBus.off(this, args.length === 1 ? null : args[0], args.at(-1) as AnyFunction, this.namespace);
        return this;
    }

    on(handler: AnyFunction): this;
    on(events: string | Array<string> | null, handler: AnyFunction): this;
    on(...args: [string | Array<string> | null, AnyFunction] | [AnyFunction]): this {
        this.eventBus.on(this, args.length === 1 ? null : args[0], args.at(-1) as AnyFunction, this.namespace);
        return this;
    }

    registerCollectionType(pattern: string, factory: ItemFactory<ResCollection>): this {
        this.types.collection.list.addFactory(pattern, factory);
        return this;
    }

    registerModelType(pattern: string, factory: ItemFactory<ResModel>): this {
        this.types.model.list.addFactory(pattern, factory);
        return this;
    }

    resourceOff(rid: string, events: string | Array<string> | null, handler: AnyFunction): void {
        Debug("client:resourceOff", `${rid} ${events === null ? "all" : (Array.isArray(events) ? events.join(", ") : events)}`);
        const cacheItem = this.cache[rid];
        if (!cacheItem?.item) {
            throw new Error(`Resource ${rid} not found in cache`);
        }

        cacheItem.removeDirect();
        this.eventBus.off(cacheItem.item, events, handler, `${this.namespace}.resource.${rid}`);
    }

    resourceOn(rid: string, events: string | Array<string> | null, handler: AnyFunction): void {
        Debug("client:resourceOn", `${rid} ${events === null ? "all" : (Array.isArray(events) ? events.join(", ") : events)}`);
        const cacheItem = this.cache[rid];
        if (!cacheItem?.item) {
            throw new Error(`Resource ${rid} not found in cache`);
        }

        cacheItem.addDirect();
        this.eventBus.on(cacheItem.item, events, handler, `${this.namespace}.resource.${rid}`);
    }

    // TODO: needs better typing
    setModel(modelId: string, props: AnyObject): Promise<unknown> {
        props = { ...props };
        // Replace undefined with actionDelete object
        for (const k of Object.keys(props)) {
            if (props[k] === undefined) {
                props[k] = ACTION_DELETE;
            }
        }

        return this._send("call", modelId, "set", props);
    }

    setOnConnect(onConnect: OnConnectFunction | null, onConnectError?: OnConnectErrorFunction | null): this {
        this.onConnect = onConnect;
        if (onConnectError !== undefined) {
            this.onConnectError = onConnectError;
        }
        return this;
    }

    async subscribe(rid: string, forceKeep = false): Promise<void> {
        Debug("client:subscribe", `${rid}${forceKeep ? " (keep)" : ""}`);
        let ci = this.cache[rid];
        if (ci) {
            if (ci.promise) await ci.promise;
            ci.resetTimeout();
            if (forceKeep) ci.keep();
            return;
        }

        ci = CacheItem.createDefault(rid, this);
        this.cache[rid] = ci;
        if (forceKeep) ci.keep();
        return ci.setPromise(this._subscribe(ci, true));
    }

    unkeepCached(item: CacheItem, cb = false): void {
        Debug("client:unkeepCached", item.rid);
        if (!item.forceKeep) return;
        if (!cb) item.unkeep();
        item.resetTimeout();
    }

    unregisterCollectionType(pattern: string): this {
        this.types.collection.list.removeFactory(pattern);
        return this;
    }

    unregisterModelType(pattern: string): this {
        this.types.model.list.removeFactory(pattern);
        return this;
    }
}
