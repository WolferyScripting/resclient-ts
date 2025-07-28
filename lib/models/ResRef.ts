import type ResClient from "./ResClient.js";
import type ResCollection from "./ResCollection.js";
import type ResError from "./ResError.js";
import type ResModel from "./ResModel.js";
import Properties from "../util/Properties.js";

export default class ResRef<T = ResModel | ResCollection | ResError> {
    private api!: ResClient;
    rid!: string;
    constructor(api: ResClient, rid: string) {
        Properties.of(this)
            .readOnly("api", api)
            .define("rid", false, true, true, rid);
    }

    equals(o: ResRef) {
        return o instanceof ResRef && o.api === this.api && o.rid === this.rid;
    }

    get() {
        return this.api.get<T>(this.rid);
    }

    toJSON() {
        return { rid: this.rid };
    }
}
