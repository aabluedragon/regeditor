import { RegQueryErrorMalformedLine, RegErrorInvalidSyntax, RegQueryErrorReadTooWide, RegErrorUnknown, findCommonErrorInTrimmedStdErr } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { RegType, RegData, RegQueryCmd, RegStruct, RegValue, RegQueryCmdResult, ExecFileParameters } from "../types";
import { applyParamsModifier, execFileUtil, getMinimumFoundIndex, getMinimumFoundIndexStrOrRegex, regexEscape, regKeyResolveFullPathFromShortcuts, VarArgsOrArray } from "../utils";
import { type ChildProcess } from "child_process"
import { TIMEOUT_DEFAULT, COMMAND_NAMES, REG_TYPES_ALL } from "../constants";

const THIS_COMMAND = COMMAND_NAMES.QUERY;

type RegQueryCmdResultSingle = {
    struct: RegStruct,
    keyMissing?: boolean
    cmd: ExecFileParameters

    /**
     * May be set to true only if "bestEffort" is set to true in the query and errors were found
     */
    hadErrors?: boolean
};

function parseRegValue(type: RegType, value: string | null, se: string): RegData {
    if (type === 'REG_DWORD' || type === 'REG_QWORD') {
        if (value == null) throw new RegQueryErrorMalformedLine('Value is null for ' + type);
        return parseInt(value, 16);
    } else if (type === 'REG_SZ' || type === 'REG_EXPAND_SZ') {
        return value || ''; // If value is null, return an empty string
    } else if (type === 'REG_MULTI_SZ') {
        if (value == null) return [];
        return value.split(se);
    } else if (type === 'REG_BINARY' || type === 'REG_NONE') { // REG_NONE treated as binary data as well.
        if ((value?.length || 0) % 2 !== 0) throw new RegQueryErrorMalformedLine(`${type} binary value length is not even: ${value}`);
        const m = value != null ? value.match(/../g) : null;
        if (m == null) return [];
        return m.map(h => parseInt(h, 16));
    } else throw new RegQueryErrorMalformedLine('Unknown REG type: ' + type);
}

function getQueryPathAndOpts(queryParam: RegQueryCmd) {
    const queryOpts: RegQueryCmd = (typeof queryParam === 'string') ? { keyPath: queryParam } : queryParam;
    return { queryOpts, queryKeyPath: queryOpts.keyPath };
}


const COLUMN_DELIMITER = '    ';
const INDENTATION_FOR_ENTRY_VALUE = '    ';
const INDENTATION_LENGTH_FOR_ENTRY_VALUE = INDENTATION_FOR_ENTRY_VALUE.length;

function regCmdQuerySingle(queryParam: RegQueryCmd): PromiseStoppable<RegQueryCmdResultSingle> {

    const { queryKeyPath: _queryKeyPathOriginal, queryOpts } = getQueryPathAndOpts(queryParam);

    // Convert query keypath from shortcuts, this is important for the parsing part in parseStdout (see Regular Expressions used).
    const queryKeyPath = regKeyResolveFullPathFromShortcuts(_queryKeyPathOriginal)

    const args = [] as string[];
    if (queryOpts.se) args.push('/se', queryOpts.se);;
    if (queryOpts.t) args.push('/t', Array.isArray(queryOpts.t) ? queryOpts.t.join(',') : queryOpts.t);
    if (queryOpts.s) args.push('/s');
    if (queryOpts.f) args.push('/f', queryOpts.f);
    if (queryOpts.ve) args.push('/ve');
    if (queryOpts.reg32) args.push('/reg:32');
    if (queryOpts.reg64) args.push('/reg:64');

    if (queryOpts.f) { // Params that are only allowed in combination with /f
        if (queryOpts.c) args.push('/c');
        if (queryOpts.e) args.push('/e');
        if (queryOpts.k) args.push('/k');
        if (queryOpts.d) args.push('/d');
    }

    // NOTE! this arg must come last, because it might not have a value after (e.g. "/v somestr" should not be conflate with "/v /t" as if /t is the value for /v)
    if (queryOpts.v) {
        args.push('/v');
        if (typeof queryOpts.v === 'string') args.push(queryOpts.v);
        else if (!queryOpts.f) throw new RegErrorInvalidSyntax('/v may only omit a string argument when used with /f');
    }

    return PromiseStoppable.createStoppable<RegQueryCmdResultSingle>((_resolve, _reject, setKiller) => {

        let proc: ChildProcess | null = null;

        const obj = {} as RegStruct;
        let hadErrors = false;
        let currentKey = null as string | null;

        const finish = (resOrErr: RegQueryCmdResultSingle | Error) => {
            if (proc) { proc.removeAllListeners(); proc.kill(); proc = null; }
            if (resOrErr instanceof Error) return _reject(resOrErr);
            _resolve(resOrErr);
        }

        function finishSuccess(keyMissing = false) {
            const res: RegQueryCmdResultSingle = { struct: obj, cmd: params };
            if (keyMissing) res.keyMissing = true;
            if (hadErrors) res.hadErrors = true;
            finish(res);
        }

        setKiller(() => finishSuccess());

        const bestEffort = queryOpts.bestEffort || false;

        const params = applyParamsModifier(THIS_COMMAND, ['reg', ['query', queryKeyPath, ...args]], queryOpts?.cmdParamsModifier);
        try {
            proc = execFileUtil(params, {
                onStdOut(str) {
                    stdoutStr += str;
                    parseStdout();
                },
                onStdErr(str) { stderrStr += str; },
                onExit: (code?: number | null) => {
                    proc = null;
                    try {
                        if (stdoutStr.trim() === 'End of search: 0 match(es) found.') return finishSuccess(); // happens when using /f and having 0 results
                        const trimmedStdErr = stderrStr.trim();
                        if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.') return finishSuccess(true);
                        const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr);
                        if (commonError) throw commonError;
                        if (stderrStr.length) throw new RegErrorUnknown(stderrStr);
                        if (code === null && stderrStr.length === 0) { throw new RegQueryErrorReadTooWide('Read too wide') }

                        // Might happen if using the /f "somestr" argument, and there are 1 or more results.
                        if (stdoutStr.endsWith('match(es) found.\r\n')) {
                            const matchIndex = stdoutStr.lastIndexOf('End of search: ');
                            if (matchIndex !== -1) {
                                stdoutStr = stdoutStr.substring(0, matchIndex);
                            }
                        }

                        parseStdout();
                        if (stdoutStr.length && stdoutStr.endsWith('\r\n')) {
                            handleDataChunk(stdoutStr.split('\r\n'));
                        }

                        finishSuccess();

                    } catch (e) {
                        finish(e as Error);
                    }
                }
            }, queryOpts?.elevated);

            let stdoutStr: string = '', stderrStr = '';

            // Verbose line splitting part.
            const nextValueInKey_Delimiter = new RegExp(`\r\n${INDENTATION_FOR_ENTRY_VALUE}.*(${REG_TYPES_ALL.join('|')}).*\r\n`);
            const newKeyAfterKeyEmpty_Delimiter = new RegExp(`\r\n${regexEscape(queryKeyPath)}.*\r\n`, 'i');
            const newKeyAfterKeyValuesFinished = new RegExp(`\r\n\r\n${regexEscape(queryKeyPath)}.*\r\n`, 'i'); // if \r\n\r\n, make sure next row is a key (otherwise it might be some very long, but legitimate entry value, e.g. REG_SZ)
            function parseStdout() {
                const stdoutLines: string[] = [];
                while (true) {
                    const { minIndex } = getMinimumFoundIndexStrOrRegex(stdoutStr, [newKeyAfterKeyValuesFinished, newKeyAfterKeyEmpty_Delimiter, nextValueInKey_Delimiter]);
                    if (minIndex === -1) break;

                    const row = stdoutStr.substring(0, minIndex);
                    stdoutLines.push(row);

                    stdoutStr = stdoutStr.substring(minIndex + 2)
                }
                if (stdoutLines.length > 0) handleDataChunk(stdoutLines);
            }

            function updateCurrentKey(key: string | null) {
                if (currentKey && !obj[currentKey]) obj[currentKey] = {}; // When reading keys and not their entries, and not run in recursive mode (/s), still add the key names to the struct
                currentKey = key;
            }

            function handleDataChunk(stdoutLines: string[]) {
                try {
                    for (const lineUntrimmed of stdoutLines) {
                        if (lineUntrimmed.length === 0) { updateCurrentKey(null); }
                        else if (lineUntrimmed.startsWith(' ')) {
                            if (!currentKey) {
                                if (bestEffort) { hadErrors = true; continue };
                                throw new RegQueryErrorMalformedLine('Unexpected value line (missing parent key)');
                            }
                            const delimiter = getMinimumFoundIndex(lineUntrimmed, REG_TYPES_ALL.map(t => `${COLUMN_DELIMITER}${t}${COLUMN_DELIMITER}`));
                            if (delimiter.minIndex === -1 || !delimiter.chosenPattern) {
                                if (bestEffort) { hadErrors = true; continue };
                                throw new RegQueryErrorMalformedLine(`Unexpected value line, missing type delimiter "${COLUMN_DELIMITER}" in value: "${lineUntrimmed}"`)
                            }

                            if (!(currentKey in obj)) obj[currentKey] = {};

                            const name = lineUntrimmed.substring(INDENTATION_LENGTH_FOR_ENTRY_VALUE, delimiter.minIndex);
                            const type = delimiter.chosenPattern.trim() as RegType;
                            try {
                                const valueInStr = lineUntrimmed.substring(delimiter.minIndex + delimiter.chosenPattern.length) || null
                                const data = parseRegValue(type, valueInStr, queryOpts?.se || '\\0');
                                obj[currentKey][name] = { type, data } as RegValue;
                            } catch (e) {
                                if (!bestEffort) throw e;
                                else { hadErrors = true; };
                            }
                        } else updateCurrentKey(lineUntrimmed)
                    }

                    if ('function' === typeof queryOpts.onProgress && Object.keys(obj).length > 0) {
                        setTimeout(() => {
                            const shouldStop = false === queryOpts?.onProgress?.(obj, finishSuccess);
                            if (shouldStop) finishSuccess()
                        })
                    }
                } catch (error) {
                    finish(error as Error);
                }
            }
        } catch (e) {
            finish(e as Error);
        }
    }, queryOpts?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Execute one or more reg queries.  
 * Executes the REG QUERY command.  
 * @param queryParam one or more queries to perform
 * @returns struct representing the registry entries
 */
export function regCmdQuery(...queriesParam: VarArgsOrArray<RegQueryCmd>): PromiseStoppable<RegQueryCmdResult> {
    const flattened = queriesParam.flat();
    const queries = flattened.map(getQueryPathAndOpts);
    const promises = flattened.map(regCmdQuerySingle);

    return PromiseStoppable.allStoppable(promises, (results) => {
        // Skipping the merge logic if just a single query.
        if (results.length === 1) {
            const r = results[0];
            const q = queries[0];
            return {
                struct: r.struct,
                keysMissing: r?.keyMissing ? [q.queryKeyPath] : [],
                cmds: [r.cmd],
                ...(r.hadErrors ? { hadErrors: true } : {})
            }
        }

        // Merge structs for all keys retreived
        const struct = {} as RegStruct;
        let keysMissing = [] as string[];
        let hadErrors = false;
        const cmds = [] as ExecFileParameters[];
        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            cmds.push(res.cmd);
            if (res.keyMissing) keysMissing.push(queries[i].queryKeyPath);
            if (res.hadErrors && !hadErrors) hadErrors = true;
            for (const key in res.struct) {
                struct[key] = { ...struct[key], ...res.struct[key] }
            }
        }
        return { struct, keysMissing, cmds, ...(hadErrors ? { hadErrors: true } : {}) };
    })
}

