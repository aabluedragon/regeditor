import { applyParamsModifier, VarArgsOrArray } from "../utils";
import { findCommonErrorInTrimmedStdErr, RegErrorUnknown } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { ExecFileParameters, RegDeleteCmd, RegDeleteCmdResult } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { execFile } from "child_process"

const THIS_COMMAND = COMMAND_NAMES.DELETE;

type RegDeleteCmdResultSingle = {
    notFound?: boolean,
    cmd: ExecFileParameters
}

function regDeleteSingle(d: RegDeleteCmd): PromiseStoppable<RegDeleteCmdResultSingle> {

    const args = ['/f'] as string[];
    if (d.reg32) args.push('/reg:32');
    if (d.reg64) args.push('/reg:64');
    if (d.ve) args.push('/ve');
    if (d.va) args.push('/va');
    if (d.v) args.push('/v', d.v);

    const params = applyParamsModifier(THIS_COMMAND, ['reg', ['delete', d.keyPath, ...args]], d?.cmdParamsModifier);

    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        const proc = execFile(...params);

        setStopper(() => proc.kill());

        let stdoutStr = '', stderrStr = '';
        proc.stdout?.on('data', data => { stdoutStr += data.toString(); });
        proc.stderr?.on('data', data => { stderrStr += data.toString(); });

        proc.on('exit', code => {
            if (code !== 0) {
                const trimmed = stderrStr.trim();
                if (trimmed === 'ERROR: The system was unable to find the specified registry key or value.') return resolve({ notFound: true, cmd: params });
                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmed);
                if (commonError) return reject(commonError);
                return reject(new RegErrorUnknown(stderrStr));
            }
            resolve({ cmd: params });
        });
    }, d?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Delete one or more registry keys or values  
 * Executes the REG DELETE command.  
 * @param opts paramters for the REG DELETE command
 * @returns nothing. throws on errors such as access denied.
 */
export function regDelete(...opts: VarArgsOrArray<RegDeleteCmd>): PromiseStoppable<RegDeleteCmdResult> {
    const requests = opts.flat();
    return PromiseStoppable.allStoppable(requests.map(regDeleteSingle), res => {
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