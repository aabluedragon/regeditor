import { RegErrorGeneral, RegErrorInvalidKeyName, RegErrorInvalidSyntax } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, POWERSHELL_SET_ENGLISH_OUTPUT, REGKEY_DOTNET_ROOTS } from "../constants";
import { PSCommandConfig, PSAddCmdResult, PSAddOpts, PSAddCmd } from "../types-ps";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, psConvertKindName, escapePowerShellArg, regKeyResolveBitsView, escapePowerShellRegKey, regKeyResolveShortcutAndGetParts, findPowerShellErrorInTrimmedStdErr } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_ADD;

export function psAdd(commands:PSAddCmd|PSAddCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSAddCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    let psCommands = ''
    const lcaseKeysAdded = new Set<string>();
    for(const command of commands) {
        const opts = typeof command === 'string' ? { keyPath: command } : command as PSAddOpts;
        const keyPath = regKeyResolveBitsView(opts.keyPath, opts?.reg32? '32' : opts?.reg64? '64' : null);
        const lkeyPath = keyPath.toLowerCase();
        if(!lcaseKeysAdded.has(lkeyPath)) {
            // add key (if it doesn't exist)
            psCommands += `$p = 'Registry::${escapePowerShellRegKey(keyPath)}';
            if (-not (Test-Path $p)) {
                New-Item -Path $p -Force;
            }\r`;
            lcaseKeysAdded.add(lkeyPath);
        }

        // add value
        if(opts?.value) {
            const v = opts.value;
            
            const data = v?.data!=null ? (
                Array.isArray(v.data) ? "@("+v.data.map(i=>escapePowerShellArg(`${i}`)).join(',')+")" : escapePowerShellArg(`${v.data}`)
            ) : null;
            const type = psConvertKindName(v.type);
            if(v.type === 'REG_NONE') {
                const name = opts?.v ? escapePowerShellArg(opts.v) : opts?.ve? escapePowerShellArg("") : null;
                if(!name) throw new RegErrorInvalidSyntax('name not specified for value');
                const {root, subkey} = regKeyResolveShortcutAndGetParts(opts.keyPath);
                const dotnetRootName = (REGKEY_DOTNET_ROOTS as Record<string,string>)[root];
                if(dotnetRootName == null) throw new RegErrorInvalidKeyName(`Invalid root key: ${root}, could not resolve to a .NET root key`);
                psCommands += `
                $key = [Microsoft.Win32.Registry]::${dotnetRootName}.OpenSubKey('${escapePowerShellRegKey(subkey)}', $true);
                $key.SetValue(${name}, [byte[]]@(${data}), [Microsoft.Win32.RegistryValueKind]::None);
                $key.Close();
                `;
            } else {
                const name = opts?.v ? escapePowerShellArg(opts.v) : opts?.ve? escapePowerShellArg("(default)") : null;
                if(!name) throw new RegErrorInvalidSyntax('name not specified for value');
                const valueArg = data?.length ? `-Value ${data}` : '';
                psCommands += `New-ItemProperty -Path 'Registry::${keyPath}' -Name ${name} ${valueArg} -PropertyType ${type} -Force;\r`;
            }
        }
    }

    return optionalElevateCmdCall(cfg, function run(_, elevated) {
        return stoppable.newPromise<PSAddCmdResult>((resolve, reject, setStopper) => {
            let cmdStr = `${POWERSHELL_SET_ENGLISH_OUTPUT}
            ${psCommands}
            `
            const params = applyParamsModifier(THIS_COMMAND, ['powershell', [cmdStr]], cfg?.cmdParamsModifier, cfg?.winePath);

            const proc = execFileUtilAcc(params, {
                onExit(_,__,stderr) {
                    const trimmedStdErr = stderr.trim();
                    if(trimmedStdErr) {
                        const commonError = findPowerShellErrorInTrimmedStdErr(trimmedStdErr);
                        if(commonError) return reject(commonError);
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

