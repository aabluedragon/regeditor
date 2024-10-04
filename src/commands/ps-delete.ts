import { RegErrorGeneral, RegErrorInvalidKeyName } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, POWERSHELL_SET_ENGLISH_OUTPUT, REGKEY_DOTNET_ROOTS } from "../constants";
import { PSCommandConfig, PSDeleteOpts, PSDeleteCmd, PSDeleteCmdResult } from "../types-ps";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolveBitsView, escapePowerShellArg, regKeyResolveShortcutAndGetParts, escapePowerShellRegKey, regKeyResolvePath, findPowerShellErrorInTrimmedStdErr } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_DELETE;

export function psDelete(commands:PSDeleteCmd|PSDeleteCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSDeleteCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    const queries = [] as string[];
    let psCommands = `$ErrorActionPreference = 'Stop';
    $keysExistOrNot = @();
    `;
    for(const command of commands) {
        const opts = typeof command === 'string' ? { keyPath: command } : command as PSDeleteOpts;
        queries.push(regKeyResolvePath(opts.keyPath));
        const escapedKeyPath = escapePowerShellRegKey(regKeyResolveBitsView(opts.keyPath, opts?.reg32? '32' : opts?.reg64? '64' : null));
        psCommands += `
        $keyPath = 'Registry::${escapedKeyPath}';
        Try {
        `;
        if(opts?.va) {
            psCommands += `Remove-ItemProperty -Path $keyPath -Name * -Force;\r\n`;
        } else if(opts?.ve) {
            const {root, subkey} = regKeyResolveShortcutAndGetParts(opts.keyPath);
            const dotnetRootName = (REGKEY_DOTNET_ROOTS as Record<string,string>)[root];
            if(dotnetRootName == null) throw new RegErrorInvalidKeyName(`Invalid root key: ${root}, could not resolve to a .NET root key`);
            psCommands += `
            $key = [Microsoft.Win32.Registry]::${dotnetRootName}.OpenSubKey('${escapePowerShellRegKey(subkey)}', $true);
            $key.DeleteValue("", $false);
            $key.Close();
            `;
        } else if(opts?.v) {
            psCommands += `Remove-ItemProperty -Path $keyPath -Name ${escapePowerShellArg(opts.v)} -Force;\r\n`;
        } else {
            psCommands += `Remove-Item -Path $keyPath -Recurse -Force;\r\n`;
        }
        psCommands += `
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
        return stoppable.newPromise<PSDeleteCmdResult>((resolve, reject, setStopper) => {
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

