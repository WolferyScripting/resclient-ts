import Properties from "../util/Properties.js";
import { type ErrorData } from "../util/resgate.js";

export default class ResError extends Error {
    code?: string;
    data?: unknown;
    method?: string;
    override name = "ResError";
    params?: unknown;
    rid!: string;
    constructor(rid: string, method?: string, params?: unknown) {
        super();
        Properties.of(this)
            .define("data", true, false, true)
            .readOnly("params", params)
            .define("code", true, true, true)
            .define("method", false, true, true, method)
            .define("message", true, true, true)
            .define("rid", false, true, true, rid);
    }

    init(err: Partial<ErrorData> & { data?: unknown; }) {
        this.code = err.code || "system.unknownError";
        this.data = err.data || "Unknown Error";
        this.message = err.message ?? "Unknown Error";

        return this;
    }
}
