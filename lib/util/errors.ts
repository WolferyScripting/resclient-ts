import { format } from "node:util";

export class UpdateError extends Error {
    override name = "UpdateError";
    rid: string;
    constructor(rid: string, err: Error) {
        super(`Update for ${rid} failed`, { cause: err });
        this.rid = rid;
    }
}

export class DefinitionAssertionError extends Error {
    expected: string;
    override name = "DefinitionAssertionError";
    value: unknown;
    constructor(expected: string, value: unknown, message?: string) {
        super(message ?? `Expected ${expected}, got ${format(value)}`);
        this.expected = expected;
        this.value = value;
    }
}

export class InvalidPropertyValueError extends DefinitionAssertionError {
    override name = "InvalidPropertyValueError";
    property: string;
    constructor(property: string, expected: string, value: unknown) {
        super(expected, value, `Expected ${expected} for ${property}, got ${format(value)}`);
        this.property = property;
    }
}
