import { EventBus } from "../lib/includes/eventbus/index.js";
import { useFakeTimers, fake, type SinonFakeTimers } from "sinon";
import { expect } from "chai";

describe("EventBus", () => {
    let eventBus: EventBus, a: object, b: object;
    let clock: SinonFakeTimers;

    beforeEach(() => {
        clock = useFakeTimers();
        eventBus = new EventBus();
        a = {};
        b = {};
    });

    afterEach(() => {
        clock.restore();
    });

    describe("on", () => {
        it("calls handler on simple object event", () => {
            const cb = fake();
            eventBus.on(a, "foo", cb);
            eventBus.emit(a, "foo", "Foo");

            expect(cb.called).to.eq(false);
            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(cb.firstCall.args).to.deep.equal(["Foo", a, "foo", null]);
        });

        it("calls handler on namespaced object event", () => {
            const cb = fake();
            eventBus.on(a, "bar", cb, "foo");
            eventBus.emit(a, "bar", "Bar", "foo");

            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(cb.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", null]);
        });

        it('calls handler on "foo.bar" object event when listening to "foo"', () => {
            const cb = fake();
            eventBus.on(a, "foo", cb);
            eventBus.emit(a, "foo.bar", "Bar");

            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(cb.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", "bar"]);
        });

        it("calls handler on simple non-object event", () => {
            const cb = fake();
            eventBus.on("foo", cb);
            eventBus.emit("foo", "Foo");

            expect(cb.called).to.eq(false);
            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(cb.firstCall.args).to.deep.equal(["Foo", null, "foo", null]);
        });

        it("subscribes to all objects when target is not provided", () => {
            const cb = fake();
            eventBus.on("bar", cb, "foo");
            eventBus.emit(a, "bar", "ABar", "foo");
            eventBus.emit(b, "bar", "BBar", "foo");

            clock.runAll();

            expect(cb.callCount).to.equal(2);
            expect(cb.firstCall.args).to.deep.equal(["ABar", a, "foo.bar", null]);
            expect(cb.secondCall.args).to.deep.equal(["BBar", b, "foo.bar", null]);
        });

        it("subscribes to all object events when event is null", () => {
            const cb = fake();
            eventBus.on(a, null, cb);
            eventBus.emit(a, "foo.bar", "Bar");
            eventBus.emit(b, "foo", "Foo");

            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(cb.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", "foo.bar"]);
        });

        it("subscribes to all events when target and event are null", () => {
            const cb = fake();
            eventBus.on(null, cb);
            eventBus.emit(a, "foo.bar", "Bar");
            eventBus.emit(b, "foo", "Foo");

            clock.runAll();

            expect(cb.callCount).to.equal(2);
            expect(cb.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", "foo.bar"]);
            expect(cb.secondCall.args).to.deep.equal(["Foo", b, "foo", "foo"]);
        });
    });

    describe("off", () => {
        it("does not call handler after removal", () => {
            const cb = fake();
            eventBus.on(a, "foo", cb);
            eventBus.off(a, "foo", cb);
            eventBus.emit(a, "foo", "Foo");

            clock.runAll();
            expect(cb.called).to.eq(false);
        });

        it("does not call handler when target is not provided", () => {
            const cb = fake();
            eventBus.on("foo", cb);
            eventBus.off("foo", cb);
            eventBus.emit(a, "foo", "Foo");

            clock.runAll();
            expect(cb.called).to.eq(false);
        });

        it("does not call handler when event is null", () => {
            const cb = fake();
            eventBus.on(a, null, cb);
            eventBus.off(a, null, cb);
            eventBus.emit(a, "foo", "Foo");

            clock.runAll();
            expect(cb.called).to.eq(false);
        });

        it("does not call handler for null target and null event", () => {
            const cb = fake();
            eventBus.on(null, cb);
            eventBus.off(null, cb);
            eventBus.emit(a, "foo", "Foo");
            eventBus.emit(b, "bar", "Bar");
            eventBus.emit("baz", "Baz");

            clock.runAll();
            expect(cb.called).to.eq(false);
        });

        it("calls multiple handlers on namespaced object event", () => {
            const cb1 = fake();
            const cb2 = fake();
            eventBus.on(a, "bar", cb1, "foo");
            eventBus.on(a, "bar", cb2, "foo");
            eventBus.emit(a, "bar", "Bar", "foo");

            clock.runAll();

            expect(cb1.calledOnce).to.eq(true);
            expect(cb1.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", null]);
            expect(cb2.calledOnce).to.eq(true);
            expect(cb2.firstCall.args).to.deep.equal(["Bar", a, "foo.bar", null]);
        });
    });

    describe("emit", () => {
        it("calls handlers triggered during other handler sequentially", () => {
            const secondcb = fake();
            const cb = fake(() => {
                eventBus.emit(a, "bar", "Bar");
                expect(secondcb.called).to.eq(false);
            });

            eventBus.on(a, "foo", cb);
            eventBus.on(a, "bar", secondcb);
            eventBus.emit(a, "foo", "Foo");

            clock.runAll();

            expect(cb.calledOnce).to.eq(true);
            expect(secondcb.calledOnce).to.eq(true);

            expect(cb.firstCall.args).to.deep.equal(["Foo", a, "foo", null]);
            expect(secondcb.firstCall.args).to.deep.equal(["Bar", a, "bar", null]);
        });
    });
});
