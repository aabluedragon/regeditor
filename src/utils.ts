import { COMMAND_NAME, CommonOpts, ElevatedSudoPromptOpts, ExecFileParameters, OptionsReg64Or32, RegCmdExecParamsModifier, RegKey, RegQueryCmdBase, RegQueryCmdResult, RegStruct, RegType } from "./types";
import { exec as sudo } from '@emrivero/sudo-prompt'
import { type ChildProcess, execFile } from 'child_process'
import { platform, homedir } from "os";
import { COMMAND_NAMES, PACKAGE_DISPLAY_NAME, REGEX_LINE_DELIMITER, REGKEY_ROOT_NAMES, REGKEY_SHORTCUTS, TIMEOUT_DEFAULT } from "./constants";
import { RegErrorAccessDenied, RegErrorGeneral, RegErrorInvalidKeyName, RegErrorInvalidSyntax, RegErrorTimeout, RegErrorWineNotFound } from "./errors";
import { lookpathSync } from "./lookpath-sync";
import { existsSync } from "fs";
import { join as path_join } from 'path'
import { PromiseStoppable, PromiseStoppableFactory } from "./promise-stoppable";
import { RegQueryCmdResultSingle } from "./types-internal";
import { access, constants } from "fs/promises";
import { psKeyExists } from "./commands/ps-key-exists";

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

export function regKeyResolveShortcutAndGetParts(keyPath: string) {

  const indexOfRoot = keyPath.startsWith('\\\\') ? 3 : 0; // In case starts with \\SomeComputer\ (example: \\SomeComputer\HKLM\Software)
  const pathParts = keyPath.split('\\');
  pathParts[indexOfRoot] = (REGKEY_SHORTCUTS as Record<string,string>)?.[pathParts?.[indexOfRoot]?.toUpperCase?.()] ?? pathParts[indexOfRoot];

  return { indexOfRoot, pathParts, root: pathParts?.[indexOfRoot], subkey: pathParts?.slice(indexOfRoot + 1).join('\\') };
}

/**
 * Resolves paths such as HKLM\\SOFTWARE to the full path, such as HKEY_LOCAL_MACHINE\\SOFTWARE
 * @param keyPath The key path used
 */
export function regKeyResolvePath(keyPath: string, bits?: 'to32'|'from32', ignoreIfKey64 = false) {

  const {indexOfRoot, pathParts} = regKeyResolveShortcutAndGetParts(keyPath);

  if(bits) {
    const indexOfBitKey = indexOfRoot + 2;

    const pathIs64 = regKeyPathIs64Bit(keyPath)
    const shouldIgnore = ignoreIfKey64 && pathIs64;
    if(!shouldIgnore) {
      if(pathIs64 && bits === 'to32') {
        pathParts.splice(indexOfBitKey, 1);
      } else if(!pathIs64 && bits === 'from32') {
        pathParts.splice(indexOfBitKey, 0, 'WOW6432Node');
      }
    }
  }

  return pathParts.join('\\');
}

export function regKeyPathIs64Bit(keyPath: string) {
  const { indexOfRoot, pathParts } = regKeyResolveShortcutAndGetParts(keyPath);
  const root = pathParts?.[indexOfRoot];
  const indexOfSoftware = indexOfRoot + 1;
  const maybeSoftware = pathParts?.[indexOfSoftware];
  const indexOfBitKey = indexOfSoftware + 1;
  const maybeBitKey = pathParts?.[indexOfBitKey];
  return root?.toLowerCase() === REGKEY_ROOT_NAMES.HKEY_LOCAL_MACHINE.toLowerCase() &&
    maybeSoftware?.toLowerCase() === 'software' &&
    maybeBitKey?.toLowerCase() === 'wow6432node'
}

/**
 * Resolves paths such as HKLM\\SOFTWARE to the full path (e.g. HKEY_LOCAL_MACHINE\\SOFTWARE), and converts to/from WOW6432Node if needed.
 * @param keyPath
 * @param bits '32': convert to WOW6432Node, '64': convert from WOW6432Node (remove it from path).
 * @returns 
 */
export function regKeyResolveBitsView(keyPath: string, bits?: '32' | '64' | null) {
  return regKeyResolvePath(keyPath, bits === '32' ? 'from32' : bits === '64' ? 'to32' : undefined, true);
}

export function findValueByNameInStruct(struct: RegStruct, key: string, valueName: string) {
}

export function findValueByNameLowerCaseInStruct(struct: RegStruct, key: string, valueName: string) {
  const values = Object.entries(struct).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]
  return values && Object.entries(values).find(([v]) => v.toLowerCase() === valueName.toLowerCase())?.[1]
}

export function execFileUtil(params: ExecFileParameters, opts: { onStdOut?: (str: string) => void, onStdErr?: (str: string) => void, onExit?: (code: number | null) => void }, elevated: ElevatedSudoPromptOpts | boolean = false): ChildProcess | null {

  // On wine, disable all wine debug messages to prevent them from mixing in stderr of the actual REG command.
  const extraEnv = isWindows ? {} : { WINEDEBUG: "-all" };

  if (elevated) {
    if (!isWindows) throw new RegErrorGeneral('Elevated mode is not supported for Wine.'); // It may work, however it's highly discouraged to run Wine as root.

    const cmd = escapeShellArg(params[0]);
    let args = (params?.[1] || []).map(v=>escapeShellArg(v)).join(' ');
    const elevatedOpts: ElevatedSudoPromptOpts = typeof elevated === 'object' && elevated !== null && elevated?.name?.length ? elevated : { name: PACKAGE_DISPLAY_NAME };
    const envStr = Object.entries(extraEnv).map(([k, v]) => `${k}="${v}"`).join(' ');

    if(cmd === 'powershell') {
        args = args.replaceAll(REGEX_LINE_DELIMITER, '\r');
        args = args.replaceAll('"', '""');
    }

    // For some reason, if we use powershell, we need to surround the arg with two double quotes, e.g. ""the powershell command"""
    let oneLinerExecution = (envStr?.length ? `${envStr} ` : '') + cmd + ' ' + args

    const REGEDITOR_COMMAND_DELIMITER = '__REGEDITOR__COMMAND__DELIMITER__';
    sudo(`@echo off && echo ${REGEDITOR_COMMAND_DELIMITER} && `+oneLinerExecution, elevatedOpts, (err, stdout, stderr) => {
      const out = (function trimStdinFromStdout() {
        let str = stdout?.toString() || '';
        if (isWindows) {
          const indexOfCommand = str.indexOf(REGEDITOR_COMMAND_DELIMITER)
          if (indexOfCommand !== -1) {
            str = str.substring(indexOfCommand + REGEDITOR_COMMAND_DELIMITER.length)
            const firstLineDown = str.indexOf('\r\n');
            if (firstLineDown !== -1) str = str.substring(firstLineDown + 2)
          }
        }
        return str;
      })();

      opts?.onStdErr?.(err?.toString() || stderr?.toString() || '');
      opts?.onStdOut?.(out);
      opts?.onExit?.(null);
    }, () => { }); // An empty callback is required here, otherwise there's an exception on linux when trying to run elevated commands
    return null;
  } else {

    const execParams = [...params] as ExecFileParameters;
    if (!execParams?.[2]) execParams[2] = {}
    execParams[2].env = {...process.env, ...extraEnv, ...execParams[2].env};
    if(isWindows) execParams[2].windowsHide = true;

    const proc = execFile(...execParams);
    if (opts?.onStdErr) proc.stderr?.on('data', stdErr => opts?.onStdErr?.(stdErr?.toString()));
    if (opts?.onStdOut) proc.stdout?.on('data', stdOut => opts?.onStdOut?.(stdOut?.toString()));
    if (opts?.onExit) proc.on('exit', opts?.onExit);
    return proc;
  };
}

export function execFileUtilAcc(params: ExecFileParameters, opts: { onExit?: (code: number | null, stdout:string, stderr:string) => void }, elevated: ElevatedSudoPromptOpts | boolean = false): ChildProcess | null {
  let stdoutStr = '', stderrStr = '';
  return execFileUtil(params, {
    onStdErr(data) { stderrStr += data; },
    onStdOut(data) { stdoutStr += data; },
    onExit: code => opts.onExit?.(code ?? null, stdoutStr, stderrStr)
  }, elevated);
}

export function containsWhitespace(str: string) {
  return /\s/.test(str);
}

export function escapeShellArg(arg: string, powershell = false) {
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

  if (containsWhitespace(escaped) || powershell || (!isWindows && escaped.includes('\\'))) {
    escaped = isWindows ? `"${escaped}"` : `'${escaped}'`;
  }

  return escaped;
}

export function escapePowerShellArg(arg: string) {
  return escapeShellArg(arg, true);
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
    trimmedStdErr === 'Error: User did not grant permission.' || // windows access denied if user denies UAC prompt
    trimmedStdErr.toLowerCase().includes('permission denied') // linux access denied
  ) {
    return new RegErrorAccessDenied(trimmedStdErr);
  }
  if (trimmedStdout === `reg: Invalid syntax. Type "REG ${command} /?" for help.`) return new RegErrorInvalidSyntax(trimmedStdout) // wine
  if (trimmedStdErr.includes(`"REG ${command} /?"`) || trimmedStdErr === 'ERROR: The parameter is incorrect.') return new RegErrorInvalidSyntax(trimmedStdErr); // windows
  return null;
}

export function findPowerShellErrorInTrimmedStdErr(trimmedStdErr: string) {
  if (
    (trimmedStdErr.includes('Access to the registry key') && trimmedStdErr.includes('is denied')) ||
    trimmedStdErr.includes('Requested registry access is not allowed.')
  ) return new RegErrorAccessDenied(trimmedStdErr)
  return null;
}

export function isKnownWineDriverStderrOrFirstTimeWineRun(stderr: string): boolean {
  if (isWindows) return false;
  if (stderr.startsWith('wine: created the configuration directory')) return true;
  const ok = new RegExp(/^the .* driver was unable to open .* this library is required at run time\.$/, 'im').test(stderr);
  return ok;
}

export const stoppable = PromiseStoppableFactory.create({ timeout: TIMEOUT_DEFAULT, error: new RegErrorTimeout('regeditor timed out') });

export function psConvertKindName(type:RegType) {
    switch(type) {
        case 'REG_SZ': return 'String';
        case 'REG_EXPAND_SZ': return 'ExpandString';
        case 'REG_DWORD': return 'DWord';
        case 'REG_MULTI_SZ': return 'MultiString';
        case 'REG_QWORD': return 'QWord';

        case 'REG_NONE':
        case 'REG_BINARY': return 'Binary';
        
        default: return 'Unknown';
    }
}

export function escapePowerShellRegKey(key: string) {
    return key.replaceAll("'", "''").replaceAll("\r", "").replaceAll("\n", "")
}

export async function filePathExists(filePath:string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch(e) {
    return false;
  }
}


/**
 * Used to find errors in cases where Windows is set to locale other than English, which affects stdout and stderr messages.
 */
export async function nonEnglish_REG_FindError(exitCode: number | null, keyPath: string, o: OptionsReg64Or32): Promise<'missing' | 'accessDenied' | null> {
  if (exitCode === 1 && isWindows) {
      try {
          const regBitsOpts = (o?.reg32 ? { reg32: o.reg32 } : o?.reg64 ? { reg64: o.reg64 } : {}) satisfies OptionsReg64Or32;
          const res = await psKeyExists({ keyPath, ...regBitsOpts });
          if (res?.keysMissing?.length) {
              return 'missing'
          }
      } catch (e) { }
      return 'accessDenied';
  }
  return null;
}