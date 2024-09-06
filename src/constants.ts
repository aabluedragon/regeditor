import { RegType } from "./types";

/**
 * Supported REG CLI commands
 */
export const COMMAND_NAMES = Object.freeze({
    ADD: 'ADD',
    QUERY: 'QUERY',
    DELETE: 'DELETE',
    IMPORT: 'IMPORT'
})

export const TIMEOUT_DEFAULT = 30000;

export const REG_TYPES_ALL = Object.freeze(['REG_BINARY', 'REG_DWORD', 'REG_EXPAND_SZ', 'REG_MULTI_SZ', 'REG_NONE', 'REG_QWORD', 'REG_SZ'] as RegType[])

export const REG_VALUE_DEFAULT = "(Default)"