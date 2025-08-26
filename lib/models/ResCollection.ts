import type ResClient from "./ResClient.js";
import type CacheItem from "./CacheItem.js";
import { copy } from "../includes/utils/obj.js";
import Properties from "../util/Properties.js";
import { type AnyObject, type AnyFunction } from "../util/types.js";

export interface ResCollectionEvents<V = unknown> {
    add: [data: CollectionAddRemove<V>];
    remove: [data: CollectionAddRemove<V>];
}
export interface CollectionAddRemove<V> { idx: number; item: V; }
export default class ResCollection<V = unknown, ResourceEvents extends { [K in keyof ResourceEvents]: Array<unknown> } = ResCollectionEvents<V>, ModelEvents extends { [K in keyof ModelEvents]: Array<unknown> } = Record<string, Array<unknown>>> {
    private _idCallback?: (item: V) => string;
    private _list: Array<V> = [];
    private _map!: Record<string, V> | null;
    protected api!: ResClient;
    rid!: string;
    constructor(api: ResClient, rid: string, options?: { idCallback?(item: V): string; }) {
        options = copy(options ?? {}, {
            idCallback: { type: "?function" }
        });
        this.p
            .writableBulk(["_idCallback", options?.idCallback?.bind(this)], "_list", ["_map", options.idCallback ? {} : null])
            .readOnly("api", api)
            .define("rid", false, true, true, rid);
    }

    private _hasID(): void {
        if (!this._idCallback) {
            throw new Error("No id callback defined");
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async _listen(on: boolean): Promise<void> {
        // empty
    }

    protected get p(): Properties {
        return Properties.of(this);
    }

    get cacheItem(): CacheItem<ResCollection> {
        return this.getClient().cache[this.rid] as CacheItem<ResCollection>;
    }

    /** If this collection is empty. */
    get empty(): boolean {
        return this.length === 0;
    }

    get length(): number {
        return this._list.length;
    }

    get list(): Array<V> {
        return this._list;
    }

    [Symbol.iterator](): Iterator<V, undefined> {
        return this._list[Symbol.iterator]();
    }

    add(item: V, index: number): void {
        this._list.splice(index, 0, item);

        if (this._idCallback) {
            const id = String(this._idCallback(item));
            if (["", "undefined", "null"].includes(id) || id.replaceAll(/\W/g, "") === "") {
                console.debug(item);
                throw new Error("No id for item");
            }
            if (this._map![id]) {
                throw new Error(`Duplicate id - ${id}`);
            }
            this._map![id] = item;
        }
    }

    at(index: number): V | undefined {
        return this._list[index];
    }

    auth<T = unknown>(method: string, params: unknown): Promise<T> {
        return this.api.authenticate<T>(this.rid, method, params);
    }

    call<T = unknown>(method: string, params: unknown): Promise<T> {
        return this.api.call<T>(this.rid, method, params);
    }

    /** Called when the collection is unsubscribed. */
    async dispose(): Promise<void> {
        await this._listen(false);
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every | Array#every } */
    every<T extends V, ThisArg = ResCollection<V>>(predicate: (value: V, index: number, array: Array<V>) => value is T, thisArg?: ThisArg): this is Array<T>;
    every<ThisArg = ResCollection<V>>(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): boolean;
    every(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: unknown): boolean {
        return this.toArray().every(predicate, thisArg);

    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter | Array#filter } */
    filter<S extends V, ThisArg = ResCollection<V>>(predicate: (this: ThisArg, value: V, index: number, array: Array<V>) => value is S, thisArg?: ThisArg): Array<S>;
    filter<ThisArg = ResCollection<V>>(predicate: (this: ThisArg, value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): Array<V>;
    filter(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: unknown): Array<V> {
        return this.toArray().filter(predicate, thisArg) ;
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find | Array#find } */
    find<S extends V, ThisArg = ResCollection<V>>(predicate: (this: ThisArg, value: V, index: number, obj: Array<V>) => value is S, thisArg?: ThisArg): S | undefined;
    find<ThisArg = ResCollection<V>>(predicate: (this: ThisArg, value: V, index: number, obj: Array<V>) => unknown, thisArg?: ThisArg): V | undefined;
    find(predicate: (value: V, index: number, obj: Array<V>) => unknown, thisArg?: unknown): V | undefined {
        return this.toArray().find(predicate, thisArg);
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex | Array#findIndex } */
    findIndex(predicate: (value: V, index: number, obj: Array<V>) => unknown, thisArg?: unknown): number {
        return this.toArray().findIndex(predicate, thisArg);
    }

    /**
     * Get the first element, or first X elements if a number is provided.
     * @param amount The amount of elements to get.
     */
    first(): V | undefined;
    first(amount: number): Array<V>;
    first(amount?: number): V | Array<V> | undefined {
        if (amount === undefined) {
            const iterable = this[Symbol.iterator]();
            return iterable.next().value;
        }

        if (amount < 0) {
            return this.last(amount * -1);
        }
        amount = Math.min(amount, this.length);

        const iterable = this[Symbol.iterator]();
        return Array.from({ length: amount }, () => iterable.next().value!);
    }

    get(id: string | number): V | undefined {
        this._hasID();
        return this._map![id];
    }

    getClient(): ResClient {
        return this.api;
    }

    getOrThrow(id: string | number): V {
        const item = this.get(id);
        if (item === undefined) {
            throw new TypeError(`${id} not found in ${this.rid}`);
        }

        return item;
    }

    indexOf(item: V): number {
        return this._list.indexOf(item);
    }

    async init(data: Array<V> = []): Promise<this> {
        this._list = data;

        if (this._idCallback) {
            this._map = {};
            for (const v of this._list) {
                const id = String(this._idCallback(v));
                if (["", "undefined", "null"].includes(id) || id.replaceAll(/\W/g, "") === "") {
                    throw new Error("No id for item");
                }
                if (this._map[id]) {
                    throw new Error(`Duplicate id - ${id}`);
                }
                this._map[id] = v;
            }
        }
        await this._listen(true);

        return this;
    }

    /**
     * Get the last element, or last X elements if a number is provided.
     * @param amount The amount of elements to get.
     */
    last(): V | undefined;
    last(amount: number): Array<V>;
    last(amount?: number): V | Array<V> | undefined {
        const iterator = Array.from(this._list);
        if (amount === undefined) {
            return iterator.at(-1);
        }
        if (amount < 0) {
            return this.first(amount * -1);
        }
        if (!amount) {
            return [];
        }

        return iterator.slice(-amount);
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map | Array#map } */
    map<T>(predicate: (value: V, index: number, obj: Array<V>) => T, thisArg?: unknown): Array<T> {
        return this.toArray().map(predicate, thisArg);
    }

    off<K extends keyof ModelEvents>(event: K, handler: (...args: ModelEvents[K]) => void): this;
    off(events: string | Array<string> | null, handler: AnyFunction): this;
    off(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.off(this, events, handler);
        return this;
    }

    on<K extends keyof ModelEvents>(event: K, handler: (...args: ModelEvents[K]) => void): this;
    on(events: string | Array<string> | null, handler: AnyFunction): this;
    on(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.eventBus.on(this, events, handler);
        return this;
    }

    /**
     * Pick a random element from the collection, or undefined if the collection is empty.
     */
    random(): V | undefined {
        if (this.empty) {
            return undefined;
        }
        const iterable = Array.from(this._list);

        return iterable[Math.floor(Math.random() * iterable.length)];
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce | Array#reduce } */
    reduce(predicate: (previousValue: V, currentValue: V, currentIndex: number, array: Array<V>) => V): V;
    reduce(predicate: (previousValue: V, currentValue: V, currentIndex: number, array: Array<V>) => V, initialValue: V): V;
    reduce<T>(predicate: (previousValue: T, currentValue: V, currentIndex: number, array: Array<V>) => T, initialValue: T): T;
    reduce<T>(predicate: (previousValue: T, currentValue: V, currentIndex: number, array: Array<V>) => T, initialValue?: T): T {
        return this.toArray().reduce(predicate, initialValue!);
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduceRight | Array#reduceRight } */
    reduceRight(predicate: (previousValue: V, currentValue: V, currentIndex: number, array: Array<V>) => V): V;
    reduceRight(predicate: (previousValue: V, currentValue: V, currentIndex: number, array: Array<V>) => V, initialValue: V): V;
    reduceRight<T>(predicate: (previousValue: T, currentValue: V, currentIndex: number, array: Array<V>) => T, initialValue: T): T;
    reduceRight<T>(predicate: (previousValue: T, currentValue: V, currentIndex: number, array: Array<V>) => T, initialValue?: T): T {
        return this.toArray().reduceRight(predicate, initialValue!);
    }

    remove(index: number): V | undefined {
        const item = this._list[index];
        if (item !== undefined) {
            this._list.splice(index, 1);

            if (this._idCallback) {
                delete this._map![this._idCallback(item)];
            }
        }

        return item;
    }

    resourceOff<K extends keyof ResourceEvents>(event: K, handler: (...args: ResourceEvents[K]) => void): this;
    resourceOff(events: string | Array<string> | null, handler: AnyFunction): this;
    resourceOff(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.resourceOff(this.rid, events, handler);
        return this;
    }

    resourceOn<K extends keyof ResourceEvents>(event: K, handler: (...args: ResourceEvents[K]) => void): this;
    resourceOn(events: string | Array<string> | null, handler: AnyFunction): this;
    resourceOn(events: string | Array<string> | null, handler: AnyFunction): this {
        this.api.resourceOn(this.rid, events, handler);
        return this;
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some | Array#some } */
    some<ThisArg = ResCollection<V>>(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): boolean {
        return this.toArray().some(predicate, thisArg);
    }

    /** Get the values of this collection as an array. */
    toArray(): Array<V> {
        return Array.from(this._list);
    }

    toJSON(): Array<unknown> {
        return this._list.map(v => (
            v !== null && typeof v === "object" && "toJSON" in v
                ? (v as { toJSON(): AnyObject; }).toJSON()
                : v
        ));
    }
}
