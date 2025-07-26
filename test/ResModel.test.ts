/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
// I hate this
import type ResClient from "../lib/models/ResClient.js";
import ResModel from "../lib/models/ResModel.js";

const api = null as unknown as ResClient;
describe("ResModel", () => {

    describe("init", () => {

        it("initializes the model with data", () => {
            const model = new ResModel(api , "service.model");
            model.update({
                foo: "bar",
                int: 42
            });
            // @ts-ignore
            expect(model.foo).toBe("bar");
            // @ts-ignore
            expect(model.int).toBe(42);
        });

        it("does not overwrite existing ResModel properties", () => {
            const model = new ResModel(api , "service.model");
            const o = {};
            for (const k of Object.keys(model)) {
            // @ts-ignore
                o[k] = k;
            }
            model.init(o);
            for (const k of Object.keys(o)) {
            // @ts-ignore
                expect(model[k]).not.toBe(k);
            }
        });

        it("initializes the model with linked resources", () => {
            const model = new ResModel(api , "service.model");
            const childModel = new ResModel(api , "service.model.child");
            model.init({ child: childModel });
            // @ts-ignore
            expect(model.child).toBe(childModel);
        });

    });

    describe("props", () => {

        it("returns the properties", () => {
            const model = new ResModel(api , "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            expect(model["_props"]).toEqual({ foo: "bar", int: 42 });
        });

        it("returns hidden properties", () => {
            const model = new ResModel(api , "service.model");
            const o = {};
            for (const k of Object.keys(model)) {
            // @ts-ignore
                o[k] = k;
            }
            model.init(o);
            // @ts-ignore
            expect(model["_props"]).toEqual(o);
        });
    });

    describe("toJSON", () => {

        it("returns the properties", () => {
            const model = new ResModel(api , "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            expect(model.toJSON()).toEqual({ foo: "bar", int: 42 });
        });

        it("returns hidden properties", () => {
            const model = new ResModel(api, "service.model");
            const o = {};
            for (const k of Object.keys(model)) {
            // @ts-ignore
                o[k] = k;
            }
            model.init(o);
            expect(model.toJSON()).toEqual(o);
        });

        it("returns linked resources", () => {
            const model = new ResModel(api , "service.model");
            const childModel = new ResModel(api , "service.model.child");
            childModel.init({ zoo: "baz" });
            model.init({ foo: "bar", child: childModel });
            expect(model.toJSON()).toEqual({ foo: "bar", child: { zoo: "baz" } });
        });

    });

    describe("update", () => {

        it("updates properties with new value", () => {
            const model = new ResModel(api , "service.model");
            model.init({
                foo: "bar",
                int: 42
            });
            const changed = model.update({ foo: "baz" });
            expect(changed).toEqual({ foo: "bar" });
            // @ts-ignore
            expect(model.foo).toBe("baz");
            expect(model["_props"].foo).toBe("baz");
        });

        it("updates hidden properties with new value", () => {
            const model = new ResModel(api , "service.model");
            model.init({
                foo: "bar",
                int: 42,
                on:  "on",
                api: true
            });
            const changed = model.update({ on: "off", api: false });
            expect(changed).toEqual({ on: "on", api: true });
            expect(model.on).not.toBe("off");
            expect(model["_props"].on).toBe("off");
            expect(model["api"]).not.toBe(false);
            expect(model["_props"].api).toBe(false);
        });

        it("returns null on empty props", () => {
            const model = new ResModel(api , "service.model");
            model.init({ foo: "bar", int: 42 });
            const changed = model.update(null as never);
            expect(changed).toBe(null);
        });
    });
});
