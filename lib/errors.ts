export class RegErrorAccessDenied extends Error { constructor(message: string) { super(message); this.name = 'RegErrorAccessDenied'; } }
export class RegErrorInvalidSyntax extends Error { constructor(message: string) { super(message); this.name = 'RegErrorInvalidSyntax'; } }
export class RegErrorUnknown extends Error { constructor(message: string) { super(message); this.name = 'RegErrorUnknown'; } }

export class RegQueryErrorStdoutTooLarge extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorStdoutTooLarge'; } }
export class RegQueryErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorMalformedLine'; } }
export class RegQueryErrorTimeout extends Error { constructor(message: string) { super(message); this.name = 'RegQueryErrorTimeout'; } }
