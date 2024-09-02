import { VarArgsOrArray } from "../utils";
import { findCommonErrorInTrimmedStdErr, RegErrorUnknown } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { RegDelete } from "../types";
import { execFile } from "child_process"

type RegDeleteResultSingle = {
    notFound?: boolean
}

function delSingle(d: RegDelete): PromiseStoppable<RegDeleteResultSingle> {

    const args = ['/f'] as string[];
    if (d.reg32) args.push('/reg:32');
    if (d.reg64) args.push('/reg:64');
    if (d.ve) args.push('/ve');
    if (d.va) args.push('/va');
    if (d.v) args.push('/v', d.v);

    return PromiseStoppable.createStoppable((resolve, reject, setStopper) => {
        const proc = execFile('reg', ['delete', d.keyPath, ...args]);

        setStopper(proc.kill);

        let stdoutStr = '', stderrStr = '';
        proc.stdout?.on('data', data => { stdoutStr += data.toString(); });
        proc.stderr?.on('data', data => { stderrStr += data.toString(); });

        proc.on('exit', code => {
            if (code !== 0) {
                const trimmed = stderrStr.trim();
                if (trimmed === 'ERROR: The system was unable to find the specified registry key or value.') return resolve({ notFound: true });
                const commonError = findCommonErrorInTrimmedStdErr("DELETE", trimmed);
                if(commonError) return reject(commonError);
                return reject(new RegErrorUnknown(stderrStr));
            }
            resolve({});
        });
    });
}


export type RegDeleteResult = {
    notFound: {
        commandObject: RegDelete,
        commandIndex: number,
    }[]
}

/**
 * Delete one or more registry keys or values  
 * Wrapper around the REG DELETE command.  
 * @param opts paramters for the REG DELETE command
 * @returns nothing. throws on errors such as access denied.
 */
export function del(...opts: VarArgsOrArray<RegDelete>): PromiseStoppable<RegDeleteResult> {
    const requests = opts.flat();
    return PromiseStoppable.allStoppable(requests.map(delSingle), res => {
        const response: RegDeleteResult = { notFound: [] };

        for (let i = 0; i < res.length; i++) {
            if (res[i].notFound) response.notFound.push({
                commandObject: requests[i],
                commandIndex: i
            });
        }

        return response;
    });
}