import { execFile } from "child_process";
import { PromiseStoppable } from "../promise-stoppable";
import { RegAddCmd, RegType, RegData } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { findCommonErrorInTrimmedStdErr, RegErrorInvalidSyntax, RegErrorUnknown } from "../errors";
import { VarArgsOrArray } from "../utils";

function serializeData(type: RegType, data: RegData, separator: string): string | null {
    switch (type) {
        case 'REG_DWORD':
        case 'REG_QWORD':
        case 'REG_SZ':
        case 'REG_EXPAND_SZ':
            return `${data}`;
        case 'REG_MULTI_SZ':
            return (data as string[]).join(separator);
        case 'REG_BINARY':
            return (data as number[]).map(n => n.toString(16).padStart(2, '0')).join('');
        case 'REG_NONE':
            return null;
        default:
            throw new RegErrorInvalidSyntax(`Invalid data type: ${type}`);
    }
}

function regAddSingle(a: RegAddCmd): PromiseStoppable<void> {
    const opts = typeof a === 'string' ? { keyPath: a } : a;
    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        try {
            const args = ['/f'] as string[];
            if (opts.reg32) args.push('/reg:32');
            if (opts.reg64) args.push('/reg:64');
            if (opts.s) args.push('/s', opts.s);
            if (opts.value) {
                args.push('/t', opts.value.type);
                if (opts.value.type !== 'REG_NONE')
                    args.push('/d', serializeData(opts.value.type, opts.value.data, opts.s || '\\0')!);
            }
            if (opts.v) args.push('/v', opts.v);
            if (opts.ve) args.push('/ve');

            const proc = execFile('reg', ['add', opts.keyPath, ...args]);

            setStopper(()=>proc.kill());

            let stdoutStr = '', stderrStr = '';
            proc.stdout?.on('data', data => { stdoutStr += data.toString(); });
            proc.stderr?.on('data', data => { stderrStr += data.toString(); });

            proc.on('exit', code => {
                if (code !== 0) {
                    const trimmedStdErr = stderrStr.trim();
                    const commonError = findCommonErrorInTrimmedStdErr(COMMAND_NAMES.ADD, trimmedStdErr);
                    if (commonError) return reject(commonError);
                    return reject(new RegErrorUnknown(stderrStr));
                }
                const trimmedStdout = stdoutStr.trim();
                if (trimmedStdout !== 'The operation completed successfully.') {
                    return reject(new RegErrorUnknown(stderrStr || stdoutStr));
                }
                resolve();
            });
        } catch (e) {
            reject(e)
        }
    }, opts?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Executes the REG ADD command.  
 * Adds keys and/or values to the registry.  
 * @param addCommands one or more REG ADD commands
 * @returns void when successful, throws an error when failed
 */
export function regAdd(...addCommands: VarArgsOrArray<RegAddCmd>): PromiseStoppable<void> {
    return PromiseStoppable.allStoppable(addCommands.flat().map(regAddSingle), () => { });
}