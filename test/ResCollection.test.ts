import ResCollection from "../lib/models/ResCollection.js";
import type ResClient from "../lib/models/ResClient.js";
import { expect } from "chai";

const api = { enumerableLists: false } as unknown as ResClient;
describe("ResCollection", () => {
    let primitives: ResCollection;
    let models: ResCollection;

    beforeEach(async() => {
        primitives = new ResCollection(api, "service.primitives");
        await primitives.init([
            "Ten",
            "Twenty",
            false,
            null
        ]);

        models = new ResCollection(api, "services.models", {
            idCallback: (m: unknown): string => (m as { id: string; }).id
        });
        await models.init([
            { id: 10, name: "Ten" },
            { id: 20, name: "Twenty" },
            { id: 30, name: "Thirty" }
        ]);
    });

    describe("primitives", () => {
        it("adds a primitive item", () => {
            primitives.add("Thirty", 2);
            expect(primitives.at(0)).to.equal("Ten");
            expect(primitives.at(1)).to.equal("Twenty");
            expect(primitives.at(2)).to.equal("Thirty");
            expect(primitives.at(3)).to.equal(false);
            expect(primitives.at(4)).to.equal(null);
        });

        it("removes a primitive item", () => {
            primitives.remove(2);
            expect(primitives.at(0)).to.equal("Ten");
            expect(primitives.at(1)).to.equal("Twenty");
            expect(primitives.at(2)).to.equal(null);
        });
    });

    describe("models", () => {
        it("gets model by id", () => {
            expect(models.get(10)).to.deep.equal({ id: 10, name: "Ten" });
            expect(models.get(20)).to.deep.equal({ id: 20, name: "Twenty" });
            expect(models.get(30)).to.deep.equal({ id: 30, name: "Thirty" });
        });

        it("adds a model item", () => {
            models.add({ id: 15, name: "Fifteen" }, 1);
            expect(models.get(10)).to.deep.equal({ id: 10, name: "Ten" });
            expect(models.get(15)).to.deep.equal({ id: 15, name: "Fifteen" });
            expect(models.at(0)).to.equal(models.get(10));
            expect(models.at(1)).to.equal(models.get(15));
            expect(models.at(2)).to.equal(models.get(20));
            expect(models.at(3)).to.equal(models.get(30));
        });

        it("removes a model item", () => {
            models.remove(2);
            expect(models.get(10)).to.deep.equal({ id: 10, name: "Ten" });
            expect(models.get(20)).to.deep.equal({ id: 20, name: "Twenty" });
            // eslint-disable-next-line unicorn/no-useless-undefined
            expect(models.get(30)).to.eq(undefined);
            expect(models.at(0)).to.equal(models.get(10));
            expect(models.at(1)).to.equal(models.get(20));
        });

        it("throws an error on adding duplicate keys", () => {
            expect(() => models.add({ id: 20, name: "NewTwenty" }, 0)).to.throw();
        });
    });
});
