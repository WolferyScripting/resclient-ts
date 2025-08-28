import type ResClient from "./ResClient.js";
import ResModel, { type ResModelResourceEvents, type ResModelOptions } from "./ResModel.js";
import { changeDiff } from "../util/util.js";
import Properties from "../util/Properties.js";
import { copy } from "../includes/utils/obj.js";

export interface ResCollectionModelEvents<V = unknown> {
    add: [data: CollectionModelAddRemove<V>];
    remove: [data: CollectionModelAddRemove<V>];
}
export interface CollectionModelAddRemove<V = unknown> { item: V; key: string; }
export interface ResCollectionModelOptions<V = unknown> extends Omit<ResModelOptions, "definition"> {
    idCallback?(item: V): string;
}
export default class ResCollectionModel<V = unknown, ResourceEvents extends { [K in keyof ResourceEvents]: Array<unknown> } = ResModelResourceEvents<Record<string, V>>, ModelEvents extends { [K in keyof ModelEvents]: Array<unknown> } = ResCollectionModelEvents<V>> extends ResModel<Record<string, V>, ResourceEvents, ModelEvents> implements Iterable<V> {
    private _idCallback?: (item: V) => string;
    private _list: Array<V> = [];
    private _map!: Record<string, V> | null;
    private _validateItem!: (item: V) => boolean;
    private onChange = this._onChange.bind(this);
    constructor(api: ResClient, rid: string, validateItem: (item: V) => boolean, options?: ResCollectionModelOptions<V>) {
        // @ts-expect-error since ResModelOptions only has one option which we're excluding this ends up with no overlap
        super(api, rid, options);
        options = copy(options ?? {}, {
            idCallback: { type: "?function" }
        });
        Properties.of(this)
            .writable("_idCallback", options.idCallback?.bind(this))
            .writable("_list", [])
            .readOnly("_map", options.idCallback ? {} : null)
            .readOnly("_validateItem", validateItem)
            .readOnly("onChange");
    }

    private _hasID(): void {
        if (!this._idCallback) {
            throw new Error("No id callback defined");
        }
    }

    private _onChange(data: Record<string, V | undefined>): void {
        const { added, removed } = changeDiff(this, data);

        for (const add of added) {
            this._list.push(add.item);
            this.api.eventBus.emit(this, "add", add);
        }

        for (const remove of removed) {
            const index = this._list.indexOf(remove.item);
            if (index !== -1) this._list.splice(index, 1);
            this.api.eventBus.emit(this, "remove", remove);
        }
    }

    protected override async _listen(on: boolean): Promise<void> {
        const m = on ? "resourceOn" : "resourceOff";
        this[m]("change", this.onChange);
    }

    protected override _shouldPromoteKey(key: string, value: V): boolean {
        return !this._validateItem(value) && super._shouldPromoteKey(key, value);
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

    _add(item: V, index: number): void {
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

    _remove(index: number): V | undefined {
        const item = this._list[index];
        if (item !== undefined) {
            this._list.splice(index, 1);

            if (this._idCallback) {
                delete this._map![this._idCallback(item)];
            }
        }

        return item;
    }

    at(index: number): V | undefined {
        return this._list[index];
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every | Array#every } */
    every<T extends V, ThisArg = ResCollectionModel<V>>(predicate: (value: V, index: number, array: Array<V>) => value is T, thisArg?: ThisArg): this is Array<T>;
    every<ThisArg = ResCollectionModel<V>>(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): boolean;
    every(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: unknown): boolean {
        return this.toArray().every(predicate, thisArg);

    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter | Array#filter } */
    filter<S extends V, ThisArg = ResCollectionModel<V>>(predicate: (this: ThisArg, value: V, index: number, array: Array<V>) => value is S, thisArg?: ThisArg): Array<S>;
    filter<ThisArg = ResCollectionModel<V>>(predicate: (this: ThisArg, value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): Array<V>;
    filter(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: unknown): Array<V> {
        return this.toArray().filter(predicate, thisArg) ;
    }

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find | Array#find } */
    find<S extends V, ThisArg = ResCollectionModel<V>>(predicate: (this: ThisArg, value: V, index: number, obj: Array<V>) => value is S, thisArg?: ThisArg): S | undefined;
    find<ThisArg = ResCollectionModel<V>>(predicate: (this: ThisArg, value: V, index: number, obj: Array<V>) => unknown, thisArg?: ThisArg): V | undefined;
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
    first(amount?: undefined): V | undefined;
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

    getOrThrow(id: string | number): V {
        const item = this.get(id);
        if (item === undefined) {
            throw new TypeError(`${id} not found in ${this.rid}`);
        }

        return item;
    }

    has(item: V): boolean {
        return this._list.includes(item);
    }

    hasKey(key: string | number): boolean {
        this._hasID();
        return key in this._map!;
    }

    indexOf(item: V): number {
        return this._list.indexOf(item);
    }

    override async init(data?: Record<string, V> | undefined): Promise<this> {
        await super.init(data);
        if (data) {
            for (const key of Object.keys(data)) {
                this._list.push(data[key]!);
            }
        }

        return this;
    }

    /**
     * Get the last element, or last X elements if a number is provided.
     * @param amount The amount of elements to get.
     */
    last(amount?: undefined): V | undefined;
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

    /** See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some | Array#some } */
    some<ThisArg = ResCollectionModel<V>>(predicate: (value: V, index: number, array: Array<V>) => unknown, thisArg?: ThisArg): boolean {
        return this.toArray().some(predicate, thisArg);
    }

    /** Get the values of this collection as an array. */
    toArray(): Array<V> {
        return Array.from(this._list);
    }
}
