export class RegErrorAccessDenied extends Error { constructor(message: string) { super(message); this.name = 'RegErrorAccessDenied'; } }
export class RegErrorInvalidSyntax extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidSyntax'; } }
export class RegErrorUnknown extends Error { constructor(message: string) { super(message); this.name = 'RegErrorUnknown'; } }
export class RegErrorInvalidKeyName extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidKeyName'; } }

export class RegQueryErrorReadTooWide extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorReadTooWide'; } }
export class RegQueryErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorMalformedLine'; } }
export class RegQueryErrorTimeout extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorTimeout'; } }
