import { States } from "../lib/Constants.js";
import { type Ref } from "../lib/util/resgate.js";
import type CacheItem from "../lib/models/CacheItem.js";
import ResClient from "../lib/models/ResClient.js";
import { type AnyObject } from "../lib/util/types.js";
import { expect } from "chai";


function expectRefState(refs: Record<string, Ref>, compare: Record<string, States>): void {
    const actual = {} as Record<string, keyof typeof States>;
    for (const k of Object.keys(refs)) {
        actual[k] = States[refs[k]!.st] as keyof typeof States;
    }

    const expected = {} as Record<string, keyof typeof States>;
    for (const k of Object.keys(compare)) {
        expected[k] = States[compare[k]!] as keyof typeof States;
    }

    expect(actual).to.deep.equal(expected);
}

function getRefState(dta: Record<string, Partial<CacheItem> & { refs?: Array<string>; subscribed?: boolean; }>, root: string): AnyObject<Ref> {
    // Prepare refs object
    const refs = { ...dta } as unknown as Record<string, {
        direct:     number;
        indirect:   number;
        item:       Array<string>;
        rid:        string;
        subscribed: boolean;
        type:       string;
    }>;
    for (const k of Object.keys(refs)) {
        refs[k] = {
            rid:        k,
            item:       dta[k]!.refs || [],
            subscribed: !!dta[k]!.subscribed,
            direct:     dta[k]!.direct || 0,
            indirect:   0,
            type:       "collection"
        };
    }
    // Add indirect references
    for (const k of Object.keys(refs)) {
        for (const v of refs[k]!.item) {
            refs[v]!.indirect++;
        }
    }

    const client = new ResClient("ws://localhost");
    client["_getRefItem"] = (v: string): never => refs[v as string] as never;

    const r = refs[root];
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(r).to.not.eq(undefined);
    const refState = client["_getRefState"](r as never);

    return refState;
}

describe("ResClient Garbage collection", () => {
    describe("stateDelete", () => {
        it("marks value without reference for deletion", () => {
            const rs = getRefState({ a: { refs: [] } }, "a");
            expectRefState(rs, { a: States.DELETE });
        });

        it("marks simple reference for deletion", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.DELETE
            });
        });

        it("marks chained reference for deletion", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["c"] },
                c: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.DELETE,
                c: States.DELETE
            });
        });

        it("marks complex reference for deletion", () => {
            const rs = getRefState({
                a: { refs: ["b", "c"] },
                b: { refs: ["d"] },
                c: { refs: ["d"] },
                d: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.DELETE,
                c: States.DELETE,
                d: States.DELETE
            });
        });
    });

    describe("stateKeep", () => {
        it("marks to keep subscribed root", () => {
            const rs = getRefState({ a: { refs: [], subscribed: true as never } }, "a");
            expectRefState(rs, {});
        });

        it("marks to keep root covered by other root", () => {
            const rs = getRefState({
                a: { refs: [] },
                b: { refs: ["a"] }
            }, "a");
            expectRefState(rs, { a: States.KEEP });
        });

        it("marks to keep reference covered by other root", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["d"] },
                c: { refs: ["d"] },
                d: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.DELETE,
                d: States.KEEP
            });
        });

        it("marks to keep reference tree covered by other root", () => {
            const rs = getRefState({
                a: { refs: ["b", "c"] },
                b: { refs: ["d"] },
                c: { refs: ["d"] },
                d: { refs: [] },
                e: { refs: ["b"] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.KEEP,
                c: States.DELETE,
                d: States.KEEP
            });
        });
    });

    describe("stale", () => {
        it("marks direct referenced item as stale", () => {
            const rs = getRefState({
                a: { refs: ["b", "c"] },
                b: { refs: ["c"], direct: 1 },
                c: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.STALE,
                c: States.KEEP
            });
        });

        it("marks direct referenced as keep if covered by another stale reference", () => {
            const rs = getRefState({
                a: { refs: ["b", "c"] },
                b: { refs: ["d"], direct: 1 },
                c: { refs: ["b"], direct: 1 },
                d: { refs: [] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.KEEP,
                c: States.STALE,
                d: States.KEEP
            });
        });
    });

    describe("cyclic reference", () => {
        it("marks simple cyclic reference for deletion", () => {
            const rs = getRefState({
                a: { refs: ["a"] }
            }, "a");
            expectRefState(rs, { a: States.DELETE });
        });

        it("marks to keep reference root when reference is covered by other root in cyclic tree", () => {
            const rs = getRefState({
                a: { refs: ["b", "d"] },
                b: { refs: ["c"] },
                c: { refs: ["a"] },
                d: { refs: [] },
                e: { refs: ["c"] }
            }, "a");
            expectRefState(rs, {
                a: States.KEEP,
                b: States.KEEP,
                c: States.KEEP,
                d: States.KEEP
            });
        });

        it("marks to keep cyclic group when one item is covered by other root", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["c"] },
                c: { refs: ["b"] },
                d: { refs: ["c"] }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.KEEP,
                c: States.KEEP
            });
        });

        it("marks directly referenced cyclic reference as stale", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["b"], direct: 1 }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.STALE
            });
        });

        it("marks only one reference in cyclic group as stale if multiple direct references exist", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["c"], direct: 1 },
                c: { refs: ["d"], direct: 1 },
                d: { refs: ["b"], direct: 1 }
            }, "a");
            expectRefState(rs, {
                a: States.DELETE,
                b: States.STALE,
                c: States.KEEP,
                d: States.KEEP
            });
        });

        it("marks none for deletion if any reference in a cycle is indirectly referenced from other root", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["a"] },
                c: { refs: ["b"] }
            }, "a");
            expectRefState(rs, {
                a: States.KEEP,
                b: States.KEEP
            });
        });

        it("marks stale references as keep if any reference in a cycle is indirectly referenced from other root", () => {
            const rs = getRefState({
                a: { refs: ["b"] },
                b: { refs: ["c"], direct: 1 },
                c: { refs: ["a"] },
                d: { refs: ["a"] }
            }, "a");
            expectRefState(rs, {
                a: States.KEEP,
                b: States.KEEP,
                c: States.KEEP
            });
        });
    });
});
