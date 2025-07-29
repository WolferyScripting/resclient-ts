import { CACHE_ITEM_UNSUBSCRIBE_DELAY, CacheItem, ResModel, type ResClient } from "../lib/index.js";
import { expect } from "chai";
import {
    type SinonFakeTimers,
    useFakeTimers,
    fake,
    spy,
    type SinonSpy
} from "sinon";

describe("CacheItem", () => {
    let clock: SinonFakeTimers;

    const api = null as unknown as ResClient;
    const unsubscribe = fake();
    const onKeep = fake();
    const onUnkeep = fake();
    let ci: CacheItem, model: ResModel, checkUnsubscribeSpy: SinonSpy;

    beforeEach(() => {
        clock = useFakeTimers();
        ci = new CacheItem("model", {
            unsubscribe,
            onKeep,
            onUnkeep
        });
        model = new ResModel(api, "model");
        ci.addSubscribed(1);
        ci.setItem(model, "model");
        checkUnsubscribeSpy = spy(ci, "_checkUnsubscribe" as never); // private method
    });

    afterEach(() => {
        clock.restore();
        unsubscribe.resetHistory();
        onKeep.resetHistory();
        onUnkeep.resetHistory();
    });

    it("unsubscribe after timeout", () => {
        clock.tick(CACHE_ITEM_UNSUBSCRIBE_DELAY - 1);
        expect(unsubscribe.called).to.equal(false);
        clock.tick(1);
        expect(unsubscribe.calledOnceWith(ci)).to.equal(true);
    });

    it("not unsubscribe if direct > 0", () => {
        ci.addDirect();
        clock.tick(CACHE_ITEM_UNSUBSCRIBE_DELAY);
        expect(unsubscribe.called).to.equal(false);
    });

    it("not unsubscribe if subscribed < 0", () => {
        ci.addSubscribed(-1);
        clock.tick(CACHE_ITEM_UNSUBSCRIBE_DELAY);
        expect(unsubscribe.called).to.equal(false);
    });

    describe("createDefault", () => {
        it("create a new CacheItem", () => {
            const apiWithFunctions = {
                keepCached:   onKeep,
                unkeepCached: onUnkeep,
                unsubscribe
            } as unknown as ResClient;
            ci = CacheItem.createDefault("model", apiWithFunctions);
            expect(ci.rid).to.equal("model");
            expect(ci["_unsubscribe"]).to.not.equal(null);
            expect(ci["_onKeep"]).to.not.equal(null);
            expect(ci["_onUnkeep"]).to.not.equal(null);
        });
    });

    describe("addIndirect", () => {
        it("increase the indirect count", () => {
            ci.addIndirect();
            expect(ci.indirect).to.equal(1);
        });

        it("decrease the indirect count", () => {
            ci.indirect = 2;
            ci.addIndirect(-1);
            expect(ci.indirect).to.equal(1);
        });

        it("throw if indirect < 0", () => {
            expect(() => ci.addIndirect(-1)).to.throw(Error, "Indirect count reached below 0");
        });
    });

    describe("addSubscribed", () => {
        it("increase the subscribed count", () => {
            ci.addSubscribed(1);
            expect(ci.subscribed).to.equal(2);
        });

        it("decrease the subscribed count", () => {
            ci.addSubscribed(-1);
            expect(ci.subscribed).to.equal(0);
        });

        it("reset the subscribed count if 0 is provided", () => {
            ci.subscribed = 2;
            expect(ci.subscribed).to.equal(2);
            ci.addSubscribed(0);
            expect(ci.subscribed).to.equal(0);
        });

        it("reset timeout if subscribed hits 0", () => {
            const resetTimeoutSpy = spy(clock, "clearTimeout");
            const timeout = ci["_unsubscribeTimeout"];
            expect(timeout).to.not.equal(null);
            ci.addSubscribed(-1);
            expect(resetTimeoutSpy.calledOnceWith(timeout as never)).to.equal(true);
            expect(ci["_unsubscribeTimeout"]).to.equal(null);
        });
    });

    describe("addDirect", () => {
        it("increase the direct count", () => {
            expect(ci.direct).to.equal(0);
            ci.addDirect();
            expect(ci.direct).to.equal(1);
        });

        it("clear the unsubscribe timeout", () => {
            expect(ci["_unsubscribeTimeout"]).to.not.equal(null);
            ci.addDirect();
            expect(ci["_unsubscribeTimeout"]).to.equal(null);
        });
    });

    describe("keep", () => {
        it("call onKeep when called", () => {
            ci.keep();
            expect(onKeep.calledOnceWith(ci)).to.equal(true);
            expect(ci.forceKeep).to.equal(true);
        });

        it("not unsubscribe after timeout if forceKeep = true", () => {
            ci.keep();
            clock.tick(CACHE_ITEM_UNSUBSCRIBE_DELAY);
            expect(unsubscribe.called).to.equal(false);
        });
    });

    describe("removeDirect", () => {
        beforeEach(() => ci.addDirect());

        it("decrease the direct count", () => {
            expect(ci.direct).to.equal(1);
            ci.removeDirect();
            expect(ci.direct).to.equal(0);
        });

        it("unsubscribe if subscribed < 0", () => {
            ci.addSubscribed(-1);
            expect(unsubscribe.called).to.equal(false);
            ci.removeDirect();
            expect(unsubscribe.calledOnceWith(ci)).to.equal(true);
        });

        it("call checkUnsubscribe if subscribed > 0", () => {
            ci.removeDirect();
            expect(checkUnsubscribeSpy.calledOnce).to.equal(true);
        });

        it("throw if direct < 0", () => {
            ci.direct = 0;
            expect(() => ci.removeDirect()).to.throw(Error, "Direct count reached below 0");
        });
    });

    describe("resetTimeout", () => {
        it("should reset the timeout and call checkUnsubscribe", () => {
            const resetTimeoutSpy = spy(clock, "clearTimeout");
            const timeout = ci["_unsubscribeTimeout"];
            expect(timeout).to.not.equal(null);
            ci.resetTimeout();
            expect(resetTimeoutSpy.calledOnceWith(timeout as never));
            expect(ci["_unsubscribeTimeout"]).to.not.equal(null);
            expect(ci["_unsubscribeTimeout"]).to.not.equal(timeout); // ensure a new timeout is started
        });
    });

    describe("setItem", () => {
        beforeEach(() => ci.item = undefined as never);

        it("set item & type, clear promise, and call checkUnsubscribe", () => {
            const promise = Promise.resolve();
            void ci.setPromise(promise);
            expect(ci.promise).to.equal(promise);
            expect(ci.item).to.equal(undefined);
            ci.setItem(model, "model");
            expect(ci.promise).to.equal(null);
            expect(ci.item).to.equal(model);
            expect(ci.type).to.equal("model");
            expect(checkUnsubscribeSpy.calledOnce).to.equal(true);
        });
    });

    describe("setPromise", () => {
        it("set the promise", () => {
            const promise = Promise.resolve();
            ci.item = undefined as never;
            void ci.setPromise(promise);
            expect(ci.promise).to.equal(promise);
        });

        it("ignore if item is present", () => {
            expect(ci.promise).to.equal(null);
            void ci.setPromise(Promise.resolve());
            expect(ci.promise).to.equal(null);
        });
    });

    describe("setType", () => {
        it("set the type", () => {
            expect(ci.type).to.equal("model");
            ci.setType("collection");
            expect(ci.type).to.equal("collection");
        });
    });

    describe("unkeep", () => {
        beforeEach(() => ci.keep());

        it("call onUnkeep when unkeep is called", () => {
            ci.unkeep();
            expect(onUnkeep.calledOnceWith(ci)).to.equal(true);
            expect(ci.forceKeep).to.equal(false);
        });
    });
});
