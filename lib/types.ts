
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

export type RegQuerySingleSingle = {
    struct: RegStruct,
    keyMissing?: boolean

    /**
     * May be set to true only if "bestEffort" is set to true in the query and errors were found
     */
    hadErrors?: boolean
};

export type RegQueryResult = {
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
     * Can use true only if /f is present.  
     * If /f is not present, must be a string, or omitted.  
     * 
     * __msdocs:__  
     * Queries for a specific registry key values.  
     * If omitted, all values for the key are queried.  
     *  
     * Argument to this switch can be optional only when specified  
     * along with /f switch. This specifies to search in valuenames only.  
     */
    v?: string | true

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
     * Triggeres "Find" mode.  
     * 
     * __msdocs:__  
     * Specifies the data or pattern to search for.  
     * Use double quotes if a string contains spaces. Default is "*".
     */
    f?: string

    /**
     * /k  
     * Might only be usable with /f  
     * 
     * __msdocs:__  
     * Specifies to search in key names only.
     */
    k?: boolean

    /**
     * /d  
     * Might only be usable with /f  
     * 
     * __msdocs:__  
     * Specifies the search in data only.
     */
    d?: boolean

    /**
     * /e  
     * Might only be usable with /f  
     * 
     * __msdocs:__  
     * Specifies to return only exact matches.  
     * By default all the matches are returned.
     */
    e?: boolean

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
     * Might only be usable with /f  
     * 
     * __msdocs:__  
     * Specifies that the search is case sensitive.  
     * The default search is case insensitive.  
     */
    c?: boolean

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
     */
    bestEffort?: boolean

    /**
     * Use to observe the value of the the result registry struct before it has finished reading, call stop() or return false to stop reading.  
     * Might be useful for long reads, e.g. when using the /s flag for recursive read.
     */
    onProgress?: (partialStruct: RegStruct, stop: () => void) => false | undefined | void
}

type FlagParamOff = never | false | undefined

type RegDeleteV = {
    /**
     * /v  
     * __Example from msdocs:__  
     * REG DELETE \\ZODIAC\HKLM\Software\MyCo /v MTU  
     * Deletes the registry value MTU under MyCo on ZODIAC
     */
    v: string

    ve?: FlagParamOff
    va?: FlagParamOff
}

type RegDeleteVE = {
    v?: FlagParamOff

    /**
     * /ve  
     * __msdocs:__
     * delete the value of empty value name (Default).
     */
    ve: boolean
    va?: FlagParamOff
}

type RegDeleteVA = {
    v?: FlagParamOff
    ve?: FlagParamOff

    /**
     * /va  
     * __msdocs:__
     * delete all values under this key.
     */
    va: boolean
}

export type RegDelete = {keyPath:string} & (RegDeleteV | RegDeleteVA | RegDeleteVE) & ({
    /**
     * /reg:32  
     * __msdocs:__
     * Specifies the key should be accessed using the 32-bit registry view.
     */
    reg32?: boolean

    reg64?: FlagParamOff
} | {
    /**
     * /reg:64  
     * __msdocs:__
     * Specifies the key should be accessed using the 64-bit registry view.
     */
    reg64?: boolean

    reg32?: FlagParamOff
})