import { execFile } from "child_process";
import { PromiseStoppable } from "../promise-stoppable";
import { COMMAND_NAMES, RegAdd, RegType, RegValue } from "../types";
import { findCommonErrorInTrimmedStdErr, RegErrorUnknown } from "../errors";
import { VarArgsOrArray } from "../utils";

function serializeData(type: RegType, data: RegValue, separator: string): string | null {
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
    }
}

function addSingle(a: RegAdd): PromiseStoppable<void> {
    const opts = typeof a === 'string' ? { keyPath: a } : a;
    const key = opts.keyPath;

    const args = ['/f'] as string[];
    if (opts.reg32) args.push('/reg:32');
    if (opts.reg64) args.push('/reg:64');
    if (opts.s) args.push('/s', opts.s);
    if (opts.data) {
        args.push('/t', opts.data.type);
        if (opts.data.type !== 'REG_NONE')
            args.push('/d', serializeData(opts.data.type, opts.data.value, opts.s || '\\0')!);
    }
    if (opts.v) args.push('/v', opts.v);
    if (opts.ve) args.push('/ve');

    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        const proc = execFile('reg', ['add', opts.keyPath, ...args]);

        setStopper(proc.kill);

        let stdoutStr = '', stderrStr = '';
        proc.stdout?.on('data', data => { stdoutStr += data.toString(); });
        proc.stderr?.on('data', data => { stderrStr += data.toString(); });

        proc.on('exit', code => {
            if (code !== 0) {
                const trimmedStdErr = stderrStr.trim();
                const commonError = findCommonErrorInTrimmedStdErr(COMMAND_NAMES.ADD, trimmedStdErr);
                if(commonError) return reject(commonError);
                return reject(new RegErrorUnknown(stderrStr));
            }
            const trimmedStdout = stdoutStr.trim();
            if (trimmedStdout !== 'The operation completed successfully.') {
                return reject(new RegErrorUnknown(stderrStr || stdoutStr));
            }
            resolve({});
        });
    });
}

/**
 * Wrapper around the REG ADD command.  
 * Adds keys and/or values to the registry.  
 * @param addCommands one or more REG ADD commands
 * @returns void when successful, throws an error when failed
 */
export function add(...addCommands: VarArgsOrArray<RegAdd>): PromiseStoppable<void> {
    return PromiseStoppable.allStoppable(addCommands.flat().map(addSingle), () => { });
}