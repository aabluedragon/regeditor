import { RegErrorGeneral } from "../errors";
import { PromiseStoppable } from "../promise-stoppable";
import { TIMEOUT_DEFAULT, COMMAND_NAMES, REG_VALUENAME_DEFAULT, POWERSHELL_SET_ENGLISH_OUTPUT } from "../constants";
import { PSReadCmd, PSCommandConfig, PSReadCmdResult, PSReadOpts } from "../types-ps";
import { RegStruct, RegType } from "../types";
import { PSJsonResultKey, PSRegType } from "../types-internal";
import { optionalElevateCmdCall, stoppable, applyParamsModifier, execFileUtilAcc, regKeyResolvePath, regKeyResolveBitsView, regKeyPathIs64Bit, escapePowerShellRegKey, findPowerShellErrorInTrimmedStdErr } from "../utils";

const THIS_COMMAND = COMMAND_NAMES.POWERSHELL_READ;

function readRegJson(jsonOrArr: PSJsonResultKey|PSJsonResultKey[], lkeyToCommand:Record<string,PSReadOpts>): RegStruct {
    const struct: RegStruct = {};

    const jsonArr = Array.isArray(jsonOrArr) ? jsonOrArr : [jsonOrArr];
    for(const json of jsonArr) {
        if(json.Path == null) continue;
        const opts = (()=>{
            const lpath = json.Path.toLowerCase();
            // opts for exact key (not recursive subkeys)
            const o = lkeyToCommand?.[lpath];
            if(o) return o;
            for(const lkey in lkeyToCommand) {
                // opts for recursive subkeys
                if(lpath.startsWith(lkey)+'\\') return lkeyToCommand[lkey];
            }
            return {} as PSReadOpts;
        })();
        const optFilterTypes = opts?.t?.length ? (new Set(Array.isArray(opts?.t)? opts?.t : [opts?.t])) : null;

        const regPath = regKeyResolvePath(json.Path, opts?.reg32 ? 'to32' : opts?.reg64 ? 'from32' : undefined);
        if(!struct[regPath]) struct[regPath] = {};

        const values = Array.isArray(json.Values) ? json.Values : [json.Values];
        for(const value of values) {
            if(!value || value?.Name == null || value?.Value == null || value?.Type == null) continue;
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

            if(opts?.v && Name.toLowerCase() !== opts.v.toLowerCase()) continue;
            if(opts?.ve && Name !== REG_VALUENAME_DEFAULT) continue;
            if(optFilterTypes && !optFilterTypes?.has(regType)) continue;

            struct[regPath][Name] = { type: regType, data };
        }
    
        if(json.SubKeys != null) {
            const subKeys = Array.isArray(json.SubKeys) ? json.SubKeys : [];
            for(const subKey of subKeys) {
                const regPath = regKeyResolvePath(json.Path, opts?.reg32 ? 'to32' : opts?.reg64 ? 'from32' : undefined);
                struct[regPath] = {}; 
                const subStruct = readRegJson(subKey, lkeyToCommand);
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

    const lkeyToCommand: Record<string,PSReadOpts> = {}
    const queriedKeys: string[] = [];
    let psCommands = ''
    for(const command of commands) {
        const opts = structuredClone(typeof command === 'string' ? { keyPath: command } : command as PSReadOpts);
        if(regKeyPathIs64Bit(opts.keyPath)) {
            delete opts?.reg32; delete opts?.reg64;
        }
        
        let keyQuery = regKeyResolveBitsView(opts.keyPath, opts?.reg32? '32': opts?.reg64? '64' : undefined);
        keyQuery = escapePowerShellRegKey(keyQuery);
        psCommands += `$registryData += Get-RegistryKeyValues -RegistryPath 'Registry::${keyQuery}' -Recursive ${opts?.s ? '$true' : '$false'};\r`;
        lkeyToCommand[keyQuery.toLowerCase()] = opts;

        const originalKeyQueried = regKeyResolvePath(opts.keyPath);
        queriedKeys.push(originalKeyQueried);
    }

    return optionalElevateCmdCall(cfg, function run(_, elevated) {
        return stoppable.newPromise<PSReadCmdResult>((resolve, reject, setStopper) => {
            let cmdStr = `${POWERSHELL_SET_ENGLISH_OUTPUT}
            function Get-RegistryKeyValues {
                param (
                    [string]$RegistryPath,
                    [bool]$Recursive
                );

                $registryKey = $null;
                $registryValues = $null;
                Try {
                    $registryKey = Get-Item -Path $RegistryPath -ErrorAction Stop;
                    $registryValues = Get-ItemProperty -Path $RegistryPath -ErrorAction Stop;
                } Catch [System.Management.Automation.ItemNotFoundException] {
                    [PSCustomObject]@{
                        Path    = $null;
                        Values  = $null;
                        SubKeys = $null;
                    }
                }

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

                $subKeys = foreach ($subKey in Get-ChildItem -Path $RegistryPath) {
                    if ($Recursive) {
                        Get-RegistryKeyValues -RegistryPath $subKey.PSPath;
                    } else {
                        [PSCustomObject]@{
                            Path    = $subKey.PSPath.Substring($subKey.PSPath.IndexOf('::') + 2);
                            Values  = $null;
                            SubKeys = $null;
                        }
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
                        const commonError = findPowerShellErrorInTrimmedStdErr(trimmedStdErr);
                        if(commonError) return reject(commonError);
                        return reject(new RegErrorGeneral(trimmedStdErr))
                    };
                    try {
                        const jsonResult = JSON.parse(stdout) as PSJsonResultKey;
                        const struct = readRegJson(jsonResult, lkeyToCommand);
                        const returnedKeysLcase = new Set(Object.keys(struct).map(k => k.toLowerCase()));
                        const keysMissing = queriedKeys.filter(k => !returnedKeysLcase.has(k.toLowerCase()));
                        resolve({ cmd: params, struct, keysMissing });
                    } catch (e:any) {
                        return reject(e);
                    }
                },
            }, elevated);

            setStopper(() => proc?.kill());

        }, cfg?.timeout ?? TIMEOUT_DEFAULT);
    });
}

