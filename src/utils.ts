import { COMMAND_NAME, ExecFileParameters, RegCmdExecParamsModifier } from "./types";

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