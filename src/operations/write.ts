import { isEqual } from "../utils";
import { RegStruct, RegWriteOpts } from "../types";
import { regAdd } from "../commands/reg-add";
import { regQuery } from "../commands/reg-query";
import { regDelete } from "../commands/reg-delete";
import { TIMEOUT_DEFAULT } from "../constants";
import { PromiseStoppable } from "../promise-stoppable";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export function writeRegStruct(struct: RegStruct, { deleteUnspecifiedValues = false, timeout = TIMEOUT_DEFAULT }: RegWriteOpts = {}) {
    const keyPaths = Object.keys(struct);
    const timeStarted = Date.now();

    return PromiseStoppable.allStoppable([regQuery(keyPaths.map(k => ({ keyPath: k, timeout })))], existingDataArray => {
        const timeleft = timeout - (Date.now() - timeStarted);

        const existingData = existingDataArray[0];
        const addMissingKeysCommands = existingData.keysMissing.map(k => {
            const values = struct[k]
            if (!Object.keys(values).length)
                return regAdd({ keyPath: k, timeout: timeleft }); // no values specified, just create key
            else
                return Object.entries(values).map(([v, value]) => regAdd({ keyPath: k, value, ...nameOrDefault(v), timeout: timeleft }))
        }).flat();

        const existingKeysToUpdate = Object.keys(struct).filter(k => existingData.keysMissing.indexOf(k) === -1);
        const addUpdateAndDeleteCommands = existingKeysToUpdate.map(k => {
            const dataInExistingKey = existingData.struct[k];
            const entriesInNewValues = Object.entries(struct[k]);

            const updateValuesCommands = entriesInNewValues
                .filter(([name, entry]) => !isEqual(dataInExistingKey[name], entry))
                .map(([name, value]) => regAdd({ keyPath: k, value, ...nameOrDefault(name), timeout: timeleft }));

            const deleteCommands = (!deleteUnspecifiedValues) ? [] :
                Object.entries(dataInExistingKey)
                    .filter(([name]) => !struct[k][name] && deleteUnspecifiedValues) // Get existing values that are not specified in the new struct
                    .filter(([name]) =>
                        deleteUnspecifiedValues === 'all' ||
                        (deleteUnspecifiedValues === 'allExceptDefault' && name !== `(Default)`) ||
                        (deleteUnspecifiedValues === 'onlyDefault' && name === `(Default)`) ||
                        (typeof deleteUnspecifiedValues === 'function' && deleteUnspecifiedValues(k, name, dataInExistingKey[name])))
                    .map(([name]) => regDelete({ keyPath: k, ...nameOrDefault(name), timeout: timeleft }));

            return [...updateValuesCommands, ...deleteCommands];
        }).flat();

        const allCommands = [...addMissingKeysCommands, ...addUpdateAndDeleteCommands];
        return PromiseStoppable.allStoppable(allCommands as PromiseStoppable<any>[], r => { });
    })
}