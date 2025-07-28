import CacheItem from "./CacheItem.js";
import TypeList, { type ItemFactory } from "./TypeList.js";
import ResCollection from "./ResCollection.js";
import ResError from "./ResError.js";
import ResModel from "./ResModel.js";
import ResRef from "./ResRef.js";
import eventBus, { type EventBus } from "../includes/eventbus/index.js";
import { equal } from "../includes/utils/obj.js";
import {
    ACTION_DELETE,
    COLLECTION_TYPE,
    ERROR_TYPE,
    LEGACY_PROTOCOL,
    MODEL_TYPE,
    States,
    SUPPORTED_PROTOCOL,
    RESOURCE_TYPES,
    versionToInt,
    CURRENT_PROTOCOL,
    RECONNECT_DELAY,
    SUBSCRIBE_STALE_DELAY,
    SystemErrorCodes
} from "../Constants.js";
import type {
    AddEventData,
    RemoveEventData,
    ChangeEventData,
    ErrorData,
    Ref,
    Shared,
    RIDRef,
    Refs
} from "../util/resgate.js";
import { Debug } from "../util/Debug.js";
import ensurePromiseReturn from "../util/ensurePromiseReturn.js";
import Properties from "../util/Properties.js";
import { type AnyFunction, type AnyObject } from "../util/types.js";
import WebSocket, { type MessageEvent } from "ws";
import assert from "node:assert";

export type OnConnectFunction<C extends ResClient> = (api: C) => unknown;
export type OnConnectErrorFunction<C extends ResClient> = (api: C, err: unknown) => unknown;
export interface ClientOptions<C extends ResClient> {
    eventBus?: EventBus;
    namespace?: string;
    onConnect?: OnConnectFunction<C>;
    onConnectError?: OnConnectErrorFunction<C>;
}

export interface Request {
    method: string;
    params: unknown;
    reject(err: Error | ResError): void;
    resolve(value: unknown): void;
}

export function getRID(v: unknown): string | null {
    if (typeof v === "object" && v !== null) {
        if ("getResourceID" in v && typeof v.getResourceID === "function") {
            return v.getResourceID() as string;
        }
        if ("rid" in v && typeof v.rid === "string") {
            return v.rid;
        }
    }

    return null;
}

export type ResType = ResClient["types"][keyof ResClient["types"]];
export default class ResClient {
    private onClose = this._onClose.bind(this);
    private onError = this._onError.bind(this);
    private onMessage = this._onMessage.bind(this);
    private onOpen = this._onOpen.bind(this);
    private unsubscribe = this._unsubscribe.bind(this);
    cache: Partial<Record<string, CacheItem>> = {};
    connectCallback: { reject(err: ErrorData): void; resolve(): void; } | null = null;
    connectPromise: Promise<void> | null = null;
    connected = false;
    eventBus = eventBus;
    namespace = "resclient";
    onConnect: OnConnectFunction<this> | null = null;
    onConnectError: OnConnectErrorFunction<this> | null = null;
    protocol!: number;
    requestID = 1;
    requests: Record<number, Request> = {};
    stale: Record<string, boolean> | null = null;
    tryConnect = false;
    types = {
        collection: {
            id:          COLLECTION_TYPE,
            list:        new TypeList((api, rid) => new ResCollection(api, rid)),
            prepareData: (data: Array<unknown>): Array<unknown> => data.map(item => this._prepareValue(item as never, true)),
            getFactory(rid: string): ItemFactory<ResCollection> {
                return this.list.getFactory(rid);
            },
            synchronize: this._syncCollection.bind(this)
        },
        error: {
            id:          ERROR_TYPE,
            prepareData: (data: unknown): unknown => data,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            getFactory(_rid: string): ItemFactory<ResError> {
                return (api: ResClient, rid: string): ResError => new ResError(rid);
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
            synchronize(cacheItem: CacheItem<ResError>, data: Array<RIDRef>): void {}
        },
        model: {
            id:          MODEL_TYPE,
            list:        new TypeList((api, rid) => new ResModel(api, rid)),
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
        }
    };
    ws: WebSocket | null = null;
    wsFactory: (() => WebSocket);
    constructor(hostUrlOrFactory: string | (() => WebSocket), options: ClientOptions<ResClient> = {}) {
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

        this.wsFactory = typeof hostUrlOrFactory === "string" ? (): WebSocket => new WebSocket(hostUrlOrFactory) : hostUrlOrFactory;

        Properties.of(this)
            .readOnlyBulk("cache", "eventBus", "onClose", "onError", "onMessage", "onOpen", "requests", "types", "unsubscribe", "wsFactory")
            .writableBulk("connectCallback", "connected", "connectPromise", "namespace", "onConnect", "onConnectError", "protocol", "requestID", "stale", "tryConnect", "ws");
    }

    private _addStale(rid: string): void {
        if (!this.stale) {
            this.stale = {};
        }
        this.stale[rid] = true;
    }

    private _cacheResources(r: Shared): void {
        if (!r || !(r.models || r.collections || r.errors)) {
            return;
        }

        const sync = {} as Record<typeof RESOURCE_TYPES[number], Record<string, Ref>>;
        const rr =  (t: typeof RESOURCE_TYPES[number]): Refs => ({ collection: r.collections, model: r.models, error: r.errors }[t]!);
        // eslint-disable-next-line unicorn/no-array-for-each
        RESOURCE_TYPES.forEach(t => (sync[t] = this._createItems(rr(t), this.types[t])! as never));
        // eslint-disable-next-line unicorn/no-array-for-each
        RESOURCE_TYPES.forEach(t => this._initItems(rr(t), this.types[t]));
        // eslint-disable-next-line unicorn/no-array-for-each
        RESOURCE_TYPES.forEach(t => this._syncItems(sync[t], this.types[t]));

    }

    private _call<T = unknown>(type: string, rid: string, method?: string, params?: unknown): Promise<T> {
        return this._send<{ payload: T; rid?: string; }>(type, rid, method || "", params)
            .then(result => {
                if (result.rid) {
                    this._cacheResources(result as never);
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

    private _createItems(refs: Refs, type: ResType): AnyObject | undefined {
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
                ci = this.cache[rid] = new CacheItem(rid, this._unsubscribe.bind(this));
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
                ci.setItem(f(this, rid), type.id);
            }
        }

        return sync;
    }

    private _deleteRef(ci: CacheItem<ResCollection>): void {
        const item = ci.item;
        let ri: CacheItem | null;
        switch (ci.type) {
            case COLLECTION_TYPE: {
                for (const v of item) {
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

    private _handleAddEvent(ci: CacheItem<ResCollection>, event: string, data: AddEventData): boolean {
        if (ci.type !== COLLECTION_TYPE) {
            return false;
        }

        this._cacheResources(data);
        const v = this._prepareValue(data.value, true);
        const idx = data.idx;

        ci.item.add(v, idx);
        this.eventBus.emit(ci.item, `${this.namespace}.resource.${ci.rid}.${event}`, { item: v, idx });
        return true;
    }

    private _handleChangeEvent(cacheItem: CacheItem<ResModel>, event: string, data: ChangeEventData, reset: boolean): boolean {
        if (cacheItem.type !== MODEL_TYPE) {
            return false;
        }

        this._cacheResources(data);

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

    private _handleErrorResponse(req: Request, data: unknown): void {
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
        const err = new ResError(rid.trim(), m, req.params).init((data as Record<"error", Record<string, string>>).error);
        try {
            this._emit("error", err);
        } catch {}

        // Execute error callback bound to calling object
        req.reject(err);
    }

    private _handleEvent(data: { data: unknown; event: string; }): void {
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
                handled = this._handleChangeEvent(cacheItem as CacheItem<ResModel>, event, data.data as ChangeEventData, false);
                break;
            }

            case "add": {
                handled = this._handleAddEvent(cacheItem as CacheItem<ResCollection>, event, data.data as AddEventData);
                break;
            }

            case "remove": {
                handled = this._handleRemoveEvent(cacheItem as CacheItem<ResCollection>, event, data.data as RemoveEventData);
                break;
            }

            case "unsubscribe": {
                handled = this._handleUnsubscribeEvent(cacheItem);
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

    private _handleRemoveEvent(ci: CacheItem<ResCollection>, event: string, data: RemoveEventData): boolean {
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

    private _handleSuccessResponse(req: Request, data: unknown): void {
        req.resolve((data as Record<"result", unknown>).result);
    }

    private _handleUnsubscribeEvent(ci: CacheItem): boolean {
        ci.addSubscribed(0);
        this._tryDelete(ci);
        this.eventBus.emit(ci.item, `${this.namespace}.resource.${ci.rid}.unsubscribe`, { item: ci.item });
        return true;
    }

    private _initItems(refs: Refs, type: ResType): void {
        if (!refs) {
            return;
        }

        for (const rid of Object.keys(refs)) {
            const cacheItem = this.cache[rid];
            assert(cacheItem, `Missing CacheItem (rid: ${rid})`);
            cacheItem.item.init(type.prepareData(refs[rid] as never) as never);
        }
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
        this._connectReject({ code: SystemErrorCodes.CONNECTION_ERROR, message: "Connection error", data: e });
    }

    private async _onMessage(e: MessageEvent): Promise<void> {
        this._receive((e as { data: string; }).data);
    }

    private async _onOpen(e: unknown): Promise<void> {
        Debug("ws", "ResClient open");
        let onConnectError: unknown = null;
        await this._sendNow<{ protocol: string; }>("version", { protocol: this.supportedProtocol })
            .then(ver=> {
                this.protocol = versionToInt(ver.protocol) || LEGACY_PROTOCOL;
            })
            .catch((err: ResError) => {
                // Invalid error means the gateway doesn't support
                // version requests. Default to legacy protocol.
                if (err.code && err.code === SystemErrorCodes.INVALID_REQUEST) {
                    this.protocol = LEGACY_PROTOCOL;
                    return;
                }
                throw err;
            })
            .then(async() => {
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

    // this is copied word-for-word as I cannot wrap my brain around this mess of code
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
    private _patchDiff(a: Array<any>, b: Array<any>, onKeep: AnyFunction, onAdd: AnyFunction, onRemove: AnyFunction): void {
        // Do a LCS matric calculation
        // https://en.wikipedia.org/wiki/Longest_common_subsequence_problem
        let t, i, j, s = 0, aa, bb, m = a.length, n = b.length;

        // Trim of matches at the start and end
        while (s < m && s < n && equal(a[s], b[s])) {
            s++;
        }
        if (s === m && s === n) {
            return;
        }
        while (s < m && s < n && equal(a[m - 1], b[n - 1])) {
            m--;
            n--;
        }

        if (s > 0 || m < a.length) {
            aa = a.slice(s, m);
            m = aa.length;
        } else {
            aa = a;
        }
        if (s > 0 || n < b.length) {
            bb = b.slice(s, n);
            n = bb.length;
        } else {
            bb = b;
        }

        // Create matrix and initialize it
        const c: Array<any> = Array.from({ length: m + 1 });
        for (i = 0; i <= m; i++) {
            c[i] = t = Array.from({ length: n + 1 });
            t[0] = 0;
        }
        t = c[0];
        for (j = 1; j <= n; j++) {
            t[j] = 0;
        }

        for (i = 0; i < m; i++) {
            for (j = 0; j < n; j++) {
                c[i + 1][j + 1] = equal(aa[i], bb[j])
                    ? c[i][j] + 1
                    : Math.max(c[i + 1][j], c[i][j + 1]);
            }
        }

        for (i = a.length - 1; i >= s + m; i--) {
            onKeep(a[i], i, i - m + n, i);
        }
        let idx = m + s;
        i = m;
        j = n;
        let r = 0;
        const adds = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            m = i - 1;
            n = j - 1;
            if (i > 0 && j > 0 && equal(aa[m], bb[n])) {
                onKeep(aa[m], m + s, n + s, --idx);
                i--;
                j--;
            } else if (j > 0 && (i === 0 || c[i][n] >= c[m][j])) {
                adds.push([ n, idx, r ]);
                j--;
            } else if (i > 0 && (j === 0 || c[i][n] < c[m][j])) {
                onRemove(aa[m], m + s, --idx);
                r++;
                i--;
            } else {
                break;
            }
        }
        for (i = s - 1; i >= 0; i--) {
            onKeep(a[i], i, i, i);
        }

        // Do the adds
        const len = adds.length - 1;
        for (i = len; i >= 0; i--) {
            [ n, idx, j ] = adds[i]! as [number, number, number];
            onAdd(bb[n], n + s, idx - r + j + len - i);
        }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

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

    private _receive(json: string): void {
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
                this._handleErrorResponse(req, data);
            } else {
                this._handleSuccessResponse(req, data);
            }
        } else if (Object.hasOwn(data, "event")) {
            this._handleEvent(data as never);
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
                .catch(err => {
                    throw new ResError(rid, m, params).init(err as Error);
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
            Debug("ws:send", "->", method, params);
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
            .catch(err => {
                if (throwError) {
                    this._handleFailedSubscribe(ci);
                    throw err;
                } else {
                    this._handleUnsubscribeEvent(ci);
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

    private _syncCollection(cacheItem: CacheItem<ResCollection>, data: Array<RIDRef>): void {
        const collection = cacheItem.item;
        let i = collection.length;
        const a = Array.from({ length: i });
        while (i--) {
            a[i] = collection.at(i);
        }

        const b = data.map(v => this._prepareValue(v as never));
        this._patchDiff(a, b,
            () => {},
            (id: string, n: number, idx: number): boolean => this._handleAddEvent(cacheItem, "add", {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                value: data[n]!,
                idx
            }),
            (id: string, m: number, idx: number) => this._handleRemoveEvent(cacheItem, "remove", { idx })
        );
    }

    private _syncItems(refs: AnyObject, type: ResType): void {
        if (!refs) {
            return;
        }

        for (const rid of Object.keys((refs))) {
            const ci = this.cache[rid];
            type.synchronize(ci as never, refs[rid] as never);
        }
    }

    private _syncModel(ci: CacheItem<ResModel>, data: ChangeEventData["values"]): void {
        this._handleChangeEvent(ci, "change", { values: data }, true);
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
        if (this.protocol < CURRENT_PROTOCOL) {
            while (i--) {
                this._sendUnsubscribe(ci, 1);
            }
        } else {
            this._sendUnsubscribe(ci, i);
        }
    }

    get supportedProtocol(): string {
        return SUPPORTED_PROTOCOL;
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
            .then(result => {
                this._cacheResources(result);
                const _rid = (result as { rid: string; }).rid;
                const ci = this.cache[rid];
                assert(ci, `Missing CacheItem (rid: ${_rid})`);
                ci.addSubscribed(1);
                return ci.item;
            });
    }

    async disconnect(): Promise<void> {
        this.tryConnect = false;

        if (this.ws) {
            const ws = this.ws;
            const err = { code: SystemErrorCodes.DISCONNECT, message: "Disconnect called" };
            ws.removeEventListener("close", this.onClose);
            await this.onClose(err);
            ws.close();
            this._connectReject(err);
        }
    }

    get<T = ResModel | ResCollection<unknown> | ResError>(rid: string): Promise<T> {
        // Check for resource in cache
        let ci = this.cache[rid];
        if (ci) {
            if (ci.promise) {
                return ci.promise as Promise<T>;
            }
            ci.resetTimeout();
            return Promise.resolve(ci.item as T);
        }

        ci = new CacheItem(rid, this.unsubscribe);
        this.cache[rid] = ci;

        return ci.setPromise(
            this._subscribe(ci, true).then(() => ci.item)
        ) as Promise<T>;
    }

    getCached<T = ResModel | ResCollection<unknown> | ResError>(rid: string): T | null {
        return this.cache[rid]?.item as T ?? null;
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
        const cacheItem = this.cache[rid];
        if (!cacheItem?.item) {
            throw new Error(`Resource ${rid} not found in cache`);
        }

        cacheItem.removeDirect();
        this.eventBus.off(cacheItem.item, events, handler, `${this.namespace}.resource.${rid}`);
    }

    resourceOn(rid: string, events: string | Array<string> | null, handler: AnyFunction): void {
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

    setOnConnect(onConnect: OnConnectFunction<this> | null, onConnectError?: OnConnectErrorFunction<this> | null): this {
        this.onConnect = onConnect;
        if (onConnectError !== undefined) {
            this.onConnectError = onConnectError;
        }
        return this;
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
