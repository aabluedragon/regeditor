export { PromiseStoppableTimeoutError } from './promise-stoppable'
export class RegErrorAccessDenied extends Error { constructor(message: string) { super(message); this.name = 'RegErrorAccessDenied'; } }
export class RegErrorInvalidSyntax extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidSyntax'; } }
export class RegErrorGeneral extends Error { constructor(message: string) { super(message); this.name = 'RegErrorGeneral'; } }
export class RegErrorInvalidKeyName extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidKeyName'; } }
export class RegErrorTimeout extends Error { constructor(message: string) { super(message); this.name = 'RegErrorTimeout'; } }

export class RegQueryErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorMalformedLine'; } }
export class RegCopyErrorSourceDestSame extends Error { constructor(message: string) { super(message); this.name = 'RegCopyErrorSourceDestSame'; } }

/**
 * Thrown if using non-windows platforms, and wine is not found.
 */
export class RegErrorWineNotFound extends Error { constructor(message: string) { super(message); this.name = 'RegErrorWineNotFound'; } }