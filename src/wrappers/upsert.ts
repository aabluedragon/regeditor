import { isEqual } from "../utils";
import { add } from "../commands/add";
import { query } from "../commands/query";
import { RegStruct } from "../types";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

// TODO convert to PromiseStoppable
// TODO allow diffing without writing.
// TODO add opts to upsert {deleteMissingValues}

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export async function upsert(dict: RegStruct) {
    const keyPaths = Object.keys(dict);
    const existingData = await query(keyPaths);

    const addMissingKeysCommands = existingData.keysMissing.map(k => {
        const values = dict[k]
        if (!Object.keys(values).length)
            return add(k); // no values specified, just create key
        else
            return Object.entries(values).map(([v, data]) => add({ keyPath: k, data, ...nameOrDefault(v) }))
    }).flat();

    const existingKeysToUpdate = Object.keys(dict).filter(k => existingData.keysMissing.indexOf(k) === -1);
    const addUpdateCommands = existingKeysToUpdate.map(k => {
        const dataInExistingKey = existingData.struct[k];
        const values = dict[k];
        return Object.entries(values)
            .filter(([name, entry]) => !isEqual(dataInExistingKey[name], entry))
            .map(([name, entry]) => add({ keyPath: k, data: entry, ...nameOrDefault(name) }));
    }).flat();

    const allCommands = [...addMissingKeysCommands, ...addUpdateCommands];
    return Promise.all(allCommands);
}