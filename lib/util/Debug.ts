import type { Debug as DebugType } from "debug";
import { formatWithOptions } from "node:util";

// the things I do for esm first with cjs support
let debug: DebugType | undefined | null;
function getDebug(): Promise<DebugType | null> | DebugType | null {
    if (debug !== undefined) return debug;
    try {
        // eslint-disable-next-line unicorn/prefer-module
        if (typeof require === "undefined") {
            return import("debug").then(mod => (debug = mod.default)).catch(() => (debug = null));
        } else {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, unicorn/prefer-module
            debug = (require("debug") as { default: DebugType; }).default;
        }
    } catch {
        debug = null;
    }
    return debug;
}

let maxTotalLength = 2000;
let maxLines = 30;
function formatMaxLength(args: Array<unknown>, d = depth): string {
    const formatted = formatWithOptions({ colors: true, showHidden: false, depth: d }, ...args);
    if (d === Infinity) return formatted;
    if (formatted.length > maxTotalLength || formatted.split("\n").length > maxLines) {
        d -= 1;
        if (d >= 0) return formatMaxLength(args, d);
    }
    return formatted;
}

let depth = 2;
export function Debug(namspace: string, arg0: unknown, ...args: Array<unknown>): void {
    const log = (dt: DebugType): void => dt(`wolferyjs:${namspace}`)(formatMaxLength([arg0, ...args]));
    const d = getDebug();
    if (d instanceof Promise) {
        void d.then(dt => {
            if (dt) {
                log(dt);
            }
        });
    } else if (d) {
        log(d);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebug(namespace: string): (formatter: any, ...args: Array<any>) => void {
    const d = getDebug();
    if (!d || d instanceof Promise) {
        return () => {}; // noop
    }
    return d(`resclient:${namespace}`);
}

/**
 * Set the inspection depth for debug messages.
 * @param d The depth.
 */
export function setDebugDepth(d: number): void {
    depth = d;
}

/**
 * Set the maximum total length for debug messages.
 * @param d The maximum total length.
 */
export function setDebugMaxTotalLength(d: number): void {
    maxTotalLength = d;
}

/**
 * Set the maximum number of lines for debug messages.
 * @param d The maximum number of lines.
 */
export function setDebugMaxLines(d: number): void {
    maxLines = d;
}
