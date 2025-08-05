// https://github.com/jirenius/modapp-utils/blob/6b47830a2362e08378f75d7e207463e05107105f/src/array.js

/**
 * Makes a binary search for a item in an array using a compare function
 * @param arr Array to search in
 * @param item Item to search for
 * @param compare Compare function
 * @returns Index of a matching item in the array if one exists, otherwise the bitwise complement of the index where the item belongs
 */
export function binarySearch<A = unknown, I = unknown>(arr: ArrayLike<A>, item: I, compare: (current: A, item: I) => number): number {
    let l = 0,
        h = arr.length - 1,
        m: number, c: number;

    while (l <= h) {
        m = (l + h) >>> 1;
        c = compare(arr[m]!, item);
        if (c < 0) {
            l = m + 1;
        } else if (c > 0) {
            h = m - 1;
        } else {
            return m;
        }
    }
    return ~l;
}
