import { applyParamsModifier, execFileUtil, findCommonErrorInTrimmedStdErr, optionalElevateCmdCall, VarArgsOrArray } from "../utils";
import { RegCopyErrorSourceDestSame, RegErrorGeneral } from "../errors";
import { allStoppable, newStoppable, PromiseStoppable } from "../promise-stoppable";
import { ElevatedSudoPromptOpts, ExecFileParameters, RegCopyCmd, RegCopyCmdResult } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";

const THIS_COMMAND = COMMAND_NAMES.COPY;

type RegCopyCmdResultSingle = {
    notFound?: boolean,
    cmd: ExecFileParameters
}

function regCmdCopySingle(c: RegCopyCmd, elevated: ElevatedSudoPromptOpts): PromiseStoppable<RegCopyCmdResultSingle> {

    const args = ['/f'] as string[];
    if (c.s) args.push('/s');
    if (c.reg32) args.push('/reg:32');
    if (c.reg64) args.push('/reg:64');

    return newStoppable((resolve, reject, setStopper) => {
        const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, c.keyPathSource, c.keyPathDest, ...args]], c?.cmdParamsModifier, c?.winePath);
        let stdoutStr = '', stderrStr = '';
        const proc = execFileUtil(params, {
            onStdErr(data) { stderrStr += data; },
            onStdOut(data) { stdoutStr += data; },
            onExit() {
                const trimmedStdErr = stderrStr.trim();
                const trimmedStdOut = stdoutStr.trim();

                if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.' || // windows
                    trimmedStdOut === 'reg: Unable to find the specified registry key') // wine
                    return resolve({ notFound: true, cmd: params });

                if (trimmedStdErr === 'ERROR: The registry entry cannot be copied onto itself.\r\nType "REG COPY /?" for usage.' || // windows
                    trimmedStdOut === 'reg: The source and destination keys cannot be the same') // wine
                    return reject(new RegCopyErrorSourceDestSame(stderrStr));

                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr);
                if (commonError) return reject(commonError);
                if (stderrStr.length) return reject(new RegErrorGeneral(stderrStr));
                resolve({ cmd: params });
            }
        }, elevated);

        setStopper(() => proc?.kill());
    }, c?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Copies registry keys given a key path to copy from, and a keypath to copy to. 
 * @param opts paramters for the REG COPY command
 * @returns returns the commands executed, and whether keys were missing. throws on errors such as access denied.
 */
export function regCmdCopy(...opts: VarArgsOrArray<RegCopyCmd>): PromiseStoppable<RegCopyCmdResult> {
    const requests = opts.flat();
    return allStoppable(requests.map(o => optionalElevateCmdCall(o, regCmdCopySingle))).then(res => {
        const response: RegCopyCmdResult = { notFound: [], cmds: res.map(r => r.cmd) };

        for (let i = 0; i < res.length; i++) {
            if (res[i].notFound) response.notFound.push({
                commandObject: requests[i],
                commandIndex: i
            });
        }

        return response;
    });
}