import { COMMAND_NAME, CommonOpts, ElevatedSudoPromptOpts, ExecFileParameters, RegCmdExecParamsModifier, RegKey, RegQueryCmdBase, RegQueryCmdResult, RegStruct } from "./types";
import { exec as sudo } from '@emrivero/sudo-prompt'
import { type ChildProcess, execFile } from 'child_process'
import { platform, homedir } from "os";
import { COMMAND_NAMES, PACKAGE_DISPLAY_NAME, TIMEOUT_DEFAULT } from "./constants";
import { RegErrorAccessDenied, RegErrorGeneral, RegErrorInvalidKeyName, RegErrorInvalidSyntax, RegErrorTimeout, RegErrorWineNotFound } from "./errors";
import { lookpathSync } from "./lookpath-sync";
import { existsSync } from "fs";
import { join as path_join } from 'path'
import { PromiseStoppable, PromiseStoppableFactory } from "./promise-stoppable";
import { RegQueryCmdResultSingle } from "./types-internal";

const thisProcess = require('process');

export const currentPlatform = platform();
export const isWindows = currentPlatform === 'win32';
export const isLinux = currentPlatform === 'linux';

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

type WineFoundResult = { type: 'path' | 'flatpak', value: string } | false;

const getWine = (() => {
  let cacheWineFound: WineFoundResult = false;

  return (winePath?: string | null): { type: 'path' | 'flatpak', value: string } | false => {
    if (winePath && existsSync(winePath)) return { type: 'path', value: winePath };

    if (cacheWineFound) return cacheWineFound;
    const found = ['wine', 'wine64'].find(w => lookpathSync(w));
    if (found) {
      cacheWineFound = { type: 'path', value: found };
    }
    // flatpak wine support disabled for now, because it often hangs when running multiple REG commands consequtively (e.g. using the regApply function)
    // else if (isPackageInstalledOnFlatpakSync(WINE_FLATPAK_PACKAGE_ID)) {
    //   cacheWineFound = { type: 'flatpak', value: WINE_FLATPAK_PACKAGE_ID };
    // }
    return cacheWineFound;
  }
})();


export function applyParamsModifier(cmd: COMMAND_NAME, params: ExecFileParameters, modifier: RegCmdExecParamsModifier['cmdParamsModifier'], winePath?: string | null): ExecFileParameters {
  // Reading unicode characters properly (only required for REG QUERY command)
  // TODO: fix for wine as well (currently only works for windows, on wine, it results with "Invalid code page")
  if (cmd === COMMAND_NAMES.QUERY) {
    if (isWindows) {
      (function switchToCmdToFixEncoding() {
        const file = params[0];
        const args = params?.[1] || [];
        params[0] = 'cmd';
        params[1] = ['/c', 'chcp', '65001', '>', 'nul', '&&', file, ...args];
      })();

      if (!params?.[2]) params[2] = {};
      params[2].windowsHide = true;
    }
  }

  const useWine = !isWindows;
  if (useWine) {
    const wineFound = getWine(winePath)
    if (!wineFound) throw new RegErrorWineNotFound((winePath || 'wine and wine64') + ' not found');
    const file = params[0];
    const args = params?.[1] || [];

    if (wineFound.type === 'path') {
      params[0] = wineFound.value;
      params[1] = [file, ...args];
    } else if (wineFound.type === 'flatpak') {
      params[0] = 'flatpak';
      params[1] = ['run', '--filesystem=host', '--die-with-parent', wineFound.value, file, ...args]; // without --die-with-parent, flatpak's wine hangs a little more often when running multiple REG commands consequtively.
    } else throw new RegErrorWineNotFound('Unknown wine type');

  }

  if (modifier) {
    const newParams = modifier(cmd, params, useWine);
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

  // On wine, disable all wine debug messages to prevent them from mixing in stderr of the actual REG command.
  const extraEnv = isWindows ? {} : { WINEDEBUG: "-all" };

  if (elevated) {
    if (!isWindows) throw new RegErrorGeneral('Elevated mode is not supported for Wine.'); // It may work, however it's highly discouraged to run Wine as root.

    const cmd = escapeShellArg(params[0]);
    const args = (params?.[1] || []).map(escapeShellArg).join(' ');
    const elevatedOpts: ElevatedSudoPromptOpts = typeof elevated === 'object' && elevated !== null && elevated?.name?.length ? elevated : { name: PACKAGE_DISPLAY_NAME };

    const envStr = Object.entries(extraEnv).map(([k, v]) => `${k}="${v}"`).join(' ');

    const oneLinerExecution = (envStr?.length ? `${envStr} ` : '') + cmd + ' ' + args

    sudo(oneLinerExecution, elevatedOpts, (err, stdout, stderr) => {

      const out = (function trimStdinFromStdout() {
        let str = stdout?.toString() || '';
        if (isWindows) {
          const indexOfCommand = str.indexOf(oneLinerExecution)
          if (indexOfCommand !== -1) {
            str = str.substring(indexOfCommand + oneLinerExecution.length)
            const firstLineDown = str.indexOf('\r\n');
            if (firstLineDown !== -1) str = str.substring(firstLineDown + 2)
          }
        }
        return str;
      })();

      opts?.onStdErr?.(stderr?.toString() || '');
      opts?.onStdOut?.(out);
      opts?.onExit?.();
      if (err) throw err;
    }, () => { }); // An empty callback is required here, otherwise there's an exception on linux when trying to run elevated commands
    return null;
  } else {
    if (!params?.[2]) params[2] = {}
    params[2].env = { ...process.env, ...extraEnv };

    const proc = execFile(...params);
    if (opts?.onStdErr) proc.stderr?.on('data', stdErr => opts?.onStdErr?.(stdErr?.toString()));
    if (opts?.onStdOut) proc.stdout?.on('data', stdOut => opts?.onStdOut?.(stdOut?.toString()));
    if (opts?.onExit) proc.on('exit', opts?.onExit);
    return proc;
  };
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

  if (containsWhitespace(escaped) || (!isWindows && escaped.includes('\\'))) {
    escaped = isWindows ? `"${escaped}"` : `'${escaped}'`;
  }

  return escaped;
}

// https://stackoverflow.com/a/2117523/230637
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

export function generateRegFileName() {
  return `_${PACKAGE_DISPLAY_NAME}_${uuidv4()}.reg`;
}

export function optionalElevateCmdCall<T, O extends (CommonOpts | RegKey)>(paramOrOpts: O, fn: (opts: O, elevated: ElevatedSudoPromptOpts) => PromiseStoppable<T>): PromiseStoppable<T> {
  const opts: CommonOpts = typeof paramOrOpts === 'string' ? {} : paramOrOpts;
  const isFallback = opts?.elevated?.mode === 'fallback' || opts.elevated?.mode == null;
  const isForced = opts?.elevated?.mode === 'forced';

  if (isForced) return fn(paramOrOpts, opts?.elevated?.opts ?? true);

  return fn(paramOrOpts, false).catch(async e => {
    if (e instanceof RegErrorAccessDenied && isFallback && isWindows) { // Only fallback to elevated mode on windows
      const hook = opts?.elevated?.hookBeforeElevation;
      if (typeof hook === 'function') {
        const hookResult = await hook();
        if (hookResult === false) throw e;
      }
      return fn(paramOrOpts, typeof paramOrOpts === 'string' ? true : (opts?.elevated?.opts ?? true));
    }
    throw e;
  })
}

export function resolvePosixFilePathWithEnvVarsAndTilde(filepath: string) {
  if (filepath[0] === '~') {
    filepath = path_join(homedir(), filepath.slice(1));
  }
  // Modified from https://stackoverflow.com/a/58173283/230637
  filepath = filepath.replace(/\$([A-Z_]+[A-Z0-9_]*)|\${([A-Z0-9_]*)}/ig, (_, a, b) => thisProcess?.env?.[a || b] || '')
  return filepath;
}

export function isPackageInstalledOnFlatpakSync(packageId?: string): boolean {
  if (!packageId?.length || !isLinux) return false;
  return existsSync(`/var/lib/flatpak/app/${packageId}`) || existsSync(resolvePosixFilePathWithEnvVarsAndTilde(`~/.local/share/flatpak/app/${packageId}`));
}

export function getCommonOpts<T extends CommonOpts>(opts: T) {
  const commonOpts: CommonOpts = {};

  if (opts.timeout != null) commonOpts.timeout = opts.timeout;
  if (opts.cmdParamsModifier != null) commonOpts.cmdParamsModifier = opts.cmdParamsModifier;
  if (opts.elevated != null) commonOpts.elevated = opts.elevated;
  if (opts.winePath != null) commonOpts.winePath = opts.winePath;
  if (opts.reg32) commonOpts.reg32 = true;
  if (opts.reg64) commonOpts.reg64 = true;

  return commonOpts as CommonOpts;
}

export function handleReadAndQueryCommands(impFn: (o: RegQueryCmdBase | RegKey, elevated: ElevatedSudoPromptOpts) => PromiseStoppable<RegQueryCmdResultSingle>, ...queriesParam: VarArgsOrArray<RegQueryCmdBase | RegKey>): PromiseStoppable<RegQueryCmdResult> {
  const flattened = queriesParam.flat();
  const queriesOrReads = flattened.map(v => typeof v === 'string' ? ({ keyPath: v }) : v);
  const promises = queriesOrReads.map(o => optionalElevateCmdCall(o, impFn));

  return stoppable.all(promises).then(results => {
    // Skipping the merge logic if just a single query.
    if (results.length === 1) {
      const r = results[0];
      const q = queriesOrReads[0];
      return {
        struct: r.struct,
        keysMissing: r?.keyMissing ? [q.keyPath] : [],
        cmds: [r.cmd]
      }
    }

    // Merge structs for all keys retreived
    const struct = {} as RegStruct;
    let keysMissing = [] as string[];
    const cmds = [] as ExecFileParameters[];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      cmds.push(res.cmd);
      if (res.keyMissing) keysMissing.push(queriesOrReads[i].keyPath);
      for (const key in res.struct) {
        struct[key] = { ...struct[key], ...res.struct[key] }
      }
    }
    return { struct, keysMissing, cmds };
  })
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function findCommonErrorInTrimmedStdErr(command: COMMAND_NAME, trimmedStdErr: string, trimmedStdout: string) {
  if (trimmedStdErr === `ERROR: Invalid key name.\r\nType "REG ${command} /?" for usage.`) return new RegErrorInvalidKeyName(trimmedStdErr);
  if (trimmedStdErr === 'ERROR: Access is denied.' || // windows access denied
    trimmedStdErr.toLowerCase().includes('permission denied') // linux access denied
  ) {
    return new RegErrorAccessDenied(trimmedStdErr);
  }
  if (trimmedStdout === `reg: Invalid syntax. Type "REG ${command} /?" for help.`) return new RegErrorInvalidSyntax(trimmedStdout) // wine
  if (trimmedStdErr === `ERROR: Invalid syntax.\r\nType "REG ${command} /?" for usage.` || trimmedStdErr === 'ERROR: The parameter is incorrect.') return new RegErrorInvalidSyntax(trimmedStdErr); // windows
  return null;
}

export function isKnownWineDriverStderrOrFirstTimeWineRun(stderr: string): boolean {
  if (isWindows) return false;
  if (stderr.startsWith('wine: created the configuration directory')) return true;
  const ok = new RegExp(/^the .* driver was unable to open .* this library is required at run time\.$/, 'im').test(stderr);
  return ok;
}

export const stoppable = PromiseStoppableFactory.create({ timeout: TIMEOUT_DEFAULT, error: new RegErrorTimeout('regeditor timed out') });