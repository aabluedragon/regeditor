import { COMMAND_NAME, CommonOpts, ElevatedSudoPromptOpts, ExecFileParameters, RegCmdExecParamsModifier, RegStruct } from "./types";
import { exec as sudo } from '@emrivero/sudo-prompt'
import { type ChildProcess, execFile } from 'child_process'
import { platform } from "os";
import { PACKAGE_DISPLAY_NAME } from "./constants";
import { RegErrorAccessDenied } from "./errors";
import { PromiseStoppable } from "./promise-stoppable";

export const isWindows = platform() === 'win32';

export type VarArgsOrArray<T> = T[] | T[][];

// From https://stackoverflow.com/a/69668215/230637
export type AddParameters<
  TFunction extends (...args: any) => any,
  TParameters extends [...args: any]
> = (
  ...args: [...Parameters<TFunction>, ...TParameters]
) => ReturnType<TFunction>;


export function getMinimumFoundIndex(str: string, patterns: string[]): { minIndex: number, chosenPattern: string | null } {
  return getMinimumFoundIndexStrOrRegex(str, patterns) as { minIndex: number, chosenPattern: string | null };
}
export function getMinimumFoundIndexStrOrRegex(str: string, patterns: (string | RegExp)[]): { minIndex: number, chosenPattern: string | RegExp | null } {

  let minIndex: number = -1;
  let chosenPattern: string | RegExp | null = null;

  for (const p of patterns) {
    const idx = p instanceof RegExp ? str.search(p) : (typeof str === 'string' ? str.indexOf(p) : -1)
    if (idx !== -1 && (minIndex === -1 || idx < minIndex)) {
      minIndex = idx;
      chosenPattern = p;
    }
  }

  return { minIndex, chosenPattern };
}

/**
 * Modified from https://stackoverflow.com/a/60729670/230637
 * @param obj1 first object to compare
 * @param obj2 second object to compare
 * @returns true if equal
 */
export function isEqual(obj1: any, obj2: any): boolean {
  if (typeof obj1 !== typeof obj2) return false;
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;

  const obj1Keys = Object.keys(obj1);
  const obj2Keys = Object.keys(obj2);

  if (obj1Keys.length !== obj2Keys.length) {
    return false;
  }

  for (let objKey of obj1Keys) {
    if (obj1[objKey] !== obj2[objKey]) {
      if (typeof obj1[objKey] == "object" && typeof obj2[objKey] == "object") {
        if (!isEqual(obj1[objKey], obj2[objKey])) {
          return false;
        }
      }
      else {
        return false;
      }
    }
  }

  return true;
};

export function applyParamsModifier(cmd: COMMAND_NAME, params: ExecFileParameters, modifier: RegCmdExecParamsModifier['cmdParamsModifier']): ExecFileParameters {
  if (modifier) {
    const newParams = modifier(cmd, params);
    if (newParams) return newParams;
  }
  return params;
}

export function regexEscape(str: string) {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
  // https://github.com/benjamingr/RegExp.escape/issues/37
  return str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

/**
 * Resolves paths such as HKLM\\SOFTWARE to the full path, such as HKEY_LOCAL_MACHINE\\SOFTWARE
 * @param keyPath The key path used
 */
export function regKeyResolveFullPathFromShortcuts(keyPath: string) {

  const shortcuts = Object.freeze({
    HKLM: 'HKEY_LOCAL_MACHINE',
    HKCC: 'HKEY_CURRENT_CONFIG',
    HKCR: 'HKEY_CLASSES_ROOT',
    HKCU: 'HKEY_CURRENT_USER',
    HKU: 'HKEY_USERS',
  }) as Readonly<Record<string, string>>;

  const indexOfShortcut = keyPath.startsWith('\\\\') ? 3 : 0; // In case starts with \\SomeComputer\ (example: \\SomeComputer\HKLM\Software)
  const pathParts = keyPath.split('\\');
  pathParts[indexOfShortcut] = shortcuts?.[pathParts?.[indexOfShortcut]?.toUpperCase?.()] ?? pathParts[indexOfShortcut];

  return pathParts.join('\\');
}

export function findValueByNameLowerCaseInStruct(struct: RegStruct, key: string, valueName: string) {
  const values = Object.entries(struct).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]
  return values && Object.entries(values).find(([v]) => v.toLowerCase() === valueName.toLowerCase())?.[1]
}

export function execFileUtil(params: ExecFileParameters, opts: { onStdOut?: (str: string) => void, onStdErr?: (str: string) => void, onExit?: (code?: number | null) => void }, elevated: ElevatedSudoPromptOpts | boolean = false): ChildProcess | null {
  if (elevated) {
    const cmd = escapeShellArg(params[0]);
    const args = (params?.[1] || []).map(escapeShellArg).join(' ');
    const elevatedOpts: ElevatedSudoPromptOpts = typeof elevated === 'object' && elevated !== null && elevated?.name?.length ? elevated : { name: PACKAGE_DISPLAY_NAME };
    sudo(cmd + ' ' + args, elevatedOpts, (err, stdout, stderr) => {
      opts?.onStdErr?.(stderr?.toString() || '');
      opts?.onStdOut?.(stdout?.toString() || '');
      opts?.onExit?.();
    });
    return null;
  } else {
    const proc = execFile(...params);
    if (opts?.onStdErr) proc.stderr?.on('data', stdErr => opts?.onStdErr?.(stdErr?.toString()));
    if (opts?.onStdOut) proc.stdout?.on('data', stdOut => opts?.onStdOut?.(stdOut?.toString()));
    if (opts?.onExit) proc.on('exit', opts?.onExit);
    return proc;
  };
}

export function stringToUTF16LE(str: string) {
  let bytes = [] as number[];

  // Encode the string into UTF-16 code units
  for (let i = 0; i < str.length; i++) {
    let codeUnit = str.charCodeAt(i);
    let lowByte = codeUnit & 0xFF;
    let highByte = (codeUnit >> 8) & 0xFF;

    bytes.push(lowByte);
    bytes.push(highByte);
  }

  return bytes;
}

export function containsWhitespace(str: string) {
  return /\s/.test(str);
}

export function escapeShellArg(arg: string) {
  const escapeChar = isWindows ? '^' : '\\';
  let escaped = arg;

  if (!isWindows) {
    // unix
    escaped = escaped.
      replaceAll('"', '\\"');
  }

  if (isWindows) {
    escaped = escaped.
      replaceAll('^', "^^").
      replaceAll('"', '""');
  }

  escaped = escaped.
    replaceAll('&', escapeChar + "&").
    replaceAll('<', escapeChar + "<").
    replaceAll('>', escapeChar + ">").
    replaceAll('|', escapeChar + "|");

  if (containsWhitespace(escaped)) {
    escaped = isWindows ? `"${escaped}"` : `'${escaped}'`;
  }

  return escaped;
}

export function generateRegFileName() {
  return `_${PACKAGE_DISPLAY_NAME}_${`${Math.random()}`.split('.')[1]}.reg`;
}

export function optionalElevateCmdCall<T, O extends CommonOpts | string>(paramOrOpts: O, fn: (opts: O, elevated: ElevatedSudoPromptOpts) => PromiseStoppable<T>): PromiseStoppable<T> {
  const isFallback = typeof paramOrOpts === 'string' || paramOrOpts?.elevated?.mode === 'fallback' || paramOrOpts?.elevated == null;
  const isForced = typeof paramOrOpts !== 'string' && paramOrOpts?.elevated?.mode === 'forced';

  if (isForced) return fn(paramOrOpts, paramOrOpts?.elevated?.opts ?? true);

  return fn(paramOrOpts, false).catch(async e => {
    if (e instanceof RegErrorAccessDenied && isFallback) {
      const hook = typeof paramOrOpts !== 'string' && paramOrOpts?.elevated?.mode === 'fallback' && paramOrOpts?.elevated?.hookBeforeElevation;
      if (typeof hook === 'function') {
        const hookResult = await hook();
        if (hookResult === false) throw e;
      }
      return fn(paramOrOpts, typeof paramOrOpts === 'string' ? true : (paramOrOpts?.elevated?.opts ?? true));
    }
    throw e;
  }) as PromiseStoppable<T>;
}