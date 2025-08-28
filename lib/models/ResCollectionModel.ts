import type ResClient from "./ResClient.js";
import ResModel, { type ResModelResourceEvents, type ResModelOptions } from "./ResModel.js";
import { changeDiff } from "../util/util.js";
import Properties from "../util/Properties.js";

export interface ResCollectionModelEvents<T = unknown> {
    add: [data: CollectionModelAddRemove<T>];
    remove: [data: CollectionModelAddRemove<T>];
}
export interface CollectionModelAddRemove<T = unknown> { item: T; key: string; }
export default class ResCollectionModel<T = unknown, ResourceEvents extends { [K in keyof ResourceEvents]: Array<unknown> } = ResModelResourceEvents<Record<string, T>>, ModelEvents extends { [K in keyof ModelEvents]: Array<unknown> } = ResCollectionModelEvents<T>> extends ResModel<Record<string, T>, ResourceEvents, ModelEvents> {
    private onChange = this._onChange.bind(this);
    protected _list!: Array<T>;
    protected _validateItem!: (item: T) => boolean;
    constructor(api: ResClient, rid: string, validateItem: (item: T) => boolean, options?: Omit<ResModelOptions, "definition">) {
        super(api, rid, options);
        Properties.of(this)
            .writable("_list", [])
            .readOnly("_validateItem", validateItem);
    }

    private _onChange(data: Record<string, T | undefined>): void {
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

    protected override _shouldPromoteKey(key: string, value: T): boolean {
        return !this._validateItem(value) && super._shouldPromoteKey(key, value);
    }

    get list(): Array<T> {
        return Object.values(this.props);
    }

    get(key: string): T | undefined {
        return this.props[key];
    }
}
