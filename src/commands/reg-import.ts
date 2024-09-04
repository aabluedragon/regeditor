import { findCommonErrorInTrimmedStdErr, RegErrorAccessDenied, RegErrorUnknown, RegImportErrorOpeningFile } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { execFile } from "child_process"
import { RegImportCmd, RegImportCmdOpts, RegImportCmdResult } from "../types";
import { applyParamsModifier } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.IMPORT;

/**
 * Performs a REG IMPORT command to import a .reg file into the registry
 * @param cmd The import command path, or options object.
 * @returns void when successful, otherwise an error is thrown.
 */
export function regImport(cmd: RegImportCmd): PromiseStoppable<RegImportCmdResult> {
    const opts: RegImportCmdOpts = typeof cmd === 'string' ? { fileName: cmd } : cmd;
    const fileName = opts.fileName;
    const args = [] as string[];
    if (opts.reg32) args.push('/reg:32');
    if (opts.reg64) args.push('/reg:64');

    return PromiseStoppable.createStoppable(async (resolve, reject, setStopper) => {
        const params = applyParamsModifier(THIS_COMMAND, ['reg', ["import", fileName, ...args]], opts?.cmdParamsModifier);
        const proc = execFile(...params);

        setStopper(() => proc.kill());

        let stdoutStr = '', stderrStr = '';
        proc.stdout?.on('data', data => { stdoutStr += data.toString(); });
        proc.stderr?.on('data', data => { stderrStr += data.toString(); });

        proc.on('exit', code => {
            if (code !== 0) {
                const trimmedStdErr = stderrStr.trim();
                const commonError = findCommonErrorInTrimmedStdErr(THIS_COMMAND, trimmedStdErr);
                if (commonError) return reject(commonError);
                if (trimmedStdErr === 'ERROR: Error opening the file. There may be a disk or file system error.') return reject(new RegImportErrorOpeningFile(trimmedStdErr))
                if (trimmedStdErr === 'ERROR: Error accessing the registry.') return reject(new RegErrorAccessDenied(trimmedStdErr));
                return reject(new RegErrorUnknown(stderrStr));
            }
            resolve({ cmds: [params] });
        });
    }, opts?.timeout ?? TIMEOUT_DEFAULT);
}

