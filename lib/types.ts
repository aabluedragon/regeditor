
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

    /**
     * May be set to true only if "bestEffort" is set to true in the query and errors were found
     */
    hadErrors?: boolean
};

export type RegQueryResultBulk = {
    struct: RegStruct,
    keysMissing: string[],

    /**
     * May be set to true only if "bestEffort" is set to true in the query and errors were found
     */
    hadErrors?: boolean
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

    /**
     * Use to observe the value of the the result registry struct before it has finished reading, call stop() or return false to stop reading.  
     * Might be useful for long reads, e.g. when using the /s flag for recursive read.
     */
    onProgress?: (partialStruct: RegStruct, stop: () => void) => false | undefined | void
}