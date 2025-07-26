/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
export function equal(a: unknown, b: unknown) {
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
    for (let i = 0, k: string; (k = ak[i]); i++) {
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
        default() {
            return  null;
        },
        assert(_v: unknown) {},
        fromString(v: string) {
            return v;
        }
    },
    "string": {
        default() {
            return "";
        },
        assert(v: unknown) {
            if (typeof v !== "string") {
                throw new TypeError("Not a string");
            }
        },
        fromString: String
    },
    "?string": {
        default() {
            return null;
        },
        assert(v: unknown) {
            if (typeof v !== "string" && v !== null) {
                throw new Error("Not a string or null");
            }
        },
        fromString: String // Not possible to set null
    },
    "number": {
        default() {
            return 0;
        },
        assert(v: unknown) {
            if (typeof v !== "number") {
                throw new TypeError("Not a number");
            }
        },
        fromString(v: string | number) {
            v = Number(v);
            if (isNaN(v)) {
                throw new TypeError("Not a number format");
            }
            return v;
        }
    },
    "?number": {
        default() {
            return null;
        },
        assert(v: unknown) {
            if (typeof v !== "number" && v !== null) {
                throw new Error("Not a number or null");
            }
        },
        fromString(v: string | number | null) {
            v = !v || String(v).toLowerCase() === "null" ? null : Number(v);
            if (v !== null && isNaN(v)) {
                throw new TypeError("Not a number format");
            }
            return v;
        }
    },
    "boolean": {
        default() {
            return false;
        },
        assert(v: unknown) {
            if (typeof v !== "boolean") {
                throw new TypeError("Not a boolean");
            }
        },
        fromString(v: string | boolean) {
            v = String(v).toLowerCase();
            if (v === "true" || v === "1" || v === "yes") {
                v = true;
            } else if (v === "false" || v === "0" || v === "no") {
                v = false;
            } else {
                throw new Error("Not a boolean format");
            }
            return v;
        }
    },
    "?boolean": {
        default() {
            return null;
        },
        assert(v: unknown) {
            if (typeof v !== "boolean" && v !== null) {
                throw new Error("Not a boolean or null");
            }
        },
        fromString(v: string | boolean | null) {
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
                    throw new Error("Not a nullable boolean format");
                }
            }
        }
    },
    "object": {
        default() {
            return {};
        },
        assert(v: unknown) {
            if (typeof v !== "object" || v === null) {
                throw new Error("Not an object");
            }
        },
        fromString(v: string) {
            return JSON.parse(v) as unknown;
        }
    },
    "?object": {
        default() {
            return null;
        },
        assert(v: unknown) {
            if (typeof v !== "object") {
                throw new TypeError("Not an object or null");
            }
        },
        fromString(v: string) {
            return JSON.parse(v) as unknown;
        }
    },
    "function": {
        // eslint-disable-next-line unicorn/consistent-function-scoping
        default() {
            return () => {};
        },
        assert(v: unknown) {
            if (typeof v !== "function") {
                throw new TypeError("Not a function");
            }
        },
        fromString(_v: unknown) {} // Evaluating functions from strings is not allowed

    },
    "?function": {
        default() {
            return null;
        },
        assert(v: unknown) {
            if (typeof v !== "function" && v !== null) {
                throw new Error("Not a function or null");
            }
        },
        fromString(_v: unknown) {} // Evaluating functions from strings is not allowed

    }
};


export interface PropertyDefinition {
    default?: unknown;
    property?: string;
    type: keyof typeof TYPES;
    assert?(val: unknown): void;
    filter?(val: unknown): PropertyDefinition;
}
/**
 * Updates an target object from a source object based upon a definition
 * @param {object} target Target object
 * @param {object} source Source object
 * @param {Object.<string, string|func/obj~PropertyDefinition>} def Definition object which is a key/value object where the key is the property and the value is the property type or a property definition.
 * @param {boolean} strict Strict flag. If true, exceptions will be thrown on errors. If false, errors will be ignored. Default is true.
 * @returns {?Object.<string, *>} Key/value object where the key is the updated properties and the value is the old values.
 */
export function update(target: object, source: object, def: Record<string, PropertyDefinition | keyof typeof TYPES>, strict = true) {
    if (!def || typeof def !== "object") {
        throw new Error("Invalid definition");
    }

    let updated = false;
    const updateObj = {} as Record<string, unknown>;

    // eslint-disable-next-line guard-for-in
    for (const key in def) {
        let d = def[key];
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
 * @param {object} source Source object
 * @param {object} def Definition object which is a key/value object where the key is the property and the value is the value type.
 * @param {boolean} strict Strict flag. If true, exceptions will be thrown on errors. If false, errors will be ignored. Default is false.
 * @returns {object} Copy of the object
 */
export function copy<T extends Record<string, unknown>>(source: T, def: Record<string, PropertyDefinition | keyof typeof TYPES>, strict = false) {
    const obj = {} as T;
    update(obj, source, def, strict);
    return obj;
}
