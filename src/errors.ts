import { COMMAND_NAME } from "./types";

export { PromiseStoppableTimeoutError } from './promise-stoppable'
export class RegErrorAccessDenied extends Error { constructor(message: string) { super(message); this.name = 'RegErrorAccessDenied'; } }
export class RegErrorInvalidSyntax extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidSyntax'; } }
export class RegErrorUnknown extends Error { constructor(message: string) { super(message); this.name = 'RegErrorUnknown'; } }
export class RegErrorInvalidKeyName extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidKeyName'; } }

export class RegQueryErrorReadTooWide extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorReadTooWide'; } }
export class RegQueryErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorMalformedLine'; } }

export class RegImportErrorOpeningFile extends Error { constructor(message: string) { super(message); this.name = 'RegImportErrorOpeningFile'; } }

export function findCommonErrorInTrimmedStdErr(command: COMMAND_NAME, trimmedStdErr: string) {
    if (trimmedStdErr === `ERROR: Invalid key name.\r\nType "REG ${command} /?" for usage.`) return new RegErrorInvalidKeyName(trimmedStdErr);
    if (trimmedStdErr === 'ERROR: Access is denied.') return new RegErrorAccessDenied(trimmedStdErr);
    if (trimmedStdErr === `ERROR: Invalid syntax.\r\nType "REG ${command} /?" for usage.` || trimmedStdErr === 'ERROR: The parameter is incorrect.') return new RegErrorInvalidSyntax(trimmedStdErr);
    return null;
}