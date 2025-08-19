import { formatWithOptions } from "node:util";


// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let debug: import("debug").Debug | undefined;
try {
    debug = (await import("debug")).default;
} catch {}

let depth = 2;
export function Debug(namspace: string, arg0: unknown, ...args: Array<unknown>): void {
    if (typeof arg0 === "object" && arg0 !== null) {
        arg0 = Object.create(arg0);
        for (const s of Object.getOwnPropertySymbols(arg0)) {
            Object.defineProperty(arg0, s, { enumerable: false });
        }
    }
    return debug ? debug(`resclient:${namspace}`)(formatWithOptions({ colors: true, showHidden: false, depth }, arg0, ...args)) : undefined;
}

/**
 * Set the inspection depth for debug messages.
 * @param d The depth.
 */
export function setDebugDepth(d: number): void {
    depth = d;
}
