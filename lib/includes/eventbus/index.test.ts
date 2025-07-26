/* eslint-disable @typescript-eslint/ban-ts-comment,  @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-member-access */
import { EventBus } from ".";

describe("EventBus", () => {
    // @ts-ignore fuck you
    let eventBus: EventBus, a: object, b: object;
    beforeEach(() => {
        jest.useFakeTimers({
            legacyFakeTimers: true
        });
        eventBus = new EventBus();
        a = {};
        b = {};
    });

    describe("on", () => {
        it("calls handler on simple object event", () => {
            const cb = jest.fn();
            eventBus.on(a, "foo", cb);
            eventBus.emit(a, "foo", "Foo");
            expect(cb).not.toBeCalled();

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(setTimeout).toHaveBeenCalledTimes(1);
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Foo");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo");
            expect(cb.mock.calls[0][3]).toBe(null);
        });

        it("calls handler on namespaced object event", () => {
            const cb = jest.fn();
            eventBus.on(a, "bar", cb, "foo");
            eventBus.emit(a, "bar", "Bar", "foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Bar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe(null);
        });

        it("calls handler on \"foo.bar\" object event when listening to \"foo\"", () => {
            const cb = jest.fn();
            eventBus.on(a, "foo", cb);
            eventBus.emit(a, "foo.bar", "Bar");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Bar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe("bar");
        });

        it("calls handler on simple non-object event", () => {
            const cb = jest.fn();
            eventBus.on("foo", cb);
            eventBus.emit("foo", "Foo");

            expect(cb).not.toBeCalled();

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(setTimeout).toHaveBeenCalledTimes(1);
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Foo");
            expect(cb.mock.calls[0][1]).toBe(null);
            expect(cb.mock.calls[0][2]).toBe("foo");
            expect(cb.mock.calls[0][3]).toBe(null);
        });

        it("subscribes to all objects when target is not provided", () => {
            const cb = jest.fn();
            eventBus.on("bar", cb, "foo");
            eventBus.emit(a, "bar", "ABar", "foo");
            eventBus.emit(b, "bar", "BBar", "foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(2);

            expect(cb.mock.calls[0][0]).toBe("ABar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe(null);

            expect(cb.mock.calls[1][0]).toBe("BBar");
            expect(cb.mock.calls[1][1]).toBe(b);
            expect(cb.mock.calls[1][2]).toBe("foo.bar");
            expect(cb.mock.calls[1][3]).toBe(null);
        });

        it("subscribes to all object events when event is null", () => {
            const cb = jest.fn();
            eventBus.on(a, null, cb);
            eventBus.emit(a, "foo.bar", "Bar");
            eventBus.emit(b, "foo", "Foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Bar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe("foo.bar");
        });

        it("subscribes to all object events when event is null", () => {
            const cb = jest.fn();
            eventBus.on(a, null, cb);
            eventBus.emit(a, "foo.bar", "Bar");
            eventBus.emit(b, "foo", "Foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Bar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe("foo.bar");
        });

        it("subscribes to all events when target is not provided, and event is null", () => {
            const cb = jest.fn();
            eventBus.on(null, cb);
            eventBus.emit(a, "foo.bar", "Bar");
            eventBus.emit(b, "foo", "Foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(2);

            expect(cb.mock.calls[0][0]).toBe("Bar");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo.bar");
            expect(cb.mock.calls[0][3]).toBe("foo.bar");

            expect(cb.mock.calls[1][0]).toBe("Foo");
            expect(cb.mock.calls[1][1]).toBe(b);
            expect(cb.mock.calls[1][2]).toBe("foo");
            expect(cb.mock.calls[1][3]).toBe("foo");
        });
    });


    describe("off", () => {

        it("does not call handler on removed object event", () => {
            const cb = jest.fn();
            eventBus.on(a, "foo", cb);
            eventBus.off(a, "foo", cb);
            eventBus.emit(a, "foo", "Foo");

            jest.runAllTimers();
            expect(cb).not.toBeCalled();
        });

        it("does not call handler on removed object event when target is not provided", () => {
            const cb = jest.fn();
            eventBus.on("foo", cb);
            eventBus.off("foo", cb);
            eventBus.emit(a, "foo", "Foo");

            jest.runAllTimers();
            expect(cb).not.toBeCalled();
        });

        it("does not call handler on removed object event when event is null", () => {
            const cb = jest.fn();
            eventBus.on(a, null, cb);
            eventBus.off(a, null, cb);
            eventBus.emit(a, "foo", "Foo");

            jest.runAllTimers();
            expect(cb).not.toBeCalled();
        });

        it("does not call handler on removed object event when target is not provided, and event is null", () => {
            const cb = jest.fn();
            eventBus.on(null, cb);
            eventBus.off(null, cb);
            eventBus.emit(a, "foo", "Foo");
            eventBus.emit(b, "bar", "Bar");
            eventBus.emit("baz", "Baz");

            jest.runAllTimers();
            expect(cb).not.toBeCalled();
        });

        it("calls multiple handlers on namespaced object event", () => {
            const cb1 = jest.fn();
            const cb2 = jest.fn();
            eventBus.on(a, "bar", cb1, "foo");
            eventBus.on(a, "bar", cb2, "foo");
            eventBus.emit(a, "bar", "Bar", "foo");

            jest.runAllTimers();

            expect(cb1).toBeCalled();
            expect(cb1.mock.calls.length).toBe(1);

            expect(cb1.mock.calls[0][0]).toBe("Bar");
            expect(cb1.mock.calls[0][1]).toBe(a);
            expect(cb1.mock.calls[0][2]).toBe("foo.bar");
            expect(cb1.mock.calls[0][3]).toBe(null);

            expect(cb2).toBeCalled();
            expect(cb2.mock.calls.length).toBe(1);

            expect(cb2.mock.calls[0][0]).toBe("Bar");
            expect(cb2.mock.calls[0][1]).toBe(a);
            expect(cb2.mock.calls[0][2]).toBe("foo.bar");
            expect(cb2.mock.calls[0][3]).toBe(null);
        });

    });

    describe("emit", () => {

        it("calls handlers triggered during other handler sequentially", () => {
            const secondcb = jest.fn();
            const cb = jest.fn((_a, _b, _c, _d) => {
                eventBus.emit(a, "bar", "Bar");
                expect(secondcb).not.toBeCalled();
            });

            eventBus.on(a, "foo", cb);
            eventBus.on(a, "bar", secondcb);
            eventBus.emit(a, "foo", "Foo");

            jest.runAllTimers();

            expect(cb).toBeCalled();
            expect(cb.mock.calls.length).toBe(1);
            expect(secondcb).toBeCalled();
            expect(secondcb.mock.calls.length).toBe(1);

            expect(cb.mock.calls[0][0]).toBe("Foo");
            expect(cb.mock.calls[0][1]).toBe(a);
            expect(cb.mock.calls[0][2]).toBe("foo");
            expect(cb.mock.calls[0][3]).toBe(null);

            expect(secondcb.mock.calls[0][0]).toBe("Bar");
            expect(secondcb.mock.calls[0][1]).toBe(a);
            expect(secondcb.mock.calls[0][2]).toBe("bar");
            expect(secondcb.mock.calls[0][3]).toBe(null);
        });
    });
});
