import { RegCompareResult, RegStruct } from "../types";
import { isEqual } from "../utils";

/**
 * Compares two registry structs, and returns the differences.
 * @param previous Previous registry struct.
 * @param next Next registry struct.
 * @returns a RegCompareResult object describing the differences.
 */
export function compare(previous: RegStruct, next: RegStruct): RegCompareResult {
    const prevKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);

    const removedKeys = prevKeys.filter(k => !next[k]).map(k => ({ [k]: previous[k] })).reduce((acc, cur) => ({ ...acc, ...cur }), {});
    const addedKeys = nextKeys.filter(k => !previous[k]).map(k => ({ [k]: next[k] })).reduce((acc, cur) => ({ ...acc, ...cur }), {});

    const changedKeyNames = prevKeys.filter(k => next[k] && !isEqual(previous[k], next[k]));
    const changedKeys = (changedKeyNames.map(k => ({ [k]: {} })))
        .reduce((acc, cur) => ({ ...acc, ...cur }), {}) as RegCompareResult['changedKeys'];

    for (const key of changedKeyNames) {
        const prevValues = previous[key];
        const nextValues = next[key];

        // Calculating Removed and Updated
        for (const [prevName, prevValue] of Object.entries(prevValues)) {
            const nextValue = nextValues[prevName];
            if (!nextValue) {
                changedKeys[key][prevName] = { op: 'removed', previous: prevValue };
            } else if (!isEqual(prevValue, nextValue)) {
                changedKeys[key][prevName] = { op: 'updated', previous: prevValue, next: nextValue };
            }
        }

        // Calculating Added
        for (const [nextName, nextValue] of Object.entries(nextValues)) {
            if (prevValues[nextName]) continue;
            const prevValue = nextValues[nextName];
            if (!prevValue) {
                changedKeys[key][nextName] = { op: 'added', next: nextValue };
            }
        }
    }

    return {
        changedKeys,
        addedKeys,
        removedKeys
    }
}