import { applyParamsModifier, execFileUtil, findCommonErrorInTrimmedStdErr, optionalElevateCmdCall, VarArgsOrArray } from "../utils";
import { RegErrorGeneral } from "../errors";
import { allStoppable, newStoppable, PromiseStoppable } from "../promise-stoppable";
import { ElevatedSudoPromptOpts, RegExportCmd, RegExportCmdResult } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { RegExportCmdResultSingle } from "../types-internal";

const THIS_COMMAND = COMMAND_NAMES.EXPORT;

export function regCmdExportSingle(o: RegExportCmd, elevated: ElevatedSudoPromptOpts): PromiseStoppable<RegExportCmdResultSingle> {

    const args = [] as string[];
    args.push(o.keyPath)
    args.push(o.fileName);

    if (o.reg32) args.push('/reg:32');
    if (o.reg64) args.push('/reg:64');
    args.push('/y');

    return newStoppable((resolve, reject, setStopper) => {
        const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, ...args]], o?.cmdParamsModifier, o?.winePath);
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

                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr);
                if (commonError) return reject(commonError);
                if (stderrStr.length) return reject(new RegErrorGeneral(stderrStr));
                resolve({ cmd: params });
            }
        }, elevated);

        setStopper(() => proc?.kill());
    }, o?.timeout ?? TIMEOUT_DEFAULT);
}

/**
 * Export registry keys 
 * Executes the REG EXPORT command.  
 * @param opts paramters for the REG EXPORT command
 * @returns nothing. throws on errors such as access denied. // TODO Fix comments
 */
export function regCmdExport(...opts: VarArgsOrArray<RegExportCmd>): PromiseStoppable<RegExportCmdResult> {
    const requests = opts.flat();
    return allStoppable(requests.map(o => optionalElevateCmdCall(o, regCmdExportSingle))).then(res => {
        const response: RegExportCmdResult = { notFound: [], cmds: res.map(r => r.cmd) };

        for (let i = 0; i < res.length; i++) {
            if (res[i].notFound) response.notFound.push({
                commandObject: requests[i],
                commandIndex: i
            });
        }

        return response;
    });
}