import { RegErrorAccessDenied, RegErrorGeneral, RegErrorInvalidKeyName } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, POWERSHELL_SET_ENGLISH_OUTPUT, REGKEY_DOTNET_ROOTS } from "../constants";
import { PSCommandConfig, PSDeleteOpts, PSDeleteCmd, PSDeleteCmdResult } from "../types-ps";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolveBitsView, escapePowerShellArg, regKeyResolveShortcutAndGetParts } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_DELETE;

// TODO: in missing keys, support reg32 and reg64

export function psDelete(commands:PSDeleteCmd|PSDeleteCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSDeleteCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    let psCommands = ''
    for(const command of commands) {
        const opts = typeof command === 'string' ? { keyPath: command } : command as PSDeleteOpts;
        const keyPath = regKeyResolveBitsView(opts.keyPath, opts?.reg32? '32' : opts?.reg64? '64' : null);
        if(opts?.va) {
            psCommands += `Remove-ItemProperty -Path 'Registry::${keyPath}' -Name * -Force\r`;
        } else if(opts?.ve) {
            const {root, subkey} = regKeyResolveShortcutAndGetParts(opts.keyPath);
            const dotnetRootName = (REGKEY_DOTNET_ROOTS as Record<string,string>)[root];
            if(dotnetRootName == null) throw new RegErrorInvalidKeyName(`Invalid root key: ${root}, could not resolve to a .NET root key`);
            psCommands += `
            $key = [Microsoft.Win32.Registry]::${dotnetRootName}.OpenSubKey('${subkey}', $true);
            $key.DeleteValue("", $false);
            $key.Close();
            `;
        } else if(opts?.v) {
            psCommands += `Remove-ItemProperty -Path 'Registry::${keyPath}' -Name ${escapePowerShellArg(opts.v)} -Force\r`;
        } else {
            psCommands += `Remove-Item -Path Registry::${keyPath} -Recurse -Force\r`;
        }

    }

    return optionalElevateCmdCall(cfg, function run(_, elevated) {
        return stoppable.newPromise<PSDeleteCmdResult>((resolve, reject, setStopper) => {
            let cmdStr = `${POWERSHELL_SET_ENGLISH_OUTPUT}
            ${psCommands}
            `
            const params = applyParamsModifier(THIS_COMMAND, ['powershell', [cmdStr]], cfg?.cmdParamsModifier, cfg?.winePath);

            const proc = execFileUtilAcc(params, {
                onExit(_,__,stderr) {
                    const trimmedStdErr = stderr.trim();
                    if(trimmedStdErr) {
                        if(trimmedStdErr.includes('Requested registry access is not allowed')) return reject(new RegErrorAccessDenied(trimmedStdErr))
                        return reject(new RegErrorGeneral(trimmedStdErr))
                    };
                    try {
                        resolve({ cmd: params });
                    } catch (e:any) {
                        return reject(e);
                    }
                },
            }, elevated);

            setStopper(() => proc?.kill());

        }, cfg?.timeout ?? TIMEOUT_DEFAULT);
    });
}

