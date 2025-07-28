import { Debug } from "../../util/Debug.js";
import Properties from "../../util/Properties.js";

/* eslint-disable @typescript-eslint/ban-types */
function rm (list: Array<{ handler: Function; target: object | null; }>, target: object | null, handler: Function | null) {
    if (!list) {
        return;
    }
    let i = list.length;
    while (i--) {
        if ((target === null || list[i].target === target) && (handler === null || list[i].handler === handler)) {
            list.splice(i, 1);
        }
    }
}

class EventBus {
    private _events!: Record<string, Array<{ handler: Function; target: object | null; }>>;
    private _queue!: Array<[unknown, object | null, string, string | null, Function]> | null;
    constructor() {
        Properties.of(this)
            .readOnly("_events", {})
            .writable("_queue", null);
    }

    private _exec(cb: [unknown, object | null, string, string | null, Function]) {
        if (this._queue === null) {
            this._queue = [cb];

            setTimeout(() => {
                const queue = this._queue ?? [];
                this._queue = null;
                for (const func of queue) {
                    (func.pop() as Function)(...func);
                }
            }, 0);
        } else {
            this._queue.push(cb);
            return;
        }
    }

    emit(target: object, event: string, data?: unknown, namespace?: string): this;
    emit(event: string, data?: unknown, namespace?: string): this;
    emit(...args: [object, string, unknown?, string?] | [string, unknown?, string?]) {
        let target: object | null = null, event: string, data: unknown | undefined, namespace: string | undefined;
        if (!args[0] || typeof args[0] === "string") {
            // (events, handler, namespace)
            [event, data, namespace] = args as [string, unknown?, string?];
        } else {
            // (target, events, handler, namespace)
            [target, event, data, namespace] = args as [object, string, unknown?, string?];
        }

        event = namespace ? `${namespace}.${event}` : event;
        Debug("eventbus:emit", event);
        Debug("eventbus:emit:data", data);
        let sub = event;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const list = this._events[sub];
            if (list) {
                const action = (sub ? event.slice(Math.max(0, sub.length + 1)) : event) || null;
                for (const handle of list) {
                    if (handle.target === target || handle.target === null) {
                        this._exec([data, target, event, action, handle.handler]);
                    }
                }
            }


            if (!sub) {
                break;
            }

            const i = sub.lastIndexOf(".");
            sub = i === -1 ? "" : sub.slice(0, Math.max(0, i));
        }

        return this;
    }

    off(target: object, events: string | Array<string> | null, handler?: Function, namespace?: string): this;
    off(events: string | Array<string> | null, handler?: Function, namespace?: string): this;
    off(...args: [object, string | Array<string> | null, Function?, string?] | [string | Array<string> | null, Function?, string?]) {
        let target: object | null = null, events: string | Array<string> | null, handler: Function | null, namespace: string | undefined;
        if (!args[0] || typeof args[0] === "string") {
            // (events, handler, namespace)
            [events, handler = null, namespace] = args as [string | Array<string> | null, Function?, string?];
        } else {
            // (target, events, handler, namespace)
            [target, events, handler = null, namespace] = args as [object, string | Array<string> | null, Function?, string?];
        }

        if (events === null || events.length === 0) {
            const name = namespace || "";
            const list = this._events[name];
            if (!list) {
                return this;
            }

            rm(list, target, handler);

            if (list.length === 0) {
                delete this._events[name];
            }
        } else {
            namespace = namespace ? `${namespace}.` : "";
            events = Array.isArray(events) ? events : events.match(/\S+/g) ?? [];
            for (const event of events) {
                const name = `${namespace}${event}`;
                const list = this._events[name];
                if (!list) {
                    continue;
                }

                rm(list, target, handler);

                if (list.length === 0) {
                    delete this._events[name];
                }
            }
        }

        return this;
    }

    on(target: object, events: string | Array<string> | null, handler: Function, namespace?: string): this;
    on(events: string | Array<string> | null, handler: Function, namespace?: string): this;
    on(...args: [object, string | Array<string> | null, Function, string?] | [string | Array<string> | null, Function, string?]) {
        let target: object | null = null, events: string | Array<string> | null = null, handler: Function, namespace: string | undefined;
        if (typeof args[1] === "function") {
            // (events, handler, namespace)
            [events, handler, namespace] = args as [string | Array<string> | null, Function, string?];
        } else {
            // (target, events, handler, namespace)
            [target, events, handler, namespace] = args as [object, string | Array<string> | null, Function, string?];
        }

        if (!handler) {
            return this;
        }

        const handle = { target, handler };

        if (events === null || events.length === 0) {
            const name = namespace || "";
            const list = this._events[name] ?? (this._events[name] = []);
            list.push(handle);
        } else {
            namespace = namespace ? `${namespace}.` : "";
            events = Array.isArray(events) ? events : events.match(/\S+/g) ?? [];
            for (const event of events) {
                const name = `${namespace}${event}`;
                const list = this._events[name] ?? (this._events[name] = []);
                list.push(handle);
            }
        }

        return this;
    }
}

export { EventBus };
const eventBus = new EventBus();
export default eventBus;
