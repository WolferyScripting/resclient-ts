import type ResClient from "../lib/models/ResClient.js";
import ResModel from "../lib/models/ResModel.js";
import { expect } from "chai";

const api = null as unknown as ResClient;

describe("ResModel", () => {
    describe("init", () => {
        it("initializes the model with data", () => {
            const model = new ResModel(api, "service.model");
            model.update({
                foo: "bar",
                int: 42
            });
            // @ts-expect-error property is not typed
            expect(model.foo).to.equal("bar");
            // @ts-expect-error property is not typed
            expect(model.int).to.equal(42);
        });

        it("does not overwrite existing ResModel properties", () => {
            const model = new ResModel(api, "service.model");
            const o: Record<string, unknown> = {};
            for (const k of Object.keys(model)) {
                o[k] = k;
            }
            model.init(o);
            for (const k of Object.keys(o)) {
            // @ts-expect-error property is not typed
                expect(model[k]).to.not.equal(k);
            }
        });

        it("initializes the model with linked resources", () => {
            const model = new ResModel(api, "service.model");
            const childModel = new ResModel(api, "service.model.child");
            model.init({ child: childModel });
            // @ts-expect-error property is not typed
            expect(model.child).to.equal(childModel);
        });

    });

    describe("props", () => {
        it("returns the properties", () => {
            const model = new ResModel(api, "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            expect(model["_props"]).to.deep.equal({ foo: "bar", int: 42 });
        });

        it("returns hidden properties", () => {
            const model = new ResModel(api, "service.model");
            const o: Record<string, unknown> = {};
            for (const k of Object.keys(model)) {
                o[k] = k;
            }
            model.init(o);
            expect(model["_props"]).to.deep.equal(o);
        });
    });

    describe("toJSON", () => {
        it("returns the properties", () => {
            const model = new ResModel(api, "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            expect(model.toJSON()).to.deep.equal({ foo: "bar", int: 42 });
        });

        it("returns hidden properties", () => {
            const model = new ResModel(api, "service.model");
            const o: Record<string, unknown> = {};
            for (const k of Object.keys(model)) {
                o[k] = k;
            }
            model.init(o);
            expect(model.toJSON()).to.deep.equal(o);
        });

        it("returns linked resources", () => {
            const model = new ResModel(api, "service.model");
            const childModel = new ResModel(api, "service.model.child");
            childModel.init({ zoo: "baz" });
            model.init({ foo: "bar", child: childModel });
            expect(model.toJSON()).to.deep.equal({ foo: "bar", child: { zoo: "baz" } });
        });

    });

    describe("update", () => {
        it("updates properties with new value", () => {
            const model = new ResModel(api, "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            const changed = model.update({ foo: "baz" });
            expect(changed).to.deep.equal({ foo: "bar" });
            // @ts-expect-error property is not typed
            expect(model.foo).to.equal("baz");
            expect(model["_props"].foo).to.equal("baz");
        });

        it("updates hidden properties with new value", () => {
            const model = new ResModel(api, "service.model");
            model.init({
                foo: "bar",
                int: 42,
                on:  "on",
                api: true
            });
            const changed = model.update({ on: "off", api: false });
            expect(changed).to.deep.equal({ on: "on", api: true });
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(model.on).to.not.equal("off");
            expect(model["_props"].on).to.equal("off");
            expect(model["api"]).to.not.equal(false);
            expect(model["_props"].api).to.equal(false);
        });

        it("returns null on empty props", () => {
            const model = new ResModel(api, "service.model");
            model.init({ foo: "bar", int: 42 });
            const changed = model.update(null as never);
            expect(changed).to.eq(null);
        });
    });

});
