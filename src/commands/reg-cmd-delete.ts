import { applyParamsModifier, execFileUtil, findCommonErrorInTrimmedStdErr, isKnownWineDriverStderrOrFirstTimeWineRun, optionalElevateCmdCall, VarArgsOrArray, stoppable, nonEnglish_REG_keyMissingOrAccessDenied, setBitsArg } from "../utils";
import { RegErrorAccessDenied, RegErrorGeneral } from "../errors";
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
    setBitsArg(args, d);
    if (d.ve) args.push('/ve');
    if (d.va) args.push('/va');
    if (d.v) args.push('/v', d.v);

    return stoppable.newPromise((resolve, reject, setStopper) => {
        const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, d.keyPath, ...args]], d?.cmdParamsModifier, d?.winePath);
        let stdoutStr = '', stderrStr = '';
        const proc = execFileUtil(params, {
            onStdErr(data) { stderrStr += data; },
            onStdOut(data) { stdoutStr += data; },
            async onExit(code) {
                const trimmedStdErr = stderrStr.trim();
                const trimmedStdOut = stdoutStr.trim();

                if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.' || // windows
                    trimmedStdOut === 'reg: Unable to find the specified registry value') // wine
                    return resolve({ notFound: true, cmd: params });
                
                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr, trimmedStdOut);
                if (commonError) return reject(commonError);
                if (stderrStr.length && !isKnownWineDriverStderrOrFirstTimeWineRun(stderrStr)) {
                    const err = await nonEnglish_REG_keyMissingOrAccessDenied(code, d.keyPath, d);
                    if(err === 'missing') return resolve({ notFound: true, cmd: params });
                    else if(err === 'accessDenied') return reject(new RegErrorAccessDenied(trimmedStdErr));
                    return reject(new RegErrorGeneral(stderrStr));
                }
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
 * @returns returns the commands executed, and whether keys were missing. throws on errors such as access denied.
 */
export function regCmdDelete(...opts: VarArgsOrArray<RegDeleteCmd>): PromiseStoppable<RegDeleteCmdResult> {
    const requests = opts.flat();
    return stoppable.all(requests.map(o => optionalElevateCmdCall(o, regCmdDeleteSingle))).then(res => {
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