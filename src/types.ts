
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
    value?: null
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

type OptionsReg64Or32 = ({
    /**
     * /reg:32  
     * __msdocs:__  
     * Specifies the key should be accessed using the 32-bit registry view.
     */
    reg32?: boolean
    reg64?: Omitted
} | {
    /**
     * /reg:64  
     * __msdocs:__  
     * Specifies the key should be accessed using the 64-bit registry view.
     */
    reg64?: boolean
    reg32?: Omitted
});

type RegQueryBase = {

    /**
     * The registry key path to read from, e.g. "HKLM\\SOFTWARE\\Apple Inc.\\Bonjour"
     */
    keyPath: RegKey,

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

/**
 * Query for the "reg query" command
 */
export type RegQuery = RegKey | (RegQueryBase & ({
    // Params that can only be used in mode /f

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
     * /f  
     * Triggeres "Find" mode.  
     * 
     * __msdocs:__  
     * Specifies the data or pattern to search for.  
     * Use double quotes if a string contains spaces. Default is "*".
     */
    f: string

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
     * /c  
     * Might only be usable with /f  
     * 
     * __msdocs:__  
     * Specifies that the search is case sensitive.  
     * The default search is case insensitive.  
     */
    c?: boolean
} | {
    // Restricted params without /f
    f?: Omitted
    v?: string | Omitted
    c?: Omitted
    e?: Omitted
    d?: Omitted
    k?: Omitted
}) & OptionsReg64Or32)

type Omitted = never | false | undefined | null

type RegDeleteV = {
    /**
     * /v  
     * __Example from msdocs:__  
     * REG DELETE \\ZODIAC\HKLM\Software\MyCo /v MTU  
     * Deletes the registry value MTU under MyCo on ZODIAC
     */
    v: string

    ve?: Omitted
    va?: Omitted
}

type RegDeleteVE = {
    v?: Omitted

    /**
     * /ve  
     * __msdocs:__
     * delete the value of empty value name (Default).
     */
    ve: boolean
    va?: Omitted
}

type RegDeleteVA = {
    v?: Omitted
    ve?: Omitted

    /**
     * /va  
     * __msdocs:__
     * delete all values under this key.
     */
    va: boolean
}

export type RegDelete = { keyPath: string } & (RegDeleteV | RegDeleteVA | RegDeleteVE) & OptionsReg64Or32

export type RegAdd = string | {
    keyPath: string;
    
    /**
     * Wrapper around /d Data and /t Type
     * 
     * __msdocs for /d:__  
     * /d Data  
     * The data to assign to the registry ValueName being added.  
     * 
     * __msdocs for /t:__  
     * /t Type  
     * __msdocs:__  
     * RegKey data types  
     * [ REG_SZ    | REG_MULTI_SZ | REG_EXPAND_SZ |  
     *   REG_DWORD | REG_QWORD    | REG_BINARY    | REG_NONE ]  
     * If omitted, REG_SZ is assumed.
     */
    data?: RegEntry

    /**
     * /s Separator  
     * __msdocs:__  
     * Specify one character that you use as the separator in your data  
     * string for REG_MULTI_SZ. If omitted, use "\0" as the separator.
     */
    s?: string
} & ({
    /**
     * /v ValueName  
     * __msdocs:__  
     * The value name, under the selected Key, to add.
     */
    v?: string;
    ve?: Omitted;
} | {
    /**
     * /ve  
     * __msdocs:__  
     * adds an empty value name (Default) for the key.
     */
    ve?: boolean;
    v?: Omitted;
}) & OptionsReg64Or32