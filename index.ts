
import * as child_process from "child_process"

export interface REG_SZ {
    type: 'REG_SZ';
    value: string;
}
export interface REG_EXPAND_SZ {
    type: 'REG_EXPAND_SZ';
    value: string;
}

export interface REG_DWORD {
    type: 'REG_DWORD';
    value: number;
}

export interface REG_QWORD {
    type: 'REG_QWORD';
    value: number;
}

export interface REG_MULTI_SZ {
    type: 'REG_MULTI_SZ';
    value: string[];
}

export interface REG_BINARY {
    type: 'REG_BINARY';
    value: number[];
}
export interface REG_NONE {
    type: 'REG_NONE';
    value: null
}

export type RegEntry = REG_SZ | REG_EXPAND_SZ | REG_DWORD | REG_QWORD | REG_MULTI_SZ | REG_BINARY | REG_NONE;
export type RegType = RegEntry['type'];
export type RegValue = RegEntry['value'];

export type RegKey = string;
export type RegName = string;
export type RegDictionary = Record<RegName, RegEntry>
export type RegStruct = Record<RegKey, RegDictionary>

export type RegQuerySingleResult = {
    struct: RegStruct,
    keyMissing?: boolean
};

export type RegQueryResultBulk = {
    struct: RegStruct,
    keysMissing: string[]
}

/**
 * Query for the "reg query" command
 */
export type RegQuery = RegKey | {

    /**
     * The registry key path to read from, e.g. "HKLM\\SOFTWARE\\Apple Inc.\\Bonjour"
     */
    keyPath: RegKey,

    /**
     * /v  
     * __msdocs:__  
     * Queries for a specific registry key values.  
     * If omitted, all values for the key are queried.  
     *  
     * Argument to this switch can be optional only when specified  
     * along with /f switch. This specifies to search in valuenames only.  
     */
    v?: string | true //TODO handle true only if /f is present typescript safety measure

    /**
     * /ve  
     * __msdocs:__  
     * Queries for the default value or empty value name (Default).
     */
    ve?: boolean

    /**
     * /s  
     * __msdocs:__  
     * Queries all subkeys and values recursively (like dir /s).
     */
    s?: boolean

    /**
     * /se  
     * Useful if you know an "REG_MULTI_SZ" entry might contain the default seprator \0 as a string value.
     * 
     * __msdocs:__  
     * Specifies the separator (length of 1 character only) in  
     * data string for REG_MULTI_SZ. Defaults to "\0" as the separator.  
     */
    se?: string

    /**
     * /f  
     * __msdocs:__  
     * Specifies the data or pattern to search for.  
     * Use double quotes if a string contains spaces. Default is "*".
     */
    f?: string // TODO this triggeres a search mode, prevent type safety of different arg combinations

    /**
     * /k  
     * __msdocs:__  
     * Specifies to search in key names only.
     */
    k?: boolean // TODO can only be used with /f

    /**
     * /d  
     * __msdocs:__  
     * Specifies the search in data only.
     */
    d?: boolean  // TODO can only be used with /f

    /**
     * /e  
     * __msdocs:__  
     * Specifies to return only exact matches.  
     * By default all the matches are returned.
     */
    e?: boolean // TODO can only be used with /f

    /**
     * /t  
     * Use for filtering entry types, e.g. "REG_SZ", "REG_DWORD", etc...
     * 
     * __msdocs:__  
     * Specifies registry value data type.  
     * Valid types are:  
     * REG_SZ, REG_MULTI_SZ, REG_EXPAND_SZ,  
     * REG_DWORD, REG_QWORD, REG_BINARY, REG_NONE  
     * Defaults to all types.  
     */
    t?: RegType[] | RegType

    /**
     * /c  
     * __msdocs:__  
     * Specifies that the search is case sensitive.  
     * The default search is case insensitive.  
     */
    c?: boolean // TODO only if /f is present

    /**
     * /reg:32  
     * __msdocs:__  
     * Specifies the key should be accessed using the 32-bit registry view.
     */
    reg32?: boolean

    /**
     * /reg:64  
     * __msdocs:__  
     * Specifies the key should be accessed using the 64-bit registry view.
     */
    reg64?: boolean

    /**
     * Milliseconds to wait for the command to finish before rejecting the promise.
     */
    timeout?: number

    /**
     * If stumbled upon unexpected lines, continue parsing the rest of the lines (will still throw if stubled upon unrecoverable error).  
     * TODO document on scenarious where this might be happen, and therefor useful
     */
    bestEffort?: boolean
}

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

export class RegErrorBadQuery extends Error { constructor(message: string) { super(message); this.name = 'RegErrorBadQuery'; } }
export class RegErrorUnknown extends Error { constructor(message: string) { super(message); this.name = 'RegErrorUnknown'; } }
export class RegErrorStdoutTooLarge extends Error { constructor(message: string) { super(message); this.name = 'RegErrorStdoutTooLarge'; } }
export class RegErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegErrorMalformedLine'; } }
export class RegErrorTimeout extends Error { constructor(message: string) { super(message); this.name = 'RegErrorTimeout'; } }

export async function readSingle(queryParam: RegQuery): Promise<RegQuerySingleResult> {
    const LINE_DELIMITER = new RegExp('\r\n|\r|\n');
    const COLUMN_DELIMITER = '    ';
    const INDENTATION_LENGTH_FOR_ENTRY_VALUE = 4;

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

    return new Promise<RegQuerySingleResult>((resolve, reject) => {

        let proc: child_process.ChildProcess | null = null;
        let timer: NodeJS.Timeout | null = setTimeout(() => {
            finish(new RegErrorTimeout('Timeout'));
        }, queryOpts.timeout || 30000);

        function finish(resOrErr: RegQuerySingleResult | Error) {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
            if (proc) { proc.kill(); proc = null; }
            if (resOrErr instanceof Error) return reject(resOrErr);
            resolve(resOrErr);
        }

        const bestEffort = queryOpts.bestEffort || false;

        try {
            proc = child_process.execFile('reg', ['query', queryKeyPath, ...args]);

            let stdoutStr = '', stderrStr = '';
            proc.stdout?.on('data', data => { stdoutStr += data; })
            proc.stderr?.on('data', data => { stderrStr += data; })

            const obj = {} as RegStruct;
            function parseData(strChunk: string) {
                function updateCurrentKey(key: string) {
                    if (currentKey && !obj[currentKey]) obj[currentKey] = {}; // When reading keys and not their entires.
                    currentKey = key;
                }

                let currentKey = null as string | null;
                const lines = strChunk.split(LINE_DELIMITER);
                for (const lineUntrimmed of lines) {
                    if (lineUntrimmed.length === 0) updateCurrentKey(null)
                    else if (lineUntrimmed.startsWith(' ')) {
                        const val = lineUntrimmed.substring(INDENTATION_LENGTH_FOR_ENTRY_VALUE).split(COLUMN_DELIMITER);
                        if (!currentKey) {
                            if (bestEffort) continue;
                            throw new RegErrorMalformedLine('Unexpected value line (missing parent key)');
                        }
                        if (!(currentKey in obj)) obj[currentKey] = {};
                        if (val.length < 2 || val.length > 3) { // can be only 2 columns if there's no value in the entry, but it still exists (e.g an empty REG_BINARY)
                            if (bestEffort) continue;
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
                        }
                    } else updateCurrentKey(lineUntrimmed)
                }
            }

            proc.on('exit', code => {
                proc = null;
                try {
                    if (code === 1) {
                        if (stdoutStr.trim() === 'End of search: 0 match(es) found.') return finish({ struct: {} });
                        const trimmedStdErr = stderrStr.trim();
                        if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.') return finish({ struct: {}, keyMissing: true });
                        if (trimmedStdErr.startsWith('ERROR: Invalid syntax.')) throw new RegErrorStdoutTooLarge(trimmedStdErr);
                    }
                    if (code === null && stderrStr.length === 0) { throw new Error('Read too large') } // TODO: maybe chunked read will solve this situation (or flush? trum the stdout somehow)
                    if (code !== 0 || stderrStr) { throw new RegErrorUnknown(stderrStr || 'Failed to read registry') }

                    parseData(stdoutStr)

                    finish({ struct: obj });
                } catch (e) {
                    finish(e);
                }
            });
        } catch (e) {
            finish(e);
        }
    });
}

type VarArgsOrArray<T> = T[] | T[][];

/**
 * Read registry entries.
 * @param queryParam the key path to read from, or an object with more options
 * @returns struct representing the registry entries, and whether the key was missing
 */
export async function readBulk(...queriesParam: VarArgsOrArray<RegQuery>): Promise<RegQueryResultBulk> {
    const flattened = queriesParam.flat();
    const queries = flattened.map(getQueryPathAndOpts);

    const results = await Promise.all(flattened.map(readSingle));

    // Merge structs for all keys retreived
    const struct = {} as RegStruct;
    let keysMissing = [] as string[];
    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.keyMissing) keysMissing.push(queries[i].queryKeyPath);
        for (const key in res.struct) {
            struct[key] = { ...struct[key], ...res.struct[key] }
        }
    }
    return { struct, keysMissing };
}


function write() {
    // TODO
}

function remove() {
    // TODO
}

function ensure() {
    // TODO
}

function batch() {
    // TODO
}

async function main() {
    try {
        const res = await readSingle(
            {
                keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay',
                // s: true,
            }
        )
        console.log(JSON.stringify(res, null, 4));
    } catch (e) {
        console.error(e);
    }
}

main()