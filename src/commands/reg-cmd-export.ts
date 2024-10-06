import { applyParamsModifier, execFileUtil, findCommonErrorInTrimmedStdErr, isKnownWineDriverStderrOrFirstTimeWineRun, optionalElevateCmdCall, VarArgsOrArray, stoppable, isWindows } from "../utils";
import { RegErrorAccessDenied, RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { ElevatedSudoPromptOpts, OptionsReg64Or32, RegExportCmd, RegExportCmdResult } from "../types";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { RegExportCmdResultSingle } from "../types-internal";
import { psKeyExists } from "./ps-key-exists";

const THIS_COMMAND = COMMAND_NAMES.EXPORT;

export function regCmdExportSingle(o: RegExportCmd, elevated: ElevatedSudoPromptOpts): PromiseStoppable<RegExportCmdResultSingle> {

    const args = [] as string[];
    args.push(o.keyPath)
    args.push(o.fileName);

    if (o.reg32) args.push('/reg:32');
    if (o.reg64) args.push('/reg:64');
    args.push('/y');

    return stoppable.newPromise((resolve, reject, setStopper) => {
        const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, ...args]], o?.cmdParamsModifier, o?.winePath);
        let stdoutStr = '', stderrStr = '';
        const proc = execFileUtil(params, {
            onStdErr(data) { stderrStr += data; },
            onStdOut(data) { stdoutStr += data; },
            async onExit(code) {
                const trimmedStdErr = stderrStr.trim();
                const trimmedStdOut = stdoutStr.trim();

                if (trimmedStdErr === 'ERROR: The system was unable to find the specified registry key or value.' || // windows
                    trimmedStdOut === 'reg: Unable to find the specified registry key') // wine
                    return resolve({ notFound: true, cmd: params });

                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr, trimmedStdOut);
                if (commonError) return reject(commonError);
                if (stderrStr.length && !isKnownWineDriverStderrOrFirstTimeWineRun(stderrStr)) {
                    const err = await nonEnglish_REG_FindError(code, o.keyPath, o);
                    if(err === 'missing') return resolve({ notFound: true, cmd: params });
                    else if(err === 'accessDenied') return reject(new RegErrorAccessDenied(o.keyPath));
                    return reject(new RegErrorGeneral(stderrStr));
                }
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
 * @returns returns the commands executed, and whether keys were missing. throws on errors such as access denied.
 */
export function regCmdExport(...opts: VarArgsOrArray<RegExportCmd>): PromiseStoppable<RegExportCmdResult> {
    const requests = opts.flat();
    return stoppable.all(requests.map(o => optionalElevateCmdCall(o, regCmdExportSingle))).then(res => {
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

/**
 * Used to find errors in cases where Windows is set to locale other than English, which affects stdout and stderr messages.
 */
async function nonEnglish_REG_FindError(exitCode: number | null, keyPath: string, o: OptionsReg64Or32): Promise<'missing' | 'accessDenied' | null> {
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