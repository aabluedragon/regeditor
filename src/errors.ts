import { COMMAND_NAME } from "./types";

export { PromiseStoppableTimeoutError } from './promise-stoppable'
export class RegErrorAccessDenied extends Error { constructor(message: string) { super(message); this.name = 'RegErrorAccessDenied'; } }
export class RegErrorInvalidSyntax extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidSyntax'; } }
export class RegErrorGeneral extends Error { constructor(message: string) { super(message); this.name = 'RegErrorGeneral'; } }
export class RegErrorInvalidKeyName extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidKeyName'; } }

export class RegQueryErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorMalformedLine'; } }
/**
 * May be thrown after a while if using REG QUERY with the recursive search option /s (s:true) on a key close to the root of the registry, e.g. HKEY_LOCAL_MACHINE\Software\Microsoft
 */
export class RegQueryErrorReadTooWide extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorReadTooWide'; } }

export class RegCopyErrorSourceDestSame extends Error { constructor(message: string) { super(message); this.name = 'RegCopyErrorSourceDestSame'; } }

/**
 * Thrown if using non-windows platforms, and wine is not found.
 */
export class RegErrorWineNotFound extends Error { constructor(message: string) { super(message); this.name = 'RegErrorWineNotFound'; } }