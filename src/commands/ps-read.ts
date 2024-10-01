import { RegErrorAccessDenied, RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES } from "../constants";
import { PSReadCmd, PSCommandConfig, PSReadCmdResult, PSReadOpts } from "../types-ps";
import { RegStruct, RegType } from "../types";
import { PSJsonResultKey, PSRegType } from "../types-internal";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolvePath } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_READ;

function readRegJson(jsonOrArr: PSJsonResultKey|PSJsonResultKey[], keysToUse32:Set<string>): RegStruct {
    const struct: RegStruct = {};

    const jsonArr = Array.isArray(jsonOrArr) ? jsonOrArr : [jsonOrArr];
    for(const json of jsonArr) {
        const values = Array.isArray(json.Values) ? json.Values : [json.Values];
        for(const value of values) {
            if(!value) continue;
            
            const { Name, Value, Type } = value;
            let regType: RegType | null = null;
            let data: any = null;
            switch(Type) {
                case PSRegType.REG_SZ:
                case PSRegType.REG_EXPAND_SZ:
                    regType = 'REG_SZ';
                    data = Value as string;
                    break;
                case PSRegType.REG_DWORD:
                    regType = 'REG_DWORD';
                    data = Value as number;
                    break;
                case PSRegType.REG_MULTI_SZ:
                    regType = 'REG_MULTI_SZ';
                    data = Value as string[];
                    break;
                case PSRegType.REG_QWORD:
                    regType = 'REG_QWORD';
                    data = Value as number;
                    break;
                case PSRegType.REG_BINARY:
                    regType = 'REG_BINARY';
                    data = (Value as number[]).map(v => v as number);
                    break;
                case PSRegType.REG_NONE:
                    regType = 'REG_NONE';
                    data = Value as number[];
                    break;
                default:
                    throw new RegErrorGeneral(`Unsupported registry value type: ${Type}`);
            }
            const regPath = regKeyResolvePath(json.Path, keysToUse32.has(json.Path.toLowerCase()) ? 'to32' : undefined);
            if(!struct[regPath]) struct[regPath] = {};
            struct[regPath][Name] = { type: regType, data };
        }
    
        if(json.SubKeys != null) {
            const subKeys = Array.isArray(json.SubKeys) ? json.SubKeys : [];
            for(const subKey of subKeys) {
                const regPath = regKeyResolvePath(json.Path, keysToUse32.has(json.Path.toLowerCase()) ? 'to32' : undefined);
                struct[regPath] = {}; 
                const subStruct = readRegJson(subKey, keysToUse32);
                for(const key in subStruct) {
                    struct[key] = subStruct[key];
                }
            }
        }    
    }
    
    return struct;
}

export function psRead(commands:PSReadCmd|PSReadCmd[], cfg:PSCommandConfig = {}): PromiseStoppable<PSReadCmdResult> {
    if(!Array.isArray(commands)) commands = [commands];

    // TODO reg-apply unify same type of command to one function call instead of multiple

    const keyToUse32: Set<string> = new Set();
    let psCommands = ''
    for(const command of commands) {
        const opts = typeof command === 'string' ? { keyPath: command } : command as PSReadOpts;
        let keyQuery = regKeyResolvePath(opts.keyPath, opts?.reg32? 'from32':undefined);
        keyQuery = keyQuery.replaceAll("'", "''").replaceAll("\r", "").replaceAll("\n", "");
        psCommands += `$registryData += Get-RegistryKeyValues -RegistryPath 'Registry::${keyQuery}' -Recursive ${opts?.s ? '$true' : '$false'};\r`;
        if(opts.reg32) keyToUse32.add(keyQuery.toLowerCase());
    }

    return optionalElevateCmdCall(cfg, function run(_, elevated) {
        return stoppable.newPromise<PSReadCmdResult>((resolve, reject, setStopper) => {
            let cmdStr = `[Threading.Thread]::CurrentThread.CurrentUICulture = 'en-US';
            function Get-RegistryKeyValues {
                param (
                    [string]$RegistryPath,
                    [bool]$Recursive
                );

                $registryKey = Get-Item -Path $RegistryPath;
                $registryValues = Get-ItemProperty -Path $RegistryPath;

                $values = foreach ($valueName in $registryKey.Property) {
                    $value = $registryValues.$valueName;

                    $valueType = $null;
                    try {
                        $valueType = $registryKey.GetValueKind($valueName);
                    } catch {}
                    
                    if ($valueName -eq '(default)') {$valueName = '(Default)'};
                    if ($valueName -eq '(Default)' -and $valueType -eq $null) {$valueType = 1};
                    if ($valueType -eq $null) {continue};

                    try {                        
                        [PSCustomObject]@{
                            Name  = $valueName;
                            Value = $value;
                            Type  = $valueType;
                        }
                    } catch {}
                }

                if ($Recursive) {
                    $subKeys = foreach ($subKey in Get-ChildItem -Path $RegistryPath) {
                        Get-RegistryKeyValues -RegistryPath $subKey.PSPath;
                    }
                }

                [PSCustomObject]@{
                    Path    = $registryKey.Name;
                    Values  = $values;
                    SubKeys = $subKeys;
                }
            }

            $registryData = @();
            ${psCommands}
            $registryData | ConvertTo-Json -Depth 100;`
            const params = applyParamsModifier(THIS_COMMAND, ['powershell', [cmdStr]], cfg?.cmdParamsModifier, cfg?.winePath);

            const proc = execFileUtilAcc(params, {
                onExit(_,stdout,stderr) {
                    const trimmedStdErr = stderr.trim();
                    if(trimmedStdErr) {
                        // TODO handle key(s) missing.
                        if(trimmedStdErr.includes('Requested registry access is not allowed')) return reject(new RegErrorAccessDenied(trimmedStdErr))
                        return reject(new RegErrorGeneral(trimmedStdErr))
                    };
                    try {
                        const jsonResult = JSON.parse(stdout) as PSJsonResultKey;
                        const struct = readRegJson(jsonResult, keyToUse32);
                        resolve({ cmd: params, struct });
                    } catch (e:any) {
                        return reject(e);
                    }
                },
            }, elevated);

            setStopper(() => proc?.kill());

        }, cfg?.timeout ?? TIMEOUT_DEFAULT);
    });
}

