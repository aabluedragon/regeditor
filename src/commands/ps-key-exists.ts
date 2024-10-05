import { RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, POWERSHELL_SET_ENGLISH_OUTPUT } from "../constants";
import { PSCommandConfig, PSKeyExistsCmd, PSKeyExistsCmdResult, PSKeyExistsOpts } from "../types-ps";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolveBitsView, escapePowerShellRegKey, regKeyResolvePath, findPowerShellErrorInTrimmedStdErr } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_KEYEXISTS;

export function psKeyExists(commands:PSKeyExistsCmd|PSKeyExistsCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSKeyExistsCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    const queries = [] as string[];
    let psCommands = `$ErrorActionPreference = 'Stop';
    $keysExistOrNot = @();
    `;
    for(const command of commands) {
        const opts = typeof command === 'string' ? { keyPath: command } : command as PSKeyExistsOpts;
        queries.push(regKeyResolvePath(opts.keyPath));
        const escapedKeyPath = escapePowerShellRegKey(regKeyResolveBitsView(opts.keyPath, opts?.reg32? '32' : opts?.reg64? '64' : null));
        psCommands += `
        $keyPath = 'Registry::${escapedKeyPath}';
        Try {
            $registryKey = Get-Item -Path $keyPath -ErrorAction Stop;
            $keysExistOrNot += $true;
        } Catch [System.Management.Automation.ItemNotFoundException] {
            $keysExistOrNot += $false;
        }
        `;
    }
    psCommands += `
    $keysExistOrNot | ConvertTo-Json
    `;

    return optionalElevateCmdCall(cfg, function run(_, elevated) {
        return stoppable.newPromise<PSKeyExistsCmdResult>((resolve, reject, setStopper) => {
            let cmdStr = `${POWERSHELL_SET_ENGLISH_OUTPUT}
            ${psCommands}
            `
            const params = applyParamsModifier(THIS_COMMAND, ['powershell', [cmdStr]], cfg?.cmdParamsModifier, cfg?.winePath);

            const proc = execFileUtilAcc(params, {
                onExit(_,stdout,stderr) {
                    const trimmedStdErr = stderr.trim();
                    if(trimmedStdErr) {
                        const commonError = findPowerShellErrorInTrimmedStdErr(trimmedStdErr);
                        if(commonError) return reject(commonError);
                        return reject(new RegErrorGeneral(trimmedStdErr))
                    };
                    try {
                        const parsed = JSON.parse(stdout);
                        const keysExistOrNot: boolean[] = Array.isArray(parsed) ? parsed : [parsed];
                        const keysMissing: string[] = [];
                        keysExistOrNot.forEach((exists, i) => {
                            if(exists) return;
                            const q = queries[i];
                            if(!keysMissing.find(k=>k.toLowerCase() === q.toLowerCase())) {
                                keysMissing.push(q);
                            }
                        });
                        resolve({ cmd: params, keysMissing });
                    } catch (e:any) {
                        return reject(e);
                    }
                },
            }, elevated);

            setStopper(() => proc?.kill());

        }, cfg?.timeout ?? TIMEOUT_DEFAULT);
    });
}

