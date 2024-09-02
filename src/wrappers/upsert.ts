import { isEqual } from "../utils";
import { RegStruct } from "../types";
import { add } from "../commands/add";
import { query } from "../commands/query";
import { del } from "../commands/delete";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

// TODO convert to PromiseStoppable
// TODO allow diffing without writing.

// if enabled deleteUnspecifiedValues, should it also delete values in (Default) if missing?

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export async function upsert(struct: RegStruct, { deleteUnspecifiedValues = false } = {}) {
    const keyPaths = Object.keys(struct);
    const existingData = await query(keyPaths);

    const addMissingKeysCommands = existingData.keysMissing.map(k => {
        const values = struct[k]
        if (!Object.keys(values).length)
            return add(k); // no values specified, just create key
        else
            return Object.entries(values).map(([v, data]) => add({ keyPath: k, data, ...nameOrDefault(v) }))
    }).flat();

    const existingKeysToUpdate = Object.keys(struct).filter(k => existingData.keysMissing.indexOf(k) === -1);
    const addUpdateAndDeleteCommands = existingKeysToUpdate.map(k => {
        const dataInExistingKey = existingData.struct[k];
        const entriesInNewDict = Object.entries(struct[k]);

        const updateValuesCommands = entriesInNewDict
            .filter(([name, entry]) => !isEqual(dataInExistingKey[name], entry))
            .map(([name, entry]) => add({ keyPath: k, data: entry, ...nameOrDefault(name) }));

        const deleteCommands = (!deleteUnspecifiedValues) ? [] :
                 Object.entries(dataInExistingKey)
                .filter(([name]) => !struct[k][name])
                .map(([name]) => del({ keyPath: k, ...nameOrDefault(name) }));

        return [...updateValuesCommands, ...deleteCommands];
    }).flat();

    const allCommands = [...addMissingKeysCommands, ...addUpdateAndDeleteCommands];
    return Promise.all(allCommands);
}