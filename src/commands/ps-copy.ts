import { RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, POWERSHELL_SET_ENGLISH_OUTPUT } from "../constants";
import { PSCommandConfig, PSDeleteCmdResult, PSCopyCmd, PSCopyCmdResult } from "../types-ps";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolveBitsView, escapePowerShellArg, regKeyResolveShortcutAndGetParts, escapePowerShellRegKey, regKeyResolvePath, findPowerShellErrorInTrimmedStdErr } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_COPY;

export function psCopy(commands:PSCopyCmd|PSCopyCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSCopyCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    const queries = [] as string[];
    let psCommands = `$ErrorActionPreference = 'Stop';
    $keysExistOrNot = @();
    `;

    psCommands += `
    function Copy-RegistryKeyValues {
    param (
        [string]$SourceKey,
        [string]$DestinationKey,
        [switch]$Recurse
    )

    if (-not (Test-Path $DestinationKey)) {
        New-Item -Path $DestinationKey -Force | Out-Null;
    }

    $values = Get-ItemProperty -Path $SourceKey;

    foreach ($name in $values.PSObject.Properties.Name) {
        if ($name -ne 'PSPath' -and $name -ne 'PSParentPath' -and $name -ne 'PSChildName' -and $name -ne 'PSDrive' -and $name -ne 'PSProvider') {
            Set-ItemProperty -Path $DestinationKey -Name $name -Value $values.$name;
        }
    }

    if ($Recurse) {
        $subKeys = Get-ChildItem -Path $SourceKey;

        foreach ($subKey in $subKeys) {
            $destinationSubKey = $DestinationKey + '\\' + $subKey.PSChildName;
            Copy-RegistryKeyValues -SourceKey $subKey.PSPath -DestinationKey $destinationSubKey -Recurse;
        }
    }

}
`
    for(const opts of commands) {
        queries.push(regKeyResolvePath(opts.keyPathSource));
        const srcEscapedKeyPath = escapePowerShellRegKey(regKeyResolveBitsView(opts.keyPathSource, opts?.reg32? '32' : opts?.reg64? '64' : null));
        const destEscapedKeyPath = escapePowerShellRegKey(regKeyResolveBitsView(opts.keyPathDest, opts?.reg32? '32' : opts?.reg64? '64' : null));

        psCommands += `
        $keyPath = 'Registry::${srcEscapedKeyPath}';
        Try {
        `;
        
        psCommands += `\r\nCopy-RegistryKeyValues -SourceKey 'Registry::${srcEscapedKeyPath}' -DestinationKey 'Registry::${destEscapedKeyPath}'${opts?.s ? ' -Recurse':''};\r\n`
        
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

