import { RegType } from "./types";

/**
 * Supported REG CLI commands
 */
export const COMMAND_NAMES = Object.freeze({
    ADD: 'ADD',
    QUERY: 'QUERY',
    DELETE: 'DELETE',
    IMPORT: 'IMPORT',
    EXPORT: 'EXPORT',
    COPY: 'COPY',
    POWERSHELL_READ: 'POWERSHELL_READ',
})

export const TIMEOUT_DEFAULT = 30000;

export const REG_TYPES_ALL = Object.freeze(['REG_BINARY', 'REG_DWORD', 'REG_EXPAND_SZ', 'REG_MULTI_SZ', 'REG_NONE', 'REG_QWORD', 'REG_SZ'] as RegType[])

/**
 * The default value for a key.
 * 
 * Note that we cannot differentiate between a value named "(Default)" and the default value of a key, as the REG QUERY command does not indicate which it is.  
 * Therefore, we will always assume that the value is the default value of the key.
 */
export const REG_VALUENAME_DEFAULT = "(Default)"

export const PACKAGE_DISPLAY_NAME = "regeditor"

export const WINE_FLATPAK_PACKAGE_ID = "org.winehq.Wine"