import type ResClient from "./ResClient.js";
import Properties from "../util/Properties.js";
import { type AnyRes } from "../util/types.js";

export default class ResRef<T extends AnyRes = AnyRes> {
    private api!: ResClient;
    rid!: string;
    constructor(api: ResClient, rid: string) {
        this.p
            .readOnly("api", api)
            .define("rid", false, true, true, rid);
    }

    protected get p(): Properties {
        return Properties.of(this);
    }

    equals(o: ResRef): boolean {
        return o instanceof ResRef && o.api === this.api && o.rid === this.rid;
    }

    get(): Promise<T> {
        return this.api.get<T>(this.rid);
    }

    toJSON(): Record<"rid", string> {
        return { rid: this.rid };
    }
}
