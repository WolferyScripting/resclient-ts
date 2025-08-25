import type ResClient from "./ResClient.js";
import ResModel, { type ResModelOptions } from "./ResModel.js";
import type ResRef from "./ResRef.js";
import { changeDiff } from "../util/util.js";
import Properties from "../util/Properties.js";
import type { AnyClass } from "../util/types.js";

export type ModelTypeUnion<T> = T extends ResModel | ResRef ? AnyClass<T> : never;
export default class ResCollectionModel<T extends ResModel | ResRef = ResModel | ResRef> extends ResModel<Record<string, T>> {
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

        for (const item of added) {
            this._list.push(item);
            this.api.eventBus.emit(this, "add", item);
        }

        for (const item of removed) {
            const index = this._list.indexOf(item);
            if (index !== -1) this._list.splice(index, 1);
            this.api.eventBus.emit(this, "remove", item);
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
