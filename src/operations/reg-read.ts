import { regCmdExportSingle } from "../commands/reg-cmd-export";
import { ElevatedSudoPromptOpts, ExecFileParameters, RegData, RegReadCmd, RegReadResult, RegStruct, RegType, RegValue } from "../types";
import { join as path_join } from 'path';
import { tmpdir as os_tmpdir } from 'os';
import { generateRegFileName, getCommonOpts, handleReadAndQueryCommands, isWindows, sleep, VarArgsOrArray, stoppable } from "../utils";
import { readFile, rm } from "fs/promises";
import { REG_VALUENAME_DEFAULT, TIMEOUT_DEFAULT } from "../constants";
import { RegErrorGeneral } from "../errors";
import { regCmdQuerySingle } from "../commands/reg-cmd-query";
import { RegExportCmdResultSingle, RegReadResultSingle } from "../types-internal";
import { PromiseStoppable } from "../promise-stoppable";

const finishedReadingRequestedKey = new RegExp("\\r\\n\\[.*\\]\\r\\n.*\\r\\n\\[.*\\]\\r\\n");

/**
 * Execute a single REG EXPORT command (instead of REG QUERY), and read its values similarly to REG QUERY.
 * @param queryParam The query to perform
 * @returns struct representing the registry entries
 */
export const regReadWithExportSingle = (o: RegReadCmd, elevated: ElevatedSudoPromptOpts) => stoppable.newFn<RegReadResultSingle>(async (setStopper) => {

    const opts = typeof o === 'string' ? { keyPath: o } : o;
    const commonOpts = getCommonOpts(opts);

    const optFilterTypes = opts?.t?.length ? (new Set(Array.isArray(opts?.t)? opts?.t : [opts?.t])) : null;

    const tmpFilePath = path_join(os_tmpdir(), generateRegFileName());

    let exportCmdParams: ExecFileParameters | null = null;
    
    let exportResult: RegExportCmdResultSingle | null = null;
    let exportError: null | Error = null;
    let exportFinished = false;

    const exportCmd = regCmdExportSingle({ keyPath: opts.keyPath, fileName: tmpFilePath, ...commonOpts, cmdParamsModifier: ((cmd, params, wine) => { exportCmdParams = params; return opts?.cmdParamsModifier?.(cmd, params, wine) }) }, elevated)
    .then(async c => {
        try {
            // File might not exist if tried to export a non-existing key, so we use try-catch
            dataRetreived = await readFile(tmpFilePath, 'utf-16le')
        } catch (e) {}
        try { await rm(tmpFilePath) } catch (e) { }
        exportResult = c;
        exportFinished = true
        return c;
    }).catch(e => { exportError = e; exportFinished = true });

    if (!exportCmdParams) throw new RegErrorGeneral('REG EXPORT command did not set params');

    let stopped = false;
    setStopper(() => {
        exportCmd?.stop?.();
        stopped = true;
    });

    let dataRetreived: null | string = null;

    if(opts?.s) await exportCmd;
    else {
        const startTime = Date.now();
        while ((Date.now() - startTime < (opts?.timeout ?? TIMEOUT_DEFAULT)) && !exportFinished && dataRetreived == null && !stopped) {
            try {
                const c = await readFile(tmpFilePath, 'utf-16le')
                if (finishedReadingRequestedKey.test(c)) {
                    exportCmd.stop();
                    dataRetreived = c;
                }
            } catch (e) { }
            await sleep(25);
        }
    }

    try { await rm(tmpFilePath) } catch (e) { }

    if (exportError) throw exportError;

    if (stopped || dataRetreived == null || !dataRetreived?.length) return { struct: {}, keyMissing: true, cmd: exportCmdParams };

    const struct: RegStruct = {};

    // Trim header and go to the first key
    let dataToProcess = dataRetreived.substring(dataRetreived.indexOf('['));

    let currentKey: string | null = null;

    const lines = dataToProcess.trim().split('\r\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (!line.length) continue;
        while (line.endsWith('\\')) { // Some value data is split into multiple lines, .reg files use "\" to indicate continuation
            i++;
            line = line.substring(0, line.length - 1) + lines[i].trimStart();
        }
        const indexOfOpeningBracket = line.indexOf('[');
        if (indexOfOpeningBracket === 0) {
            line.substring(indexOfOpeningBracket + 1);
            const indexOfClosingBracket = line.indexOf(']');
            currentKey = line.substring(1, indexOfClosingBracket);
            if (!struct[currentKey]) struct[currentKey] = {};
            continue;
        }
        if (currentKey == null) throw new RegErrorGeneral('Found values before key');

        let valueName: string;
        let valuePart: string;

        if (line.startsWith('"')) {
            const valueSeparator = '"=';
            const indexOfEquals = line.indexOf(valueSeparator);
            valueName = line.substring(1, indexOfEquals);
            valuePart = line.substring(indexOfEquals + valueSeparator.length);
        } else if (line.startsWith('@=')) {
            valueName = REG_VALUENAME_DEFAULT;
            valuePart = line.substring(2);
        } else throw new RegErrorGeneral('Unsupported value format');

        if(opts?.v && valueName.toLowerCase() !== opts.v.toLowerCase()) continue;
        if(opts?.ve && valueName !== REG_VALUENAME_DEFAULT) continue;

        let regType: RegType | null = null;
        let data: RegData | null = null;
        if (valuePart.startsWith('"')) {
            regType = 'REG_SZ';
            data = valuePart.substring(1, valuePart.length - 1);
            if (data.endsWith('\u0000')) data = data.substring(0, data.length - 1);
        } else if (valuePart.startsWith('dword:')) {
            regType = 'REG_DWORD';
            data = parseInt(valuePart.substring(6), 16)
        } else if (valuePart.startsWith('hex(7):')) {
            regType = 'REG_MULTI_SZ';
            const stringHex = valuePart.substring(7).replaceAll(',', '');
            const stringBuffer = Buffer.from(stringHex, 'hex')
            const stringConnectedWithU0000 = stringBuffer.toString('utf16le')
            const strings = stringConnectedWithU0000.split('\u0000');
            while (strings?.length && strings[strings.length - 1].length === 0) strings.pop(); // pop empty strings
            data = strings
        } else if (valuePart.startsWith('hex(b):')) {
            regType = 'REG_QWORD';
            const stringHex = valuePart.substring(7).split(',').reverse().join('').replaceAll(',', '');
            data = parseInt(stringHex, 16)
        } else if (valuePart.startsWith('hex:')) {
            regType = 'REG_BINARY';
            data = valuePart.substring(4).split(',').map(v => parseInt(v, 16))
        } else if (valuePart.startsWith('hex(2):')) {
            regType = 'REG_EXPAND_SZ';
            valuePart = valuePart.substring(7);
            data = Buffer.from(valuePart.replaceAll(',', ''), 'hex').toString('utf16le')
            if (data.endsWith('\u0000')) data = data.substring(0, data.length - 1);
        } else if (valuePart.startsWith('hex(0):')) {
            regType = 'REG_NONE';
            data = valuePart.substring(7).split(',').map(v => parseInt(v, 16))
        } else throw new RegErrorGeneral('Unsupported value type');

        if(optFilterTypes && !optFilterTypes?.has(regType)) continue;

        struct[currentKey][valueName] = { type: regType, data } as RegValue;
    }

    return { struct, cmd: exportCmdParams, ...(Object.keys(struct).length === 0 ? { keyMissing: true } : {}) };
})

export function regReadSingle(o: RegReadCmd, elevated:ElevatedSudoPromptOpts): PromiseStoppable<RegReadResultSingle> {
    const opts = typeof o === 'string' ? { keyPath: o } : o;

    const preferredReadCmdForPlatform: typeof opts.readCmd = isWindows ? 'query' : 'export';
    const useCmd = (opts?.readCmd === 'auto' || !opts?.readCmd) ? preferredReadCmdForPlatform : opts.readCmd;

    if(useCmd === 'query') {
        return regCmdQuerySingle(o, elevated);
    } else if(useCmd === 'export') {
        return regReadWithExportSingle(o, elevated);
    }
    throw new RegErrorGeneral('Unsupported readCmd mode');
}

/**
 * Reads one or more keys from the registry.
 * 
 * On Windows, it executes the REG QUERY command.  
 * On other platforms, it executes the REG EXPORT command via Wine, and reads the values from the temporary exported file.  
 * Using REG EXPORT to read allows processing unicode characters when using Wine.
 * @param queryParam The query to perform
 * @returns struct representing the registry entries
 */
export function regRead(...queriesParam: VarArgsOrArray<RegReadCmd>): PromiseStoppable<RegReadResult> {
    return handleReadAndQueryCommands(regReadSingle, ...queriesParam);
}

