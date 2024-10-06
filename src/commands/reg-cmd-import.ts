import { RegErrorAccessDenied, RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { ElevatedSudoPromptOpts, OptionsReg64Or32, RegImportCmd, RegImportCmdOpts, RegImportCmdResult } from "../types";
import { applyParamsModifier, execFileUtil, filePathExists, findCommonErrorInTrimmedStdErr, isKnownWineDriverStderrOrFirstTimeWineRun, isWindows, optionalElevateCmdCall, stoppable } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.IMPORT;

/**
 * Performs a REG IMPORT command to import a .reg file into the registry
 * @param cmd The import command path, or options object.
 * @returns void when successful, otherwise an error is thrown.
 */
export function regCmdImport(cmd: RegImportCmd): PromiseStoppable<RegImportCmdResult> {
    const opts: RegImportCmdOpts = typeof cmd === 'string' ? { fileName: cmd } : cmd;
    const fileName = opts.fileName;
    const args = [] as string[];
    if (opts.reg32) args.push('/reg:32');
    if (opts.reg64) args.push('/reg:64');


    function run(_:RegImportCmd, elevated: ElevatedSudoPromptOpts) {
        return stoppable.newPromise<RegImportCmdResult>((resolve, reject, setStopper) => {
            const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, fileName, ...args]], opts?.cmdParamsModifier, opts?.winePath);
    
            let stdoutStr = '', stderrStr = '';
            const proc = execFileUtil(params, {
                onStdErr(data) { stderrStr += data; },
                onStdOut(data) { stdoutStr += data; },
                async onExit(code) {
                    const trimmedStdErr = stderrStr.trim();
                    const trimmedStdOut = stdoutStr.trim();
                    const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr, trimmedStdOut);
                    if (commonError) return reject(commonError);
                    if (trimmedStdErr === 'ERROR: Error opening the file. There may be a disk or file system error.' || trimmedStdErr === 'ERROR: Error accessing the registry.') return reject(new RegErrorAccessDenied(trimmedStdErr));
                    if (trimmedStdErr.length && trimmedStdErr !== 'The operation completed successfully.' && !isKnownWineDriverStderrOrFirstTimeWineRun(stderrStr)) { // REG IMPORT writes a success message into stderr.
                        const err = await nonEnglish_REG_FindError(code, fileName);
                        if(err === 'accessDenied') return reject(new RegErrorAccessDenied(trimmedStdErr));
                        else if(err === 'missing') return reject(new RegErrorGeneral(trimmedStdErr));
                        if(code === 1) return reject(new RegErrorGeneral(trimmedStdErr));
                    }
                    resolve({ cmds: [params] });
                },
            }, elevated);
    
            setStopper(() => proc?.kill());
    
        }, opts?.timeout ?? TIMEOUT_DEFAULT);
    }

    return optionalElevateCmdCall(opts, run);
}


/**
 * Used to find errors in cases where Windows is set to locale other than English, which affects stdout and stderr messages.
 */
async function nonEnglish_REG_FindError(exitCode: number | null, regFilePath:string): Promise<'missing' | 'accessDenied' | null> {
    if (exitCode === 1 && isWindows) {
        try {
            const exists = await filePathExists(regFilePath);
            if (!exists) {
                return 'missing'
            }
        } catch (e) { }
        return 'accessDenied';
    }
    return null;
}