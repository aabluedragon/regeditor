import { findValueByNameLowerCaseInStruct, generateRegFileName, getCommonOpts, isEqual, isWindows, regKeyResolvePath, stoppable } from "../utils";
import { RegCmdResultWithCmds, RegData, RegKey, RegStruct, RegType, RegValue, RegValues, RegApplyCmdMode, RegApplyResult, RegApplyOpts, RegReadResult, RegReadCmdOpts } from "../types";
import { regCmdAdd } from "../commands/reg-cmd-add";
import { regCmdDelete } from "../commands/reg-cmd-delete";
import { REG_VALUENAME_DEFAULT, TIMEOUT_DEFAULT } from "../constants";
import { PromiseStoppable } from "../promise-stoppable";
import { RegErrorInvalidSyntax } from "../errors";
import { tmpdir } from 'os'
import { join as path_join, dirname as path_dirname, basename as path_basename } from "path";
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs'
import { regCmdImport } from "../commands/reg-cmd-import";
import { regRead } from "./reg-read";

function nameOrDefault(valueName: string) {
    return { ...(valueName === REG_VALUENAME_DEFAULT ? { ve: true } : { v: valueName }) }
}

function serializeDataForRegFile(type: RegType, data: RegData): string {
    switch (type) {
        case 'REG_DWORD':
            return `dword:${data.toString(16).padStart(2, '0')}`;
        case 'REG_QWORD':
            return 'hex(b):' + (data as number[]).map(n => n.toString(16).padStart(2, '0')).join(',')
        case 'REG_EXPAND_SZ':
            return 'hex(2):' + [...Buffer.from(data as string, 'utf16le'), 0, 0].map(n => n.toString(16).padStart(2, '0')).join(',');
        case 'REG_SZ':
            return `"${data}"`
        case 'REG_MULTI_SZ':
            const bytesArray = [...(data as string[]).map(str => [...Buffer.from(str, 'utf16le'), 0, 0]).flat(), 0, 0];
            const hexString = bytesArray.map(n => n.toString(16).padStart(2, '0')).join(',');
            return `hex(7):${hexString}`;
        case 'REG_BINARY':
            return 'hex:' + (data as number[]).map(n => n.toString(16).padStart(2, '0')).join(',');
        case 'REG_NONE':
            return 'hex(0):' + (data as number[]).map(n => n.toString(16).padStart(2, '0')).join(',')
        default:
            throw new RegErrorInvalidSyntax(`Invalid data type: ${type}`);
    }
}

type ExecutionStep = { op: 'ADD', key: string, value?: { name: string, content: RegValue } } | { op: "DELETE", key: string, valueName?: string };

/**
 * Merge the given object into the registry, only runs commands if changes were found (reads the keys first for diffing)
 */
export function regApply(struct: RegStruct, regApplyOpts: RegApplyOpts = {}): PromiseStoppable<RegApplyResult> {

    struct = Object.entries(struct).reduce((acc, [k, v]) => ({ ...acc, [regKeyResolvePath(k)]: v }), {} as RegStruct); // Normalize keys to lowercase

    const keyPaths = Object.keys(struct);
    const timeStarted = Date.now();

    const { deleteUnspecifiedValues = false, timeout = TIMEOUT_DEFAULT, readCmd, deleteKeys: normalDeleteKeys, deleteValues: origDeleteValues, forceCmdMode, tmpPath } = regApplyOpts
    const commonOpts = getCommonOpts(regApplyOpts);

    const executionPlan = [] as ExecutionStep[];

    const lDeleteKeys = normalDeleteKeys?.map(k => regKeyResolvePath(k).toLowerCase());
    const allKeyPaths = [...new Set([...keyPaths, ...(lDeleteKeys || [])])];
    const readKeys = readCmd === 'skip' ? [] : allKeyPaths.map(k => ({ keyPath: k, readCmd: readCmd, ...commonOpts }) as RegReadCmdOpts)

    function handleAfterRead(existingData?: RegReadResult) {
        if (existingData == null) existingData = { cmds: [], struct: {}, keysMissing: Object.keys(struct) }
        const lKeysMissing = existingData.keysMissing.map(k => k.toLowerCase())

        // Delete values specified in deleteValues that are not already missing
        const lDeleteValues = origDeleteValues?.
            map(({ key, valueName }) => ({ key: regKeyResolvePath(key).toLowerCase(), valueName: Array.isArray(valueName) ? valueName : [valueName] }))
            .filter(({ key }) => !lDeleteKeys?.includes(key.toLowerCase()) && !lKeysMissing.includes(key.toLowerCase()));
        if (lDeleteValues?.length) {
            const tasksDeleteValues = lDeleteValues.map(({ key, valueName: valueNames }) => valueNames.map(valueName => ({ op: "DELETE", key, valueName }) as ExecutionStep));
            executionPlan.push(...tasksDeleteValues.flat())
        }

        // Delete keys specified in deleteKeys that are not already missing
        if (lDeleteKeys?.length) {
            const tasksDeleteKeys = lDeleteKeys.filter(k => !lKeysMissing.includes(k)).map(key => ({ op: "DELETE", key } as ExecutionStep));
            executionPlan.push(...tasksDeleteKeys);
        }

        // Add missing keys and all values in them
        executionPlan.push(...(existingData.keysMissing.map(k => {
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
                        (deleteUnspecifiedValues === 'allExceptDefault' && name !== REG_VALUENAME_DEFAULT) ||
                        (deleteUnspecifiedValues === 'onlyDefault' && name === REG_VALUENAME_DEFAULT) ||
                        (typeof deleteUnspecifiedValues === 'function' && deleteUnspecifiedValues(existingKey, name, dataInExistingKey[name])))
                    .map(([name]) => ({ op: "DELETE", key: existingKey, valueName: name }) as ExecutionStep)

            return [...updateValuesCommands, ...deleteCommands];
        }).flat() as ExecutionStep[]);

        const _preferredMode: RegApplyCmdMode = (executionPlan.length > 1 || executionPlan.findIndex(c => c.op === "ADD" && c.value?.content?.type === 'REG_NONE' && c.value?.content?.data != null)) !== -1 ? "import" : "add-delete";
        const useCmdMode = forceCmdMode || _preferredMode;

        // Run all steps in the execution plan, using either REG ADD and REG DELETE commands, or via .reg file import (REG IMPORT)
        const allCommands = useCmdMode === 'add-delete' ? executionPlan.map(cmd => {
            if (cmd.op === "ADD") {
                const { key, value } = cmd;
                if (value) {
                    const { name, content } = value;
                    return regCmdAdd({ keyPath: key, ...nameOrDefault(name), value: content, ...commonOpts });
                } else {
                    return regCmdAdd({ keyPath: key, ...commonOpts });
                }
            } else if (cmd.op === "DELETE") {
                const { key, valueName } = cmd;
                if (valueName) {
                    return regCmdDelete({ keyPath: key, ...nameOrDefault(valueName), ...commonOpts });
                } else {
                    return regCmdDelete({ keyPath: key, ...commonOpts });
                }
            }
        }).filter(c => c != null) :
            // REG IMPORT mode
            (() => {
                let fileString = 'Windows Registry Editor Version 5.00\r\n\r\n';
                const newRegStruct = {} as { [key: RegKey]: { [valueName: string]: string } };
                const deleteKeys = [] as string[];

                const commandsAddDelete = [] as PromiseStoppable<RegCmdResultWithCmds>[];
                for (const step of executionPlan) {
                    if (step.op === 'ADD') {
                        const { key, value } = step;
                        if (value) {
                            const { name, content } = value;
                            if (isWindows || (content.type != 'REG_MULTI_SZ' && content.type != 'REG_EXPAND_SZ')) {
                                newRegStruct[key] = newRegStruct[key] || {};
                                const prefix = name === REG_VALUENAME_DEFAULT ? `@` : `"${name}"`;
                                newRegStruct[key][name] = `${prefix}=${serializeDataForRegFile(content.type, content.data)}`
                            } else {
                                // Used in case of REG_MULTI_SZ and REG_EXPAND_SZ in Wine, it's not working properly there with .reg and with non-english characters.
                                commandsAddDelete.push(regCmdAdd({ keyPath: key, ...nameOrDefault(name), value: content, ...commonOpts }));
                            }
                        } else {
                            newRegStruct[key] = {};
                        }
                    } else if (step.op === 'DELETE') {
                        const { key, valueName } = step;
                        if (valueName) {
                            newRegStruct[key] = newRegStruct[key] || {};
                            const prefix = valueName === REG_VALUENAME_DEFAULT ? `@` : `"${valueName}"`;
                            newRegStruct[key][valueName] = `${prefix}=-`
                        } else {
                            deleteKeys.push(key);
                        }
                    }
                }

                for (const key of deleteKeys) {
                    fileString += `[-${key}]\r\n\r\n`
                }

                for (const key in newRegStruct) {
                    fileString += `[${key}]\r\n`
                    for (const valueName in newRegStruct[key]) {
                        fileString += newRegStruct[key][valueName] + '\r\n'
                    }
                    fileString += '\r\n'
                }

                let tmpFileName: string | null = null;
                let tmpDir: string | null = null;
                if (tmpPath) {
                    if (tmpPath.type === 'dir') {
                        tmpDir = tmpPath.path;
                    } else if (tmpPath.type === 'file') {
                        tmpDir = path_dirname(tmpPath.path);
                        tmpFileName = path_basename(tmpPath.path);
                    }
                    if (tmpDir?.length && !existsSync(tmpDir)) {
                        mkdirSync(tmpDir, { recursive: true });
                    }
                }
                if (!tmpDir) tmpDir = tmpdir();
                if (!tmpFileName) tmpFileName = generateRegFileName();

                const tmpFilePath = path_join(tmpDir, tmpFileName);
                writeFileSync(tmpFilePath, Buffer.from(`\ufeff${fileString}`, 'utf16le')); // without \ufeff prefix, we get an error: The specified file is not a registry file. You can import only registry files.
                return [...commandsAddDelete, regCmdImport({ fileName: tmpFilePath, ...commonOpts }).finally(() => { try { rmSync(tmpFilePath) } catch { } })];
            })();

        return stoppable.all(allCommands as PromiseStoppable<RegCmdResultWithCmds>[]).then(r => ({ prevStruct: existingData.struct, cmds: [...existingData.cmds, ...r.map(c => c.cmds).flat()] }) satisfies RegApplyResult);
    }

    if (!readKeys?.length) return handleAfterRead();
    else return regRead(readKeys).then(existingData => {
        const timeleft = timeout - (Date.now() - timeStarted);
        commonOpts.timeout = timeleft;
        return handleAfterRead(existingData);
    })
}