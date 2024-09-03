import { isEqual } from "../utils";
import { RegStruct, RegUpsertOpts } from "../types";
import { add } from "../commands/add";
import { query } from "../commands/query";
import { del } from "../commands/delete";
import { TIMEOUT_DEFAULT } from "../constants";
import { PromiseStoppable } from "../promise-stoppable";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export function write(struct: RegStruct, { deleteUnspecifiedValues = false, timeout = TIMEOUT_DEFAULT }: RegUpsertOpts = {}) {
    const keyPaths = Object.keys(struct);
    const timeStarted = Date.now();

    return PromiseStoppable.allStoppable([query(keyPaths.map(k => ({ keyPath: k, timeout })))], existingDataArray => {
        const timeleft = timeout - (Date.now() - timeStarted);

        const existingData = existingDataArray[0];
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
                    .filter(([name]) => !struct[k][name] && deleteUnspecifiedValues) // Get existing values that are not specified in the new struct
                    .filter(([name]) =>
                        deleteUnspecifiedValues === 'all' ||
                        (deleteUnspecifiedValues === 'allExceptDefault' && name !== `(Default)`) ||
                        (deleteUnspecifiedValues === 'onlyDefault' && name === `(Default)`) ||
                        (typeof deleteUnspecifiedValues === 'function' && deleteUnspecifiedValues(k, name, dataInExistingKey[name])))
                    .map(([name]) => del({ keyPath: k, ...nameOrDefault(name), timeout: timeleft }));

            return [...updateValuesCommands, ...deleteCommands];
        }).flat();

        const allCommands = [...addMissingKeysCommands, ...addUpdateAndDeleteCommands];
        return PromiseStoppable.allStoppable(allCommands as PromiseStoppable<any>[], r => { });
    })
}