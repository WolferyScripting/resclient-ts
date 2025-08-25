/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */

import type ResModel from "../../models/ResModel.js";
import type { AnyClass, AnyObject } from "../../util/types.js";
import type ResCollection from "../../models/ResCollection.js";
import ResError from "../../models/ResError.js";
import { DefinitionAssertionError, InvalidPropertyValueError } from "../../util/errors.js";
import ResRef from "../../models/ResRef.js";

export function equal(a: unknown, b: unknown): boolean {
    // Check if a is a non-object
    if (a === null || typeof a !== "object") {
        return a === b;
    }

    // Make sure b is also an object
    if (b === null || typeof b !== "object") {
        return false;
    }

    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();

    if (ak.length !== bk.length) {
        return false;
    }
    for (let i = 0, k: string; (k = ak[i]!); i++) {
        if (k !== bk[i]) {
            return false;
        }

        if (!equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
            return false;
        }
    }

    return true;
}
export const TYPES = {
    "any": {
        default(): null {
            return  null;
        },
        assert(_v: unknown): void {},
        fromString(v: string): string {
            return v;
        }
    },
    "string": {
        default(): string {
            return "";
        },
        assert(v: unknown): void {
            if (typeof v !== "string") {
                throw new DefinitionAssertionError("string", v);
            }
        },
        fromString: String
    },
    "?string": {
        default(): null {
            return null;
        },
        assert(v: unknown): void {
            if (typeof v !== "string" && v !== null) {
                throw new DefinitionAssertionError("string or null", v);
            }
        },
        fromString: (v: string | null): string | null => v
    },
    "number": {
        default(): number {
            return 0;
        },
        assert(v: unknown): void {
            if (typeof v !== "number") {
                throw new DefinitionAssertionError("number", v);
            }
        },
        fromString(v: string | number): number {
            v = Number(v);
            if (isNaN(v)) {
                throw new DefinitionAssertionError("number", v);
            }
            return v;
        }
    },
    "?number": {
        default(): null {
            return null;
        },
        assert(v: unknown): void {
            if (typeof v !== "number" && v !== null) {
                throw new DefinitionAssertionError("number or null", v);
            }
        },
        fromString(v: string | number | null): number | null {
            v = !v || String(v).toLowerCase() === "null" ? null : Number(v);
            if (v !== null && isNaN(v)) {
                throw new DefinitionAssertionError("number or null", v);
            }
            return v;
        }
    },
    "boolean": {
        default(): boolean {
            return false;
        },
        assert(v: unknown): void {
            if (typeof v !== "boolean") {
                throw new DefinitionAssertionError("boolean", v);
            }
        },
        fromString(v: string | boolean): boolean {
            v = String(v).toLowerCase();
            if (v === "true" || v === "1" || v === "yes") {
                v = true;
            } else if (v === "false" || v === "0" || v === "no") {
                v = false;
            } else {
                throw new DefinitionAssertionError("boolean", v);
            }
            return v;
        }
    },
    "?boolean": {
        default(): null {
            return null;
        },
        assert(v: unknown): void {
            if (typeof v !== "boolean" && v !== null) {
                throw new DefinitionAssertionError("boolean or null", v);
            }
        },
        fromString(v: string | boolean | null): boolean | null {
            v = String(v).toLowerCase();
            switch (v) {
                case "true":
                case "1":
                case "yes": {
                    return true;
                }

                case "false":
                case "0":
                case "no": {
                    return false;
                }

                case "null": {
                    return null;
                }
                default: {
                    throw new DefinitionAssertionError("boolean or null", v);
                }
            }
        }
    },
    "object": {
        default(): AnyObject {
            return {};
        },
        assert(v: unknown): void {
            if (typeof v !== "object" || v === null) {
                throw new DefinitionAssertionError("object", v);
            }
        },
        fromString(v: string): AnyObject {
            return JSON.parse(v) as AnyObject;
        }
    },
    "?object": {
        default(): null {
            return null;
        },
        assert(v: unknown): void {
            if (typeof v !== "object") {
                throw new DefinitionAssertionError("object or null", v);
            }
        },
        fromString(v: string): AnyObject | null {
            if (v === "null") {
                return null;
            }
            return JSON.parse(v) as AnyObject;
        }
    },
    "array": {
        default(): Array<unknown> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v)) {
                throw new DefinitionAssertionError("array", v);
            }
        },
        fromString(v: string): Array<unknown> {
            return JSON.parse(v) as Array<unknown>;
        }
    },
    "?array": {
        default(): Array<unknown> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v) && v !== null) {
                throw new DefinitionAssertionError("array or null", v);
            }
        },
        fromString(v: string): Array<unknown> | null {
            if (v === "null") {
                return null;
            }
            return JSON.parse(v) as Array<unknown>;
        }
    },
    "array[string]": {
        default(): Array<string> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v)) {
                throw new DefinitionAssertionError("array of strings", v);
            }
            if (!v.every(e => typeof e === "string")) {
                throw new DefinitionAssertionError("array of only strings", v);
            }
        },
        fromString(v: string): Array<string> {
            return JSON.parse(v) as Array<string>;
        }
    },
    "?array[string]": {
        default(): Array<string> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v) && v !== null) {
                throw new DefinitionAssertionError("array of strings or null", v);
            }
            if (v && !v.every(e => typeof e === "string")) {
                throw new DefinitionAssertionError("array of only strings", v);
            }
        },
        fromString(v: string): Array<string> | null {
            if (v === "null") {
                return null;
            }
            return JSON.parse(v) as Array<string>;
        }
    },
    "array[number]": {
        default(): Array<number> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v)) {
                throw new DefinitionAssertionError("array of numbers", v);
            }
            if (!v.every(e => typeof e === "number")) {
                throw new DefinitionAssertionError("array of only numbers", v);
            }
        },
        fromString(v: string): Array<number> {
            return JSON.parse(v) as Array<number>;
        }
    },
    "?array[number]": {
        default(): Array<number> {
            return [];
        },
        assert(v: unknown): void {
            if (!Array.isArray(v) && v !== null) {
                throw new DefinitionAssertionError("array of numbers or null", v);
            }
            if (v && !v.every(e => typeof e === "number")) {
                throw new DefinitionAssertionError("array of only numbers", v);
            }
        },
        fromString(v: string): Array<number> | null {
            if (v === "null") {
                return null;
            }
            return JSON.parse(v) as Array<number>;
        }
    },
    "function": {
        // eslint-disable-next-line unicorn/consistent-function-scoping
        default(): () => void {
            return (): void => {};
        },
        assert(v: unknown): void {
            if (typeof v !== "function") {
                throw new DefinitionAssertionError("function", v);
            }
        },
        fromString(_v: unknown): void {} // Evaluating functions from strings is not allowed

    },
    "?function": {
        default(): null {
            return null;
        },
        assert(v: unknown): void {
            if (typeof v !== "function" && v !== null) {
                throw new DefinitionAssertionError("function or null", v);
            }
        },
        fromString(_v: unknown): void {} // Evaluating functions from strings is not allowed

    }
} satisfies Record<string, TypeDefinition>;

export interface TypeDefinition {
    assert(val: unknown): void;
    default(): unknown;
    fromString(val: string): unknown;
}
export interface PropertyDefinition {
    default?: unknown;
    property?: string;
    type: keyof typeof TYPES;
    assert?(val: unknown): void;
    filter?(val: unknown): PropertyDefinition;
}

/* eslint-disable @typescript-eslint/ban-types */
export interface DefinitionTypeMap {
    "?array": Array<unknown> | null;
    "?array[number]": Array<number> | null;
    "?array[string]": Array<string> | null;
    "?boolean": boolean | null;
    "?function": Function | null;
    "?number": number | null;
    "?object": object | null;
    "?string": string | null;
    "any": unknown;
    "array": Array<unknown>;
    "array[number]": Array<number>;
    "array[string]": Array<string>;
    "boolean": boolean;
    "function": Function;
    "number": number;
    "object": object;
    "string": string;
}
/* eslint-enable @typescript-eslint/ban-types */

/**
 * Updates an target object from a source object based upon a definition
 * @param target Target object
 * @param source Source object
 * @param def Definition object which is a key/value object where the key is the property and the value is the property type or a property definition.
 * @param strict Strict flag. If true, exceptions will be thrown on errors. If false, errors will be ignored. Default is true.
 * @returns Key/value object where the key is the updated properties and the value is the old values.
 */
export function update(target: object, source: object, def: Record<string, PropertyDefinition | keyof typeof TYPES>, strict = true): AnyObject | null {
    if (!def || typeof def !== "object") {
        throw new Error("Invalid definition");
    }

    let updated = false;
    const updateObj = {} as AnyObject;

    // eslint-disable-next-line guard-for-in
    for (const key in def) {
        let d = def[key]!;
        if (typeof d === "string") {
            d = {
                type: d
            };
        }

        const t = TYPES[d.type];
        if (!t) {
            throw new Error("Invalid definition type: " + d.type);
        }

        const tkey = Object.hasOwn(d, "property") && d.property ? d.property : key;

        // Check if target has any value set. If not, use default.
        if (!Object.hasOwn(target, tkey)) {
            updated = true;
            updateObj[tkey] = undefined;
            (target as Record<string, unknown>)[tkey] = (Object.hasOwn(d, "default") && d.default ? d.default : t.default()) as never;
        }

        // Check if source has value for the property. If not, continue to next property.
        if (!Object.hasOwn(source, key)) {
            continue;
        }

        let v = (source as Record<string, unknown>)[key];
        if (v === undefined) {
            continue;
        }

        try {
            // Convert from string
            if (typeof v === "string") {
                v = t.fromString(v);
            }

            // Apply filter to value
            if (d.filter) {
                v = d.filter(v);
            }

            // Type assertion
            t.assert(v);

            // Definition assertion
            if (d.assert) {
                d.assert(v);
            }

            // Check if the property value differs and set it as updated
            if ((target as Record<string, unknown>)[tkey] !== v) {
                updated = true;
                updateObj[tkey] = (target as Record<string, unknown>)[tkey];
                (target as Record<string, unknown>)[tkey] = v as never;
            }
        } catch (ex) {
            if (strict) {
                throw ex;
            }
        }
    }

    if (!updated) {
        return null;
    }

    return updateObj;
}

/**
 * Copies a source object based upon a definition
 * @param source Source object
 * @param def Definition object which is a key/value object where the key is the property and the value is the value type.
 * @param strict Strict flag. If true, exceptions will be thrown on errors. If false, errors will be ignored. Default is false.
 * @returns Copy of the object
 */
export function copy<T extends AnyObject>(source: T, def: Record<string, PropertyDefinition | keyof typeof TYPES>, strict = false): T {
    const obj = {} as T;
    update(obj, source, def, strict);
    return obj;
}

export function modelProperty(property: string, model: AnyClass<ResModel>, optional = false, error = false): PropertyDefinition {
    return {
        property,
        type: optional ? "?object" : "object",
        assert(value: unknown): void {
            if (optional && value === null) return;
            if (error && value instanceof ResError) return;
            if (value instanceof model) return;
            throw new InvalidPropertyValueError(property, `instance of ${model.name}`, value);
        }
    };
}

export function collectionProperty(property: string, model: AnyClass<ResCollection>, optional = false, error = false): PropertyDefinition {
    return {
        type: optional ? "?object" : "object",
        assert(value: unknown): void {
            if (optional && value === null) return;
            if (error && value instanceof ResError) return;
            if (value instanceof model) return;
            throw new InvalidPropertyValueError(property, `instance of ${model.name}`, value);
        }
    };
}

export function refProperty(property: string, optional = false, error = false): PropertyDefinition {
    return {
        property,
        type: optional ? "?object" : "object",
        assert(value: unknown): void {
            if (optional && value === null) return;
            if (error && value instanceof ResError) return;
            if (value instanceof ResRef) return;
            throw new InvalidPropertyValueError(property, "instance of ResRef", value);
        }
    };
}
