import type ResClient from "./ResClient.js";
import ResModel, { type ResModelResourceEvents, type ResModelOptions } from "./ResModel.js";
import type ResRef from "./ResRef.js";
import { changeDiff } from "../util/util.js";
import Properties from "../util/Properties.js";
import type { AnyClass } from "../util/types.js";

export interface ResCollectionModelEvents<T extends ResModel | ResRef> {
    add: [data: CollectionModelAddRemove<T>];
    remove: [data: CollectionModelAddRemove<T>];
}
export interface CollectionModelAddRemove<T extends ResModel | ResRef> { item: T; key: string; }
export type ModelTypeUnion<T> = T extends ResModel | ResRef ? AnyClass<T> : never;
export default class ResCollectionModel<T extends ResModel | ResRef = ResModel | ResRef, ResourceEvents extends { [K in keyof ResourceEvents]: Array<unknown> } = ResModelResourceEvents<Record<string, T>>, ModelEvents extends { [K in keyof ModelEvents]: Array<unknown> } = ResCollectionModelEvents<T>> extends ResModel<Record<string, T>, ResourceEvents, ModelEvents> {
    private onChange = this._onChange.bind(this);
    protected _list!: Array<T>;
    protected _modelTypes!: Array<ModelTypeUnion<T>>;
    constructor(api: ResClient, rid: string, modelTypes: ModelTypeUnion<T> | Array<ModelTypeUnion<T>>, options?: Omit<ResModelOptions, "definition">) {
        super(api, rid, options);
        Properties.of(this)
            .writable("_list", [])
            .readOnly("_modelTypes", Array.isArray(modelTypes) ? modelTypes : [modelTypes]);
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

    protected override _shouldPromoteKey(key: string, value: unknown): boolean {
        return !this._modelTypes.some(type => value instanceof type) && super._shouldPromoteKey(key, value);
    }

    get list(): Array<T> {
        return Object.values(this.props);
    }

    get(key: string): T | undefined {
        return this.props[key];
    }
}
