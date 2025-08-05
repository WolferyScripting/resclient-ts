import type ResClient from "./ResClient.js";
import ResModel, { type ResModelOptions } from "./ResModel.js";
import type ResRef from "./ResRef.js";
import { changeDiff } from "../util/util.js";
import Properties from "../util/Properties.js";
import type { AnyClass, AnyObject } from "../util/types.js";

export type ModelTypeUnion<T> = T extends ResModel | ResRef ? AnyClass<T> : never;
export default class ResCollectionModel<T extends ResModel | ResRef = ResModel | ResRef> extends ResModel {
    private onChange = this._onChange.bind(this);
    protected _list!: Array<T>;
    protected _modelTypes!: Array<ModelTypeUnion<T>>;
    constructor(api: ResClient, rid: string, modelTypes: ModelTypeUnion<T> | Array<ModelTypeUnion<T>>, options?: ResModelOptions) {
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

    protected override _shouldPromoteKey(key: string, value: unknown): boolean {
        return !this._modelTypes.some(type => value instanceof type) && super._shouldPromoteKey(key, value);
    }

    get list(): Array<T> {
        return Object.values(this.props as Record<string, T>);
    }

    override dispose(): void {
        super.dispose();
        this.resourceOff("change", this.onChange);
    }

    override init(data?: AnyObject | undefined): this {
        super.init(data);
        this.resourceOn("change", this.onChange);
        return this;
    }
}
