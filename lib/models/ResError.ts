import type ResClient from "./ResClient.js";
import { ErrorCodes } from "../Constants.js";
import Properties from "../util/Properties.js";
import type { ErrorData } from "../util/types.js";

export default class ResError extends Error {
    code?: string;
    data?: unknown;
    method?: string;
    override name = "ResError";
    params?: unknown;
    rid!: string;
    constructor(api: ResClient, rid: string, method?: string, params?: unknown) {
        super();
        Properties.of(this)
            .readOnly("api", api)
            .define("data", true, false, true)
            .readOnly("params", params)
            .define("code", true, true, true)
            .define("method", false, true, true, method)
            .define("message", true, true, true)
            .define("rid", false, true, true, rid);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async _listen(on: boolean): Promise<void> {
        // empty
    }

    async dispose(): Promise<void> {
        await this._listen(false);
    }

    async init(err: Partial<ErrorData> & { data?: unknown; }): Promise<this> {
        this.code = err.code || ErrorCodes.UNKNOWN;
        this.data = err.data || {};
        this.message = err.message ?? "Unknown Error";

        return this;
    }
}
