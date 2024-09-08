import { PromiseStoppable } from "../promise-stoppable";
import { RegAddCmd, RegType, RegData, ExecFileParameters, RegAddCmdResult, ElevatedSudoPromptOpts } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { findCommonErrorInTrimmedStdErr, RegErrorInvalidSyntax, RegErrorUnknown } from "../errors";
import { applyParamsModifier, execFileUtil, optionalElevateCmdCall, VarArgsOrArray } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.ADD;

function serializeData(type: RegType, data: RegData, separator: string): string | null {
    switch (type) {
        case 'REG_DWORD':
        case 'REG_QWORD':
        case 'REG_SZ':
        case 'REG_EXPAND_SZ':
            return data as string;
        case 'REG_MULTI_SZ':
            return (data as string[]).join(separator);
        case 'REG_BINARY':
            return (data as number[]).map(n => n.toString(16).padStart(2, '0')).join('');
        case 'REG_NONE': // REG_NONE data is not supported properly by the REG ADD command, instead of treating it as hex string as in REG_BINARY, REG ADD treats it as a UTF8 string, it can only be properly encoded using .reg files (use REG IMPORT instead of you need to put binary data here)
        default:
            throw new RegErrorInvalidSyntax(`Invalid data type: ${type}`);
    }
}

function regCmdAddSingle(a: RegAddCmd, elevated: ElevatedSudoPromptOpts): PromiseStoppable<{ cmd: ExecFileParameters }> {
    const opts = typeof a === 'string' ? { keyPath: a } : a;
    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        try {
            const args = ['/f'] as string[];
            if (opts.reg32) args.push('/reg:32');
            if (opts.reg64) args.push('/reg:64');
            if (opts.s) args.push('/s', opts.s);
            if (opts.value) {
                args.push('/t', opts.value.type);
                if (opts.value.type !== 'REG_NONE') // Ignoring data for REG_NONE, as the REG ADD command cannot serialize it properly as binary data (only reading using REG QUERY is supported).
                    args.push('/d', serializeData(opts.value.type, opts.value.data, opts.s || '\\0')!);
            }
            if (opts.v) args.push('/v', opts.v);
            if (opts.ve) args.push('/ve');

            const params = applyParamsModifier(THIS_COMMAND, ['reg', ['add', opts.keyPath, ...args]], opts?.wine||false, opts.cmdParamsModifier);

            let stdoutStr = '', stderrStr = '';
            const proc = execFileUtil(params, {
                onStdErr(data) { stderrStr += data },
                onStdOut(data) { stdoutStr += data },
                onExit() {
                    const trimmedStdErr = stderrStr.trim();
                    const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr);
                    if (commonError) return reject(commonError);
                    if (trimmedStdErr.length) return reject(new RegErrorUnknown(stderrStr));

                    const trimmedStdout = stdoutStr.trim();
                    if (trimmedStdout !== 'The operation completed successfully.' // windows
                        &&trimmedStdout !== 'reg: The operation completed successfully' // wine
                    ) {
                        return reject(new RegErrorUnknown(stderrStr || stdoutStr));
                    }
                    resolve({ cmd: params });
                }
            }, elevated);

            setStopper(() => proc?.kill());
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
export function regCmdAdd(...addCommands: VarArgsOrArray<RegAddCmd>): PromiseStoppable<RegAddCmdResult> {
    return PromiseStoppable.allStoppable(addCommands.flat().map(o => optionalElevateCmdCall(o, regCmdAddSingle)), res => ({ cmds: res.map(r => r.cmd) }));
}