export default class Properties {
    target: object;
    constructor(target: object) {
        this.target = target;
    }

    static of(target: object): Properties {
        return new Properties(target);
    }

    define(key: string, writable = true, enumerable = false, configurable = true, value?: unknown): this {
        Object.defineProperty(this.target, key, {
            writable,
            enumerable,
            configurable,
            ...(value === undefined ? {} : { value })
        });

        return this;
    }

    readOnly(key: string, value?: unknown): this {
        return this.define(key, false, undefined, undefined, value);
    }

    readOnlyBulk(...keys: Array<string | [key: string, value?: unknown]>): this {
        for (const key of keys) {
            this.readOnly(...Array.isArray(key) ? key : [key] as [string]);
        }

        return this;
    }

    writable(key: string, value?: unknown): this {
        return this.define(key, true, undefined, undefined, value);
    }

    writableBulk(...keys: Array<string | [key: string, value?: unknown]>): this {
        for (const key of keys) {
            this.writable(...(Array.isArray(key) ? key : [key] as [string]));
        }

        return this;
    }
}
