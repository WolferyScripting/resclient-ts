export default class UpdateError extends Error {
    override name = "UpdateError";
    rid: string;
    constructor(rid: string, err: Error) {
        super(`Update for ${rid} failed`, { cause: err });
        this.rid = rid;
    }
}
