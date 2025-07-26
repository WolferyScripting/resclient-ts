// I'm done playing guessing games for what this thing's type should be
/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment */
import type ResClient from "./ResClient.js";

export type ItemFactory<T = unknown> = (api: ResClient, rid: string, data?: Record<string, unknown>) => T;
export default class TypeList<T = unknown> {
    factory: ItemFactory<T>;
    root: any = {};
    constructor(factory: ItemFactory<T>) {
        this.factory = factory;
    }

    private _match(token: Array<string>, index: number, root: TypeList["root"]): false | ItemFactory<T> {
        const t = token[index++];
        let c = 2;
        let n = root.nodes ? root.nodes[t] : undefined;
        while (c--) {
            if (n) {
                if (token.length === index) {
                    if (n.factory) {
                        return n.factory;
                    }
                } else {
                    const f = this._match(token, index, n);
                    if (f) {
                        return f;
                    }
                }
            }
            n = root.pwc;
        }
        n = root.fwc;
        return n && n.factory;
    }

    addFactory(pattern: string, factory: ItemFactory<T>) {
        const tokens = pattern.split(".");
        let l = this.root;
        let n: { factory?: ItemFactory<T>; };
        let sfwc = false;

        for (const t of tokens) {
            const lt = t.length;
            if (!lt || sfwc) {
                throw new Error("Invalid pattern");
            }

            if (lt > 1) {
                if (l.nodes) {
                    n = l.nodes[t] = l.nodes[t] || {};
                } else {
                    l.nodes = {};
                    n = l.nodes[t] = {};
                }
            } else {
                if (t[0] === "*") {
                    n = l.pwc = l.pwc || {};
                } else if (t[0] === ">") {
                    n = l.fwc = l.fwc || {};
                    sfwc = true;
                } else if (l.nodes) {
                    n = l.nodes[t] = l.nodes[t] || {};
                } else {
                    l.nodes = {};
                    n = l.nodes[t] = {};
                }
            }
            l = n;
        }

        if (l.factory) {
            throw new Error("Pattern already registered");
        }

        l.factory = factory;
    }

    getFactory(rid: string) {
        const tokens = rid.replace(/\?.*$/, "").split(".");
        return this._match(tokens, 0, this.root) || this.factory;
    }

    removeFactory(pattern: string) {
        const tokens = pattern.split(".");
        let l = this.root;
        let n;
        let sfwc = false;
        let lt;

        for (const t of tokens) {
            n = null;
            lt = t.length;
            if (lt && !sfwc) {
                if (lt > 1) {
                    if (l.nodes) {
                        n = l.nodes[t];
                    }
                } else {
                    if (t[0] === "*") {
                        n = l.pwc;
                    } else if (t[0] === ">") {
                        n = l.fwc;
                        sfwc = true;
                    } else if (l.nodes) {
                        n = l.nodes[t];
                    }
                }
            }

            if (!n) {
                return;
            }
            l = n;
        }

        const f = l.factory;
        delete l.factory;
        return f;
    }
}
