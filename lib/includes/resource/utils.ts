import type ResModel from "../../models/ResModel.js";
import { type AnyObject } from "../../util/types.js";

export function getProps(m: ResModel): AnyObject {
    let props = m && m.props;
    if (!props || typeof props !== "object") {
        props = {};
        for (const k in m) {
            if (k && Object.hasOwn(m, k) && k[0] !== "_") {
                props[k] = (m as unknown as AnyObject)[k];
            }
        }
    }
    return props;
}
