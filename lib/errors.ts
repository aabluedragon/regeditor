
export class RegErrorBadQuery extends Error { constructor(message: string) { super(message); this.name = 'RegErrorBadQuery'; } }
export class RegErrorUnknown extends Error { constructor(message: string) { super(message); this.name = 'RegErrorUnknown'; } }
export class RegErrorStdoutTooLarge extends Error { constructor(message: string) { super(message); this.name = 'RegErrorStdoutTooLarge'; } }
export class RegErrorMalformedLine extends Error { constructor(message: string) { super(message); this.name = 'RegErrorMalformedLine'; } }
export class RegErrorTimeout extends Error { constructor(message: string) { super(message); this.name = 'RegErrorTimeout'; } }
