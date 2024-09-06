import { findValueByNameLowerCaseInStruct, isEqual, regKeyResolveFullPathFromShortcuts } from "../utils";
import { CommonOpts, RegCmdResultWithCmds, RegKey, RegStruct, RegValue, RegValues, RegWriteCmdResult, RegWriteOpts } from "../types";
import { regAdd } from "../commands/reg-add";
import { regQuery } from "../commands/reg-query";
import { regDelete } from "../commands/reg-delete";
import { REG_VALUE_DEFAULT, TIMEOUT_DEFAULT } from "../constants";
import { PromiseStoppable } from "../promise-stoppable";

function nameOrDefault(valueName: string) {
    return { ...(valueName === REG_VALUE_DEFAULT ? { ve: true } : { v: valueName }) }
}

// TODO: if REG ADD contians data in REG_NONE, fallback to .reg file, REG IMPORT command.
type ExecutionStep = { op: 'ADD', key: string, value?: { name: string, content: RegValue } } | { op: "DELETE", key: string, valueName?: string };

/**
 * Merge the given object into the registry, only runs commands if changes were found (does one or more REG QUERY first for diffing)
 */
export function writeRegStruct(struct: RegStruct, { deleteUnspecifiedValues = false, timeout = TIMEOUT_DEFAULT, cmdParamsModifier, reg32, reg64, deleteKeys: normalDeleteKeys, deleteValues: origDeleteValues }: RegWriteOpts = {}): PromiseStoppable<RegWriteCmdResult> {

    struct = Object.entries(struct).reduce((acc, [k, v]) => ({ ...acc, [regKeyResolveFullPathFromShortcuts(k)]: v }), {} as RegStruct); // Normalize keys to lowercase

    const keyPaths = Object.keys(struct);
    const timeStarted = Date.now();

    const commonOpts: CommonOpts = { timeout, cmdParamsModifier } satisfies CommonOpts;
    if (reg32) commonOpts.reg32 = true;
    if (reg64) commonOpts.reg64 = true;

    const executionPlan = [] as ExecutionStep[];

    const lDeleteKeys = normalDeleteKeys?.map(k => regKeyResolveFullPathFromShortcuts(k).toLowerCase());
    const allKeyPaths = [...new Set([...keyPaths, ...(lDeleteKeys || [])])];
    const queryForKeys = allKeyPaths.map(k => ({ keyPath: k, ...commonOpts }))

    return PromiseStoppable.allStoppable([regQuery(queryForKeys)], query => {
        const timeleft = timeout - (Date.now() - timeStarted);
        commonOpts.timeout = timeleft;

        const existingData = query[0];
        const lKeysMissing = existingData.keysMissing

        // Delete values specified in deleteValues that are not already missing
        const lDeleteValues = origDeleteValues?.
            map(({ key, valueName }) => ({ key: regKeyResolveFullPathFromShortcuts(key).toLowerCase(), valueName: valueName.toLowerCase() }))
            .filter(({ key }) => !lDeleteKeys?.includes(key) && !lKeysMissing.includes(key));
        if (lDeleteValues?.length) {
            const tasksDeleteValues = lDeleteValues.map(({ key, valueName }) => ({ op: "DELETE", key, valueName } as ExecutionStep));
            executionPlan.push(...tasksDeleteValues)
        }

        // Delete keys specified in deleteKeys that are not already missing
        if (lDeleteKeys?.length) {
            const tasksDeleteKeys = lDeleteKeys.filter(k => !lKeysMissing.includes(k)).map(key => ({ op: "DELETE", key } as ExecutionStep));
            executionPlan.push(...tasksDeleteKeys);
        }

        // Add missing keys and all values in them
        executionPlan.push(...(lKeysMissing.map(k => {
            const valueEntries = Object.entries(struct).find(([ik]) => ik.toLowerCase() === k.toLowerCase())?.[1] || {};
            if (!Object.keys(valueEntries).length)
                return { op: "ADD", key: k } as ExecutionStep; // no values specified, just create key
            else
                return Object.entries(valueEntries).map(([v, value]) => ({ op: "ADD", key: k, value: { name: v, content: value } }) as ExecutionStep) as ExecutionStep[]
        }) as ExecutionStep[]).flat());

        const existingKeysToUpdate = Object.keys(struct).filter(k => lKeysMissing.findIndex(mk => mk === k.toLowerCase()) === -1);
        executionPlan.push(...existingKeysToUpdate.map(existingKey => {
            const dataInExistingKey = Object.entries(existingData.struct).find(([k]) => k.toLowerCase() === existingKey.toLowerCase())?.[1] || {} as RegValues;
            const entriesInNewValues = Object.entries(struct[existingKey]);

            const updateValuesCommands = entriesInNewValues
                .filter(([name, entry]) => !isEqual(Object.entries(dataInExistingKey).find(([exisName]) => exisName.toLowerCase() === name.toLowerCase())?.[1], entry))
                .map(([name, value]) => ({ op: "ADD", key: existingKey, value: { name, content: value } }) as ExecutionStep);

            const deleteCommands = (!deleteUnspecifiedValues || !dataInExistingKey) ? [] :
                Object.entries(dataInExistingKey)
                    .filter(([name]) => !findValueByNameLowerCaseInStruct(struct, existingKey, name) && deleteUnspecifiedValues) // Get existing values that are not specified in the new struct
                    .filter(([name]) =>
                        deleteUnspecifiedValues === 'all' ||
                        (deleteUnspecifiedValues === 'allExceptDefault' && name !== REG_VALUE_DEFAULT) ||
                        (deleteUnspecifiedValues === 'onlyDefault' && name === REG_VALUE_DEFAULT) ||
                        (typeof deleteUnspecifiedValues === 'function' && deleteUnspecifiedValues(existingKey, name, dataInExistingKey[name])))
                    .map(([name]) => ({ op: "DELETE", key: existingKey, valueName: name }) as ExecutionStep)

            return [...updateValuesCommands, ...deleteCommands];
        }).flat() as ExecutionStep[]);

        const allCommands = executionPlan.map(cmd => {
            if (cmd.op === "ADD") {
                const { key, value } = cmd;
                if (value) {
                    const { name, content } = value;
                    return regAdd({ keyPath: key, ...nameOrDefault(name), value: content.type === 'REG_NONE' ? { type: 'REG_NONE', data: undefined } : content, ...commonOpts });
                } else {
                    return regAdd({ keyPath: key, ...commonOpts });
                }
            } else if (cmd.op === "DELETE") {
                const { key, valueName } = cmd;
                if (valueName) {
                    return regDelete({ keyPath: key, ...nameOrDefault(valueName), ...commonOpts });
                } else {
                    return regDelete({ keyPath: key, ...commonOpts });
                }
            }
        }).filter(c => c != null)

        // TODO: implement REG IMPORT

        return PromiseStoppable.allStoppable(allCommands as PromiseStoppable<RegCmdResultWithCmds>[], r => ({ cmds: [...existingData.cmds, ...r.map(c => c.cmds).flat()] }));
    })
}