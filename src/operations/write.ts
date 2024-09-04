import { isEqual } from "../utils";
import { CommonOpts, RegCmdResultWithCmds, RegStruct, RegWriteCmdResult, RegWriteOpts } from "../types";
import { regAdd } from "../commands/reg-add";
import { regQuery } from "../commands/reg-query";
import { regDelete } from "../commands/reg-delete";
import { TIMEOUT_DEFAULT } from "../constants";
import { PromiseStoppable } from "../promise-stoppable";

function nameOrDefault(valueName: string) {
    return { ...(valueName === `(Default)` ? { ve: true } : { v: valueName }) }
}

// TODO: if REG ADD contians data in REG_NONE, fallback to .reg file, REG IMPORT command.

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export function writeRegStruct(struct: RegStruct, { deleteUnspecifiedValues = false, timeout = TIMEOUT_DEFAULT, cmdParamsModifier, reg32, reg64 }: RegWriteOpts = {}): PromiseStoppable<RegWriteCmdResult> {
    const keyPaths = Object.keys(struct);
    const timeStarted = Date.now();

    const commonOpts: CommonOpts = { timeout, cmdParamsModifier } satisfies CommonOpts;
    if (reg32) commonOpts.reg32 = true;
    if (reg64) commonOpts.reg64 = true;

    return PromiseStoppable.allStoppable([regQuery(keyPaths.map(k => ({ keyPath: k, ...commonOpts })))], existingDataArray => {
        const timeleft = timeout - (Date.now() - timeStarted);
        commonOpts.timeout = timeleft;

        const existingData = existingDataArray[0];
        const addMissingKeysCommands = existingData.keysMissing.map(k => {
            const values = struct[k]
            if (!Object.keys(values).length)
                return regAdd({ keyPath: k, ...commonOpts }); // no values specified, just create key
            else
                return Object.entries(values).map(([v, value]) => regAdd({ keyPath: k, value, ...nameOrDefault(v), ...commonOpts }))
        }).flat();

        const existingKeysToUpdate = Object.keys(struct).filter(k => existingData.keysMissing.indexOf(k) === -1);
        const addUpdateAndDeleteCommands = existingKeysToUpdate.map(k => {
            const dataInExistingKey = existingData.struct[k];
            const entriesInNewValues = Object.entries(struct[k]);

            const updateValuesCommands = entriesInNewValues
                .filter(([name, entry]) => !isEqual(dataInExistingKey[name], entry))
                .map(([name, value]) => regAdd({ keyPath: k, value, ...nameOrDefault(name), ...commonOpts }));

            const deleteCommands = (!deleteUnspecifiedValues) ? [] :
                Object.entries(dataInExistingKey)
                    .filter(([name]) => !struct[k][name] && deleteUnspecifiedValues) // Get existing values that are not specified in the new struct
                    .filter(([name]) =>
                        deleteUnspecifiedValues === 'all' ||
                        (deleteUnspecifiedValues === 'allExceptDefault' && name !== `(Default)`) ||
                        (deleteUnspecifiedValues === 'onlyDefault' && name === `(Default)`) ||
                        (typeof deleteUnspecifiedValues === 'function' && deleteUnspecifiedValues(k, name, dataInExistingKey[name])))
                    .map(([name]) => regDelete({ keyPath: k, ...nameOrDefault(name), ...commonOpts }));

            return [...updateValuesCommands, ...deleteCommands];
        }).flat();

        const allCommands = [...addMissingKeysCommands, ...addUpdateAndDeleteCommands];
        return PromiseStoppable.allStoppable(allCommands as PromiseStoppable<RegCmdResultWithCmds>[], r => ({ cmds: r.map(c => c.cmds).flat() }));
    })
}