import { expect } from "chai";
import TypeList from "../lib/models/TypeList.js";

describe("TypeList", () => {
    let typeList: TypeList;
    const defaultFactory = () => {};
    const fa = () => {};
    const fb = () => {};

    beforeEach(() => {
        typeList = new TypeList(defaultFactory);
    });

    describe("addFactory", () => {
        it("adds a factory function without using wildcards", () => {
            typeList.addFactory("foo.bar", fa);
            typeList.addFactory("foo.baz", fa);
            typeList.addFactory("foo.bar.b", fa);
            typeList.addFactory("foo.b", fa);
            typeList.addFactory("foo.c", fa);
            typeList.addFactory("foo.b.baz", fa);
        });

        it("adds a factory function using * wildcard", () => {
            typeList.addFactory("foo.*", fa);
        });

        it("adds a factory function using > wildcard", () => {
            typeList.addFactory("foo.>", fa);
        });

        it("adds a factory function using only * wildcard", () => {
            typeList.addFactory("*", fa);
        });

        it("adds a factory function using only > wildcard", () => {
            typeList.addFactory(">", fa);
        });

        it("adds a factory function using multiple wildcards", () => {
            typeList.addFactory("foo.*.bar.*.*.baz.>", fa);
        });

        it("adds two factory functions with similar pattern", () => {
            typeList.addFactory("foo.*", fa);
            typeList.addFactory("foo.*.bar", fb);
        });

        it("throws error on empty token", () => {
            expect(() => {
                typeList.addFactory("foo..bar", fa);
            }).to.throw();
        });

        it("throws error on using > wildcard as non-last token", () => {
            expect(() => {
                typeList.addFactory("foo.>.bar", fa);
            }).to.throw();
        });

        it("throws error on adding the same pattern twice", () => {
            typeList.addFactory("foo.*.bar.*.*.baz.>", fa);
            expect(() => {
                typeList.addFactory("foo.*.bar.*.*.baz.>", fb);
            }).to.throw();
        });
    });

    describe("getFactory", () => {
        it("gets default factory function on empty list", () => {
            expect(typeList.getFactory("foo")).to.equal(defaultFactory);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
        });

        it("gets a factory function with single token", () => {
            typeList.addFactory("foo", fa);
            expect(typeList.getFactory("foo")).to.equal(fa);
            expect(typeList.getFactory("bar")).to.equal(defaultFactory);
        });

        it("gets a factory function without using wildcards", () => {
            typeList.addFactory("foo.b", fa);
            expect(typeList.getFactory("foo.b")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
        });

        it("gets a factory function using * wildcard", () => {
            typeList.addFactory("foo.*", fa);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
            expect(typeList.getFactory("foo.bar.baz")).to.equal(defaultFactory);
        });

        it("gets a factory function using > wildcard", () => {
            typeList.addFactory("foo.>", fa);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
            expect(typeList.getFactory("foo.bar.baz")).to.equal(fa);
        });

        it("gets a factory function using only * wildcard", () => {
            typeList.addFactory("*", fa);
            expect(typeList.getFactory("foo")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
        });

        it("gets a factory function using only > wildcard", () => {
            typeList.addFactory(">", fa);
            expect(typeList.getFactory("foo")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
        });

        it("gets default factory function on partial match", () => {
            typeList.addFactory("foo.bar", fa);
            expect(typeList.getFactory("foo")).to.equal(defaultFactory);
        });
    });

    describe("removeFactory", () => {
        it("gets default factory function after removing without wildcard", () => {
            typeList.addFactory("foo", fa);
            expect(typeList.removeFactory("foo")).to.equal(fa);
            expect(typeList.getFactory("foo")).to.equal(defaultFactory);

            typeList.addFactory("foo.bar", fa);
            expect(typeList.removeFactory("foo.bar")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
        });

        it("gets default factory function after removing * wildcard", () => {
            typeList.addFactory("foo.*", fa);
            typeList.addFactory("foo.bar.*", fb);
            expect(typeList.removeFactory("foo.*")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
            expect(typeList.getFactory("foo.bar.baz")).to.equal(fb);
        });

        it("gets default factory function after removing > wildcard", () => {
            typeList.addFactory("foo.>", fa);
            expect(typeList.removeFactory("foo.>")).to.equal(fa);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
            expect(typeList.getFactory("foo.bar.baz")).to.equal(defaultFactory);
        });

        it("gets a default factory function removing only * wildcard", () => {
            typeList.addFactory("*", fa);
            expect(typeList.removeFactory("*")).to.equal(fa);
            expect(typeList.getFactory("foo")).to.equal(defaultFactory);
        });

        it("gets a default factory function removing only > wildcard", () => {
            typeList.addFactory(">", fa);
            expect(typeList.removeFactory(">")).to.equal(fa);
            expect(typeList.getFactory("foo")).to.equal(defaultFactory);
            expect(typeList.getFactory("foo.bar")).to.equal(defaultFactory);
        });

        it("gets factory function on match after removing longer pattern", () => {
            typeList.addFactory("foo", fa);
            typeList.addFactory("foo.bar", fb);
            expect(typeList.removeFactory("foo.bar")).to.equal(fb);
            expect(typeList.getFactory("foo")).to.equal(fa);
        });
    });

    describe("factory priority", () => {
        it("matches text before * wildcard", () => {
            typeList.addFactory("foo.bar", fa);
            typeList.addFactory("foo.*", fb);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
        });

        it("matches text before > wildcard", () => {
            typeList.addFactory("foo.bar", fa);
            typeList.addFactory("foo.>", fb);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
        });

        it("matches * wildcard before > wildcard", () => {
            typeList.addFactory("foo.*", fa);
            typeList.addFactory("foo.>", fb);
            expect(typeList.getFactory("foo.bar")).to.equal(fa);
        });

        it("matches tokens with priority left to right", () => {
            typeList.addFactory("foo.bar.>", fa);
            typeList.addFactory("foo.*.baz", fb);
            typeList.addFactory("foo.>", fb);
            expect(typeList.getFactory("foo.bar.baz")).to.equal(fa);
        });
    });
});
