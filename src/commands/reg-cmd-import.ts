import { RegErrorAccessDenied, RegErrorGeneral } from "../errors";
import { newStoppable, PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { ElevatedSudoPromptOpts, RegImportCmd, RegImportCmdOpts, RegImportCmdResult } from "../types";
import { applyParamsModifier, execFileUtil, findCommonErrorInTrimmedStdErr, isKnownWineDriverStderrOrFirstTimeWineRun, optionalElevateCmdCall } from "../utils";

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
        return newStoppable<RegImportCmdResult>((resolve, reject, setStopper) => {
            const params = applyParamsModifier(THIS_COMMAND, ['reg', [THIS_COMMAND, fileName, ...args]], opts?.cmdParamsModifier, opts?.winePath);
    
            let stdoutStr = '', stderrStr = '';
            const proc = execFileUtil(params, {
                onStdErr(data) { stderrStr += data; },
                onStdOut(data) { stdoutStr += data; },
                onExit() {
                    const trimmedStdErr = stderrStr.trim();
                    const trimmedStdOut = stdoutStr.trim();
                    const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr, trimmedStdOut);
                    if (commonError) return reject(commonError);
                    if (trimmedStdErr === 'ERROR: Error opening the file. There may be a disk or file system error.' || trimmedStdErr === 'ERROR: Error accessing the registry.') return reject(new RegErrorAccessDenied(trimmedStdErr));
                    if (trimmedStdErr.length && trimmedStdErr !== 'The operation completed successfully.' && !isKnownWineDriverStderrOrFirstTimeWineRun(stderrStr)) return reject(new RegErrorGeneral(stderrStr)); // REG IMPORT writes a success message into stderr.
                    resolve({ cmds: [params] });
                },
            }, elevated);
    
            setStopper(() => proc?.kill());
    
        }, opts?.timeout ?? TIMEOUT_DEFAULT);
    }

    return optionalElevateCmdCall(opts, run);
}

