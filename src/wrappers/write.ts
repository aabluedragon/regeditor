import { isEqual } from "../utils";
import { RegStruct, RegUpsertOpts, TimeoutDefault } from "../types";
import { add } from "../commands/add";
import { query } from "../commands/query";
import { del } from "../commands/delete";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

// TODO convert to PromiseStoppable
// TODO allow diffing without writing (just two reg structs, no need to perform REG QUERY commands)
// if enabled deleteUnspecifiedValues, should it also delete values in (Default) if missing? or support to modes: 'any' and 'anyExceptDefault'

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export async function write(struct: RegStruct, { deleteUnspecifiedValues = false, timeout = TimeoutDefault }: RegUpsertOpts = {}) {
    const keyPaths = Object.keys(struct);

    const timeStarted = Date.now();
    const existingData = await query(keyPaths.map(k => ({ keyPath: k, timeout })));
    const timeleft = timeout - (Date.now() - timeStarted);

    const addMissingKeysCommands = existingData.keysMissing.map(k => {
        const values = struct[k]
        if (!Object.keys(values).length)
            return add({ keyPath: k, timeout: timeleft }); // no values specified, just create key
        else
            return Object.entries(values).map(([v, data]) => add({ keyPath: k, data, ...nameOrDefault(v), timeout: timeleft }))
    }).flat();

    const existingKeysToUpdate = Object.keys(struct).filter(k => existingData.keysMissing.indexOf(k) === -1);
    const addUpdateAndDeleteCommands = existingKeysToUpdate.map(k => {
        const dataInExistingKey = existingData.struct[k];
        const entriesInNewDict = Object.entries(struct[k]);

        const updateValuesCommands = entriesInNewDict
            .filter(([name, entry]) => !isEqual(dataInExistingKey[name], entry))
            .map(([name, entry]) => add({ keyPath: k, data: entry, ...nameOrDefault(name), timeout: timeleft }));

        const deleteCommands = (!deleteUnspecifiedValues) ? [] :
            Object.entries(dataInExistingKey)
                .filter(([name]) => !struct[k][name])
                .map(([name]) => del({ keyPath: k, ...nameOrDefault(name), timeout: timeleft }));

        return [...updateValuesCommands, ...deleteCommands];
    }).flat();

    const allCommands = [...addMissingKeysCommands, ...addUpdateAndDeleteCommands];
    return Promise.all(allCommands);
}