import { COMMAND_NAMES } from "./constants";

export interface REG_SZ {
    type: 'REG_SZ';
    data: string;
}
export interface REG_EXPAND_SZ {
    type: 'REG_EXPAND_SZ';
    data: string;
}

export interface REG_DWORD {
    type: 'REG_DWORD';
    data: number;
}

export interface REG_QWORD {
    type: 'REG_QWORD';
    data: number;
}

export interface REG_MULTI_SZ {
    type: 'REG_MULTI_SZ';
    data: string[];
}

export interface REG_BINARY {
    type: 'REG_BINARY';
    data: number[];
}

/**
 * REG_NONE contains binary data, but the REG ADD command does not encode it properly, instead it treats it as a string. if you need to add binary data, use .reg files instead (REG IMPORT). if you use the regApply(...) function, it should work as expected.
 */
export interface REG_NONE {
    type: 'REG_NONE';
    data: number[];
}

export type COMMAND_NAME = typeof COMMAND_NAMES[keyof typeof COMMAND_NAMES];

export type RegValue = REG_SZ | REG_EXPAND_SZ | REG_DWORD | REG_QWORD | REG_MULTI_SZ | REG_BINARY | REG_NONE;
export type RegType = RegValue['type'];
export type RegData = RegValue['data'];

export type RegKey = string;
export type RegValueName = string;
export type RegValues = Record<RegValueName, RegValue>
export type RegStruct = Record<RegKey, RegValues>

export type RegCmdOptElevated = {
    elevated?: {
        /**
         * 'fallback' is the default.
         * 
         * First attempt without elevation, then if the command failed due to access denied, retry with elevation.
         */
        mode?: 'fallback',
        opts?: ElevatedSudoPromptOpts,

        /**
         * A hook to be called just before the elevation is attempted, you may use this to read the notify the user about the elevation request.
         * @returns false to stop the elevation and throw AccessDenied error, or undefined to continue with the elevation.
         */
        hookBeforeElevation?: () => Promise<boolean | void> | boolean | void
    } | {
        mode?: 'forced',
        opts?: ElevatedSudoPromptOpts,
        hookBeforeElevation?: Omitted
    } | {
        mode: 'disabled',
        opts?: Omitted
        hookBeforeElevation?: Omitted
    }
}

export type RegCmdOptWinePath = {
    /**
     * Applicable only for non-windows platforms.
     * 
     * When unspecified, it will look for wine and wine64 in the PATH environment variable.  
     * If specified, it will first try to use this path, and only if not found, it will look in the PATH environment variable.
     */
    winePath?: string | null
}
export type CommonOpts = OptionsReg64Or32 & TimeoutOpt & RegCmdExecParamsModifier & RegCmdOptElevated & RegCmdOptWinePath
export type RegCmdResultWithCmds = {
    /**
     * An array containing the commands that were executed to get the result.  
     * e.g. 
     * [["reg", ["query","HKEY_LOCAL_MACHINE\\Software\\Microsoft"]], ["reg", ["query","HKEY_LOCAL_MACHINE\\SOFTWARE\\Apple Inc.\\Bonjour","/s"]]
    ]
     */
    cmds: ExecFileParameters[]
}

export type RegQueryCmdResult = {
    struct: RegStruct,
    keysMissing: string[],
} & RegCmdResultWithCmds

export type RegAddCmdResult = RegCmdResultWithCmds;
export type RegImportCmdResult = RegCmdResultWithCmds;
export type RegApplyCmdResult = RegCmdResultWithCmds;

export type RegDeleteCmdResult = {
    notFound: {
        commandObject: RegDeleteCmd,
        commandIndex: number,
    }[]
} & RegCmdResultWithCmds

/**
 * **UNTESTED**: parsing in REG QUERY may cause issues with this flag, use with caution.
 */
type OptionsReg64Or32 = ({
    /**
     * **UNTESTED**: parsing in REG QUERY may cause issues with this flag, use with caution.
     * 
     * /reg:32  
     * __msdocs:__  
     * Specifies the key should be accessed using the 32-bit registry view.
     */
    reg32?: boolean
    reg64?: Omitted
} | {
    /**
     * **UNTESTED**: parsing in REG QUERY may cause issues with this flag, use with caution.
     * 
     * /reg:64  
     * __msdocs:__  
     * Specifies the key should be accessed using the 64-bit registry view.
     */
    reg64?: boolean
    reg32?: Omitted
});

export type TimeoutOpt = {
    /**
     * Milliseconds to wait for the command to finish before rejecting the promise.
     */
    timeout?: number
}

export type ExecFileParameters = [file: string, args?: readonly string[] | null];
export type RegCmdExecParamsModifier = {
    /**
     * A function to be called just before execFile is executing a REG command, you may use this to read the params, or modify them before the command is executed.
     * @param cmd The REG command to be executed
     * @param execCmdParameters The parameters to be sent to the execFile function
     * @returns undefined or null to remain unchanged, or a new params arrey to be sent to execFile
     */
    cmdParamsModifier?: (cmd: COMMAND_NAME, execCmdParameters: ExecFileParameters, wine: boolean) => ExecFileParameters | undefined | null | void
}

export type RegQueryCmdBase = {

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

} & CommonOpts

/**
 * REG QUERY: A command to query (read) registry values.  
 * The executable path is usually C:\Windows\System32\reg.exe
 */
export type RegQueryCmd = RegKey | (RegQueryCmdBase & {

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
     * Only usable when not using the "elevated" option.
     * 
     * Use to observe the value of the the result registry struct before it has finished reading, call stop() or return false to stop reading.  
     * Might be useful for long reads, e.g. when using the /s flag for recursive read.
     */
    onProgress?: (partialStruct: RegStruct, stop: () => void) => false | undefined | void
} & ({
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
    va?: boolean
}

export type RegExportCmd = {
    /**
     * The key to export
     */
    keyPath: string,
    /**
     * __msdocs:__
     * The name and path of the registry file that will be created.  
     * This file must have a .reg extension.
     */
    fileName: string
} & CommonOpts

export type RegExportCmdResult = {
    notFound: {
        commandObject: RegDeleteCmd,
        commandIndex: number,
    }[]
} & RegCmdResultWithCmds

/**
 * __msdocs:__  
 * Copies the contents of a specified registry key to another location.  
 * By default, this operation only copies registry values. Use [/s] to  
 * recursively copy all subkeys and values.
 */
export type RegCopyCmd = {
    /**
     * Source key to copy from
     */
    keyPathSource: string,

    /**
     * Destination key to copy to
     */
    keyPathDest: string

    /**
     * __msdocs:__  
     * Copy all subkeys and values from <key1> to <key2>.
     */
    s?: boolean
} & CommonOpts

export type RegCopyCmdResult = {
    notFound: {
        commandObject: RegCopyCmd,
        commandIndex: number,
    }[]
} & RegCmdResultWithCmds

/**
 * REG DELETE: A command to delete registry keys and values.  
 * The executable path is usually C:\Windows\System32\reg.exe
 */
export type RegDeleteCmd = { keyPath: string } & (RegDeleteV | RegDeleteVA | RegDeleteVE) & CommonOpts

export type RegImportCmdOpts = {
    /**
     * The path to the .reg file to import.
     */
    fileName: string
} & CommonOpts

/**
 * REG IMPORT command, imports a .reg file into the registry.
 * The executable path is usually C:\Windows\System32\reg.exe
 */
export type RegImportCmd = RegKey | RegImportCmdOpts

/**
 * REG ADD: A command to add registry keys and values.  
 * The executable path is usually C:\Windows\System32\reg.exe
 */
export type RegAddCmd = RegKey | {
    keyPath: string;

    /**
     * Passes the /d Data and /t Type arguments.
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
    value?: RegValue;

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
}) & CommonOpts

export type RegApplyCmdMode = 'import' | 'add-delete';
export type RegApplyOpts = {
    /**
     * Delete values that were found in existing key but not given in the new struct object.  
     * Only applicable when not using "skipRead".
     * 
     * * false: don't delete any values (leave them as they are, this is the default).  
     * * "all": delete all values that were found in the existing key but not in the given struct object.  
     * * "allExceptDefault": delete all values that were found in the existing key but not in the given struct object, except the "(Default)" value.  
     * * "onlyDefault": delete only the "(Default)" value if it was found in the existing key but not in the given struct object.  
     * * function: a function that takes in the the existing key and value, and returns true if the value should be deleted (allows deciding upon deletions on the fly).  
     */
    deleteUnspecifiedValues?: false | "all" | "allExceptDefault" | "onlyDefault" | ((key: string, name: string, value: RegValue) => boolean),
    deleteKeys?: RegKey[],
    deleteValues?: { key: RegKey, valueName: string | string[] }[]

    /**
     * Whether to run one REG IMPORT (.reg file) command instaed of a combination of REG ADD/DELETE commands for each value or key.
     * By default, will use this only if there are multiple modifications to be made, or by the edge case of writing a value of type REG_NONE with contents.
     */
    forceCmdMode?: RegApplyCmdMode | false | void | null,

    /**
     * When command mode is "import" (either automatically or by setting "forceCmdMode" to "import"),  
     * The given path will be used to create the temporary .reg file (and then delete it after the command is executed).  
     * By default, os.tmpdir() will be used.
     */
    tmpPath?: { type: 'dir' | 'file', path: string }

    /**
     * Skips the REG QUERY before the writing operation, and just perform the write regardless if there weren't any differences.
     * false by default to prevent unnecessary writes and UAC elevation prompts.
     */
    skipRead?: boolean
} & CommonOpts

/**
 * Result of comparing two registry structs.
 */
export type RegCompareResult = {
    /**
     * Keys that exists in both previous and next, but have differences in one or more of their values.
     */
    changedKeys: {
        [keyPath: string]: {
            [valueName: string]: (
                { op: 'removed', previous: RegValue, next?: Omitted } |
                { op: 'added', previous?: Omitted, next: RegValue } |
                { op: 'updated', previous: RegValue, next: RegValue }
            )
        }
    }

    /**
     * Keys existing in previous, but not in next.
     */
    removedKeys: RegStruct;

    /**
     * Keys existing in next, but not in previous.
     */
    addedKeys: RegStruct;
}

/**
 * __From the `sudo-prompt` package:__
 * 
 * sudo-prompt will use process.title as options.name if options.name is not provided.  
 * options.name must be alphanumeric only (spaces are supported) and at most 70 characters.
 *
 * sudo-prompt will preserve the current working directory on all platforms.  
 * Environment variables can be set explicitly using options.env.
 */
export type ElevatedSudoPromptOpts = {
    name?: string,
    icns?: string,
    env?: { [key: string]: string }
} | boolean

export type RegReadResult = RegQueryCmdResult

export type RegReadCmdOpts = RegQueryCmdBase & {
    /**
     * By default REG QUERY is used for Windows, and REG EXPORT is used for other platforms using Wine.
     * 
     * Use this if you need to force a specific command for reading.
     */
    readCmd?: 'query' | 'export' | 'auto'

    /**
     * /v
     * 
     * __msdocs:__  
     * Queries for a specific registry key values.  
     * If omitted, all values for the key are queried.
     */
    v?: string
}

export type RegReadCmd = RegKey | RegReadCmdOpts
