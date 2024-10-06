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
    POWERSHELL_ADD: 'POWERSHELL_ADD',
    POWERSHELL_DELETE: 'POWERSHELL_DELETE',
    POWERSHELL_KEYEXISTS: 'POWERSHELL_KEYEXISTS',
    POWERSHELL_COPY: 'POWERSHELL_COPY'
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

export const REGEX_LINE_DELIMITER =/\r\n|\r|\n/g

export const POWERSHELL_SET_ENGLISH_OUTPUT = "[Threading.Thread]::CurrentThread.CurrentUICulture = 'en-US';"

export const REGKEY_ROOT_NAMES = Object.freeze({
    HKEY_LOCAL_MACHINE: 'HKEY_LOCAL_MACHINE',
    HKEY_CURRENT_CONFIG: 'HKEY_CURRENT_CONFIG',
    HKEY_CLASSES_ROOT: 'HKEY_CLASSES_ROOT',
    HKEY_CURRENT_USER: 'HKEY_CURRENT_USER',
    HKEY_USERS: 'HKEY_USERS',
})

export const REGKEY_SHORTCUTS = Object.freeze({
    HKLM: REGKEY_ROOT_NAMES.HKEY_LOCAL_MACHINE,
    HKCC: REGKEY_ROOT_NAMES.HKEY_CURRENT_CONFIG,
    HKCR: REGKEY_ROOT_NAMES.HKEY_CLASSES_ROOT,
    HKCU: REGKEY_ROOT_NAMES.HKEY_CURRENT_USER,
    HKU: REGKEY_ROOT_NAMES.HKEY_USERS,
});

export const REGKEY_DOTNET_ROOTS = Object.freeze({
    HKEY_CLASSES_ROOT: "ClassesRoot",
    HKEY_CURRENT_CONFIG: "CurrentConfig",
    HKEY_CURRENT_USER: "CurrentUser",
    HKEY_LOCAL_MACHINE: "LocalMachine",
    HKEY_USERS: "Users"
})