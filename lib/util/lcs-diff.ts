import { equal } from "../includes/utils/obj.js";

export default function lcsDiff<T>(a: Array<T>, b: Array<T>, onKeep: (item: T, aIndex: number, bIndex: number, idx: number) => void, onAdd: (item: T, aIndex: number, bIndex: number) => void, onRemove: (item: T, aIndex: number, idx: number) => void): void {
    // Do a LCS matric calculation
    // https://en.wikipedia.org/wiki/Longest_common_subsequence_problem
    let start = 0;
    let endA = a.length;
    let endB = b.length;

    // Trim matching start
    while (start < endA && start < endB && equal(a[start], b[start])) {
        start++;
    }

    // Trim matching end
    while (endA > start && endB > start && equal(a[endA - 1], b[endB - 1])) {
        endA--;
        endB--;
    }

    const sliceA = a.slice(start, endA);
    const sliceB = b.slice(start, endB);

    const m = sliceA.length;
    const n = sliceB.length;

    // If nothing changed, we're done
    if (m === 0 && n === 0) return;

    // Build LCS matrix
    const lcs = Array.from({ length: m + 1 }, () => Array.from<number>({ length: n + 1 }).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            lcs[i + 1]![j + 1] = equal(sliceA[i], sliceB[j])
                ? lcs[i]![j]! + 1
                : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
        }
    }

    // Handle unchanged tail elements
    for (let i = a.length - 1; i >= endA; i--) {
        onKeep(a[i]!, i, i - m + n, i);
    }

    // Walk back through LCS matrix
    const additions: Array<[number, number, number]> = [];
    let i = m, j = n, idx = endA;
    let removeCount = 0;

    while (i > 0 || j > 0) {
        const aIdx = i - 1;
        const bIdx = j - 1;

        if (i > 0 && j > 0 && equal(sliceA[aIdx], sliceB[bIdx])) {
            onKeep(sliceA[aIdx]!, start + aIdx, start + bIdx, --idx);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcs[i]![bIdx]! >= lcs[aIdx]![j]!)) {
            additions.push([bIdx, idx, removeCount]);
            j--;
        } else if (i > 0 && (j === 0 || lcs[i]![bIdx]! < lcs[aIdx]![j]!)) {
            onRemove(sliceA[aIdx]!, start + aIdx, --idx);
            removeCount++;
            i--;
        } else {
            break;
        }
    }

    // Handle unchanged head elements
    for (let ii = start - 1; ii >= 0; ii--) {
        onKeep(a[i]!, ii, ii, ii);
    }

    // Handle additions
    const totalAdds = additions.length;
    for (let k = totalAdds - 1; k >= 0; k--) {
        const [bIdx, idx2, remOffset] = additions[k]!;
        const adjustedIdx = idx2 - removeCount + remOffset + totalAdds - k - 1;
        onAdd(sliceB[bIdx]!, start + bIdx, adjustedIdx);
    }
}
