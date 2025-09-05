import { getProps } from "./utils.js";
import type ResClient from "../../models/ResClient.js";
import type ResModel from "../../models/ResModel.js";
import Properties from "../../util/Properties.js";
import { type AnyFunction, type AnyObject } from "../../util/types.js";
import { lcsDiff } from "../../util/util.js";
import { binarySearch } from "../utils/array.js";
import assert from "node:assert";

export interface ModelToCollectionItem {
    cb: AnyFunction | null;
    key: string;
    value: ResModel;
}

export type CompareFunction = (a: ModelToCollectionItem, b: ModelToCollectionItem) => number;
export type FilterFunction = (key: string, value: ResModel) => boolean;
export interface ModelToCollectionOptions {
    compare?: CompareFunction;
    filter?: FilterFunction;
    namespace?: string;
}

const defaultCompare = (a: ModelToCollectionItem, b: ModelToCollectionItem): number => a.key.localeCompare(b.key);
const defaultNamespace = "modelToCollection";
export default class ModelToCollection {
    private _compare!: CompareFunction;
    private _filter?: FilterFunction;
    private _filtered!: Record<string, ModelToCollectionItem>;
    private _list!: Array<ModelToCollectionItem>;
    private _model!: ResModel | null;
    private _namespace!: string;
    private _props!: Record<string, ModelToCollectionItem>;
    private onChange = this._onChange.bind(this);
    protected api!: ResClient;
    constructor(model: ResModel | null, api: ResClient, options?: ModelToCollectionOptions) {
        Properties.of(this)
            .writableBulk(["_list", []], ["_props", []], ["_model"])
            .readOnlyBulk(["_compare", options?.compare ?? defaultCompare], ["_filter", options?.filter], ["_filtered", {}], ["_namespace", options?.namespace ?? defaultNamespace], ["api", api]);

        this.setModel(model, false);
    }

    private _addItem(key: string, model: ResModel): void {
        const item = { cb: null, key, value: model };
        this._listenItem(item);
        if (!this._filter || this._filter(key, model)) {
            this._list.splice(this._insertIndex(item), 0, item);
        } else {
            this._filtered[key] = item;
        }
    }

    private _indexOfItem(key: string, item: ResModel): number {
        const index = binarySearch(this._list, { cb: null, key, value: item }, this._compare);
        if (index >= 0 && this._list[index]!.key === key) {
            return index;
        }

        // Binary search failed. Let's scan it instead.
        return this._indexOfKey(key);
    }

    private _indexOfKey(key: string): number {
        return this._list.findIndex(item => item.key === key);
    }

    private _insertIndex(item: ModelToCollectionItem): number {
        const index = binarySearch(this._list, item, this._compare);
        return index < 0 ? ~index : index; // Use the bitwise complement to get insert index.
    }

    private _listen(on: boolean): void {
        const cb = on ? "resourceOn" : "resourceOff";
        if (this._model && this._model[cb]) {
            this._model[cb]("change", this.onChange);
        }
    }

    private _listenItem(item: ModelToCollectionItem): void {
        this._props[item.key] = item;
        const model = item.value;
        if (typeof model === "object" && model !== null && typeof model.resourceOn === "function") {
            item.cb = (): void => {
                if (this._props[item.key] !== item) return;

                const oldList = Array.from(this._list);
                this._list.sort(this._compare);
                this._onItemChange(item);

                this._sendSyncEvents(oldList, this._list);
            };
            model.resourceOn("change", item.cb);
        }
    }

    private _onChange(change: AnyObject<ResModel | undefined>, model: ResModel): void {
        if (model !== this._model) return;

        this._list.sort(this._compare);

        const p = getProps(model);

        for (const key of Object.keys(change)) {
            const nv = p[key] as ResModel;
            const o = this._props[key];
            const ov = o ? o.value : undefined;

            if (ov === nv) continue;

            if (ov === undefined) {
                this._addItem(key, nv);
            } else if (nv === undefined) {
                this._removeItem(key);
            } else {
                this._removeItem(key);
                this._addItem(key, nv);
            }
        }
    }
    private _onItemChange(item: ModelToCollectionItem): void {
        const k = item.key;
        const v = item.value;
        const show = !this._filter || this._filter(k, v);
        const f = this._filtered[k];
        if (f) {
            if (show) {
                delete this._filtered[k];
                this._list.splice(this._insertIndex(item), 0, item);
            }
        } else {
            if (!show) {
                const index = this._indexOfItem(k, v);
                assert(index >= 0, `Item not in list: ${k} ${String(v)}`);
                this._list.splice(index, 1);
                this._filtered[k] = item;
            }
        }
    }

    private _removeItem(key: string): void {
        const item = this._props[key];
        assert(item, `Item not in list: ${key}`);
        delete this._props[key];
        this._unlistenItem(item);

        // Handle hidden item
        if (this._filtered[key]) {
            delete this._filtered[key];
            return;
        }

        // Handle visible item
        const index = this._indexOfItem(key, item.value);
        assert(index >= 0, `Item not in list: ${key} ${String(item.value)}`);
        this._list.splice(index, 1);
    }

    private _sendSyncEvents(oldList: Array<ModelToCollectionItem>, newList: Array<ModelToCollectionItem>): void {
        lcsDiff(oldList, newList,
            () => {},
            (item, _, idx) => this.api.eventBus.emit(this, `${this._namespace}.add`, {
                item: item.value,
                idx
            }),
            (item, _, idx) => this.api.eventBus.emit(this, `${this._namespace}.remove`, {
                item: item.value,
                idx
            })
        );
    }

    private _unlistenItem(item: ModelToCollectionItem): void {
        if (item.cb) {
            item.value.resourceOff("change", item.cb);
            item.cb = null;
        }
    }

    get length(): number {
        return this._list.length;
    }

    [Symbol.iterator](): Iterator<ModelToCollectionItem, undefined                                                                                                                                                                                                                                                                                                                                                                                                                                                            > {
        return this._list[Symbol.iterator]();
    }

    at(index: number): ResModel | undefined {
        return this._list.at(index)?.value;
    }

    getClient(): ResClient {
        return this.api;
    }

    getModel(): ResModel | null {
        return this._model;
    }

    indexOf(item: ResModel): number {
        return this._list.findIndex(e => e.value === item);
    }

    invalidate(): void {
        this.setModel(null, true);
    }

    off(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.off(this, events, handler, this._namespace);
        return this;
    }

    on(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.on(this, events, handler, this._namespace);
        return this;
    }

    refresh(key?: string): void {
        if (!this._model) return;

        const oldList = Array.from(this._list);
        this._list.sort(this._compare);

        if (key) {
            const o = this._props[key];
            if (o) this._onItemChange(o);
        } else {
            for (const v of Object.values(this._props)) this._onItemChange(v);
        }

        this._sendSyncEvents(oldList, this._list);
    }

    setModel(model: ResModel | null, noEvents: boolean): this {
        if (this._model === model) return this;

        for (const value of Object.values(this._props)) {
            this._unlistenItem(value);
        }

        this._listen(false);
        this._model = model;
        this._listen(true);

        const oldList = this._list;
        this._list.splice(0, this._list.length);
        this._props = {};
        this._filtered = {};

        if (model) {
            const p = getProps(model);

            for (const [key, value] of Object.entries(p) as Array<[string, ResModel]>) {
                const o = { cb: null, key, value };
                if (!this._filter || this._filter(key, value)) {
                    this._list.push(o);
                } else {
                    this._filtered[key] = o;
                }
            }

            this._list.sort(this._compare);
        }

        if (!noEvents) {
            this._sendSyncEvents(oldList, this._list);
        }

        return this;
    }

    toArray(): Array<ResModel> {
        return this._list.map(e => e.value);
    }
}
