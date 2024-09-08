import { applyParamsModifier, execFileUtil, optionalElevateCmdCall, VarArgsOrArray } from "../utils";
import { findCommonErrorInTrimmedStdErr, RegErrorUnknown } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { ElevatedSudoPromptOpts, ExecFileParameters, RegDeleteCmd, RegDeleteCmdResult } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";

const THIS_COMMAND = COMMAND_NAMES.DELETE;

type RegDeleteCmdResultSingle = {
    notFound?: boolean,
    cmd: ExecFileParameters
}

function regCmdDeleteSingle(d: RegDeleteCmd, elevated: ElevatedSudoPromptOpts): PromiseStoppable<RegDeleteCmdResultSingle> {

    const args = ['/f'] as string[];
    if (d.reg32) args.push('/reg:32');
    if (d.reg64) args.push('/reg:64');
    if (d.ve) args.push('/ve');
    if (d.va) args.push('/va');
    if (d.v) args.push('/v', d.v);

    const params = applyParamsModifier(THIS_COMMAND, ['reg', ['delete', d.keyPath, ...args]], d?.cmdParamsModifier);

    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        let stdoutStr = '', stderrStr = '';
        const proc = execFileUtil(params, {
            onStdErr(data) { stderrStr += data; },
            onStdOut(data) { stdoutStr += data; },
            onExit() {
                const trimmed = stderrStr.trim();
                if (trimmed === 'ERROR: The system was unable to find the specified registry key or value.') return resolve({ notFound: true, cmd: params });
                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmed);
                if (commonError) return reject(commonError);
                if (stderrStr.length) return reject(new RegErrorUnknown(stderrStr));
                resolve({ cmd: params });
            }
        }, elevated);

        setStopper(() => proc?.kill());

    }, d?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Delete one or more registry keys or values  
 * Executes the REG DELETE command.  
 * @param opts paramters for the REG DELETE command
 * @returns nothing. throws on errors such as access denied.
 */
export function regCmdDelete(...opts: VarArgsOrArray<RegDeleteCmd>): PromiseStoppable<RegDeleteCmdResult> {
    const requests = opts.flat();
    return PromiseStoppable.allStoppable(requests.map(o => optionalElevateCmdCall(o, regCmdDeleteSingle)), res => {
        const response: RegDeleteCmdResult = { notFound: [], cmds: res.map(r => r.cmd) };

        for (let i = 0; i < res.length; i++) {
            if (res[i].notFound) response.notFound.push({
                commandObject: requests[i],
                commandIndex: i
            });
        }

        return response;
    });
}