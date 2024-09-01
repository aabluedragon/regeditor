import { RegErrorMalformedLine, RegErrorBadQuery, RegErrorTimeout, RegErrorStdoutTooLarge, RegErrorUnknown } from "./errors";
import { PromiseStoppable } from "./promise-stoppable";
import { RegType, RegValue, RegQuery, RegQuerySingleResult, RegStruct, RegEntry, RegQueryResultBulk } from "./types";
import { getMinimumFoundIndex, VarArgsOrArray } from "./utils";
import { execFile, ChildProcess } from "child_process"

function parseRegValue(type: RegType, value: string | null, se: string): RegValue {
    if (type === 'REG_DWORD' || type === 'REG_QWORD') {
        if (value == null) throw new RegErrorMalformedLine('Value is null for ' + type);
        return parseInt(value, 16);
    } else if (type === 'REG_SZ' || type === 'REG_EXPAND_SZ') {
        return value || ''; // If value is null, return an empty string
    } else if (type === 'REG_MULTI_SZ') {
        if (value == null) return [];
        return value.split(se);
    } else if (type === 'REG_BINARY') {
        if ((value?.length || 0) % 2 !== 0) throw new RegErrorMalformedLine(`${type} binary value length is not even: ${value}`);
        const m = value != null ? value.match(/../g) : null;
        if (m == null) return [];
        return m.map(h => parseInt(h, 16));
    } else if (type === 'REG_NONE') {
        return null;
    } else throw new RegErrorMalformedLine('Unknown REG type: ' + type);
}

function getQueryPathAndOpts(queryParam: RegQuery) {
    const queryKeyPath = (typeof queryParam === 'string') ? queryParam : queryParam.keyPath;
    const queryOpts: RegQuery = (typeof queryParam === 'string') ? { keyPath: queryKeyPath } : queryParam;
    return { queryKeyPath, queryOpts };
}

const COLUMN_DELIMITER = '    ';
const INDENTATION_FOR_ENTRY_VALUE = '    ';
const INDENTATION_LENGTH_FOR_ENTRY_VALUE = INDENTATION_FOR_ENTRY_VALUE.length;

function querySingle(queryParam: RegQuery): PromiseStoppable<RegQuerySingleResult> {

    const { queryKeyPath, queryOpts } = getQueryPathAndOpts(queryParam);

    const args = [] as string[];
    if (queryOpts.se) {
        if (queryOpts.se.length !== 1) throw new RegErrorBadQuery('/se must be a single character');
        args.push('/se', queryOpts.se);;
    }
    if (queryOpts.t)
        args.push('/t', Array.isArray(queryOpts.t) ? queryOpts.t.join(',') : queryOpts.t);
    if (queryOpts.s)
        args.push('/s');
    if (queryOpts.c)
        args.push('/c');
    if (queryOpts.f)
        args.push('/f', queryOpts.f);
    if (queryOpts.ve)
        args.push('/ve');
    if (queryOpts.e)
        args.push('/e');
    if (queryOpts.k)
        args.push('/k');
    if (queryOpts.d)
        args.push('/d');
    if (queryOpts.reg32)
        args.push('/reg:32');
    if (queryOpts.reg64)
        args.push('/reg:64');

    // NOTE! this arg must come last, because it might not have a value after (e.g. "/v somestr" should not be conflate with "/v /t" as if /t is the value for /v)
    if (queryOpts.v) {
        args.push('/v');
        if (typeof queryOpts.v === 'string') args.push(queryOpts.v);
    }

    return PromiseStoppable.createStoppable<RegQuerySingleResult>((resolve, reject, setKiller) => {

        let proc: ChildProcess | null = null;
        let timer: NodeJS.Timeout | null = setTimeout(() => {
            finish(new RegErrorTimeout('Timeout'));
        }, queryOpts.timeout || 30000);


        const obj = {} as RegStruct;
        let hadErrors = false;
        let currentKey = null as string | null;

        const finish = (resOrErr: RegQuerySingleResult | Error) => {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
            if (proc) { proc.removeAllListeners(); proc.kill(); proc = null; }
            if (resOrErr instanceof Error) return reject(resOrErr);
            resolve(resOrErr);
        }

        function finishSuccess(keyMissing = false) {
            const res: RegQuerySingleResult = { struct: obj };
            if (keyMissing) res.keyMissing = true;
            if (hadErrors) res.hadErrors = true;
            finish(res);
        }

        setKiller(finishSuccess);

        const bestEffort = queryOpts.bestEffort || false;

        try {
            proc = execFile('reg', ['query', queryKeyPath, ...args]);

            let stdoutStr: string = '', stderrStr = '';
            let firstStart = false

            proc.stdout?.on('data', data => {
                stdoutStr += data.toString();

                if (!firstStart && stdoutStr.startsWith('\r\n')) {
                    firstStart = true;
                    stdoutStr = stdoutStr.substring(2);
                }

                const stdoutLines: string[] = [];
                while (true) {
                    // Tricky line splitting of output from "reg" tool, preventing some edge cases.
                    const nextValueInKey_Delimiter = `\r\n${INDENTATION_FOR_ENTRY_VALUE}`;
                    const keyEnded_Delimiter = `\r\n\r\n${queryKeyPath}`; // if \r\n\r\n, make sure next row is a key (otherwise it might be some very long, but legitimate entry value, e.g. REG_SZ)

                    const { minIndex, chosenPattern } = getMinimumFoundIndex(stdoutStr, [nextValueInKey_Delimiter, keyEnded_Delimiter]);
                    if (minIndex === -1) break;
                    const row = stdoutStr.substring(0, minIndex);

                    stdoutLines.push(row);
                    if (chosenPattern === keyEnded_Delimiter) {
                        stdoutLines.push('');
                        stdoutStr = stdoutStr.substring(minIndex + 4);
                    } else {
                        stdoutStr = stdoutStr.substring(minIndex + 2);
                    }
                }
                if (stdoutLines.length > 0) handleDataChunk(stdoutLines);
            });

            proc.stderr?.on('data', data => { stderrStr += data; })

            function updateCurrentKey(key: string) {
                if (currentKey && !obj[currentKey]) obj[currentKey] = {}; // When reading keys and not their entries, and not run in recursive mode (/s), still add the key names to the struct
                currentKey = key;
            }

            function handleDataChunk(stdoutLines: string[]) {
                try {
                    for (const lineUntrimmed of stdoutLines) {
                        if (lineUntrimmed.length === 0) { updateCurrentKey(null); }
                        else if (lineUntrimmed.startsWith(' ')) {
                            const val = lineUntrimmed.substring(INDENTATION_LENGTH_FOR_ENTRY_VALUE).split(COLUMN_DELIMITER);
                            if (!currentKey) {
                                if (bestEffort) { hadErrors = true; continue };
                                throw new RegErrorMalformedLine('Unexpected value line (missing parent key)');
                            }
                            if (!(currentKey in obj)) obj[currentKey] = {};
                            if (val.length < 2 || val.length > 3) { // can be only 2 columns if there's no value in the entry, but it still exists (e.g an empty REG_BINARY)
                                if (bestEffort) { hadErrors = true; continue };
                                throw new RegErrorMalformedLine(`Unexpected value line, probably "${COLUMN_DELIMITER}" in value (${COLUMN_DELIMITER.length} spaces): "${lineUntrimmed}"`)
                            };
                            const name = val[0];
                            const type = val[1] as RegType;
                            const valueInStr = val?.[2] || null;
                            try {
                                const value = parseRegValue(type, valueInStr, queryOpts?.se || '\\0');
                                obj[currentKey][name] = { type, value } as RegEntry;
                            } catch (e) {
                                if (!bestEffort) throw e;
                                else { hadErrors = true; };
                            }
                        } else updateCurrentKey(lineUntrimmed)
                    }

                    if ('function' === typeof queryOpts.onProgress && Object.keys(obj).length > 0) {
                        setTimeout(() => {
                            const shouldStop = false === queryOpts.onProgress(obj, finishSuccess);
                            if (shouldStop) finishSuccess()
                        })
                    }
                } catch (error) {
                    finish(error);
                }
            }

            proc.on('exit', code => {
                proc = null;
                try {
                    if (stdoutStr.trim() === 'End of search: 0 match(es) found.') return finishSuccess(); // string returned when using /f and having 0 results
                    if (code === 1) {
                        const trimmedStdErr = stderrStr.trim();
                        if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.') return finishSuccess(true);
                        if (trimmedStdErr.startsWith('ERROR: Invalid syntax.')) throw new RegErrorBadQuery(trimmedStdErr);
                    }
                    if (code === null && stderrStr.length === 0) { throw new RegErrorStdoutTooLarge('Read too large') }
                    if (code !== 0 || stderrStr) { throw new RegErrorUnknown(stderrStr || 'Failed to read registry') }

                    // Might happen if using the /f "somestr" argument, and there are 1 or more results.
                    if (stdoutStr.endsWith('match(es) found.\r\n')) {
                        const matchIndex = stdoutStr.lastIndexOf('End of search: ');
                        if (matchIndex !== -1) {
                            stdoutStr = stdoutStr.substring(0, matchIndex);
                        }
                    }

                    handleDataChunk(stdoutStr.split('\r\n')); // Handle the remaining data, if any.

                    finishSuccess();

                } catch (e) {
                    finish(e);
                }
            });
        } catch (e) {
            finish(e);
        }
    });
}

/**
 * Execute one or more reg queries.
 * @param queryParam one or more queries to perform
 * @returns struct representing the registry entries
 */
export function query(...queriesParam: VarArgsOrArray<RegQuery>): PromiseStoppable<RegQueryResultBulk> {
    const flattened = queriesParam.flat();
    const queries = flattened.map(getQueryPathAndOpts);
    const promises = flattened.map(querySingle);

    return PromiseStoppable.allStoppable(promises, async (results) => {
        // Skipping the merge logic if just a single query.
        if (results.length === 1) {
            const r = results[0];
            const q = queries[0];
            return {
                struct: r.struct,
                keysMissing: r?.keyMissing ? [q.queryKeyPath] : [],
                ...(r.hadErrors ? { hadErrors: true } : {})
            }
        }

        // Merge structs for all keys retreived
        const struct = {} as RegStruct;
        let keysMissing = [] as string[];
        let hadErrors = false;
        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (res.keyMissing) keysMissing.push(queries[i].queryKeyPath);
            if (res.hadErrors && !hadErrors) hadErrors = true;
            for (const key in res.struct) {
                struct[key] = { ...struct[key], ...res.struct[key] }
            }
        }
        return { struct, keysMissing };
    })
}

