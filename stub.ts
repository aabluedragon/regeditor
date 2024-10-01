
import { execFile, execFileSync } from 'child_process';
import { psRead } from './src/commands/ps-read';
import { regApply } from './src';

async function main() {

    try {

        /*

        {
            "Name":  "(default)",
            "Value":  "wfdwfw",
            "Type":  3
        },

        if name is (default), value is a string, type is 3, then it is REG_SZ
        */
        // const key = `HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlayss`;
        // const escapedKey = key.replaceAll("'", "''").replaceAll("\r", "").replaceAll("\n", "");
        // const result = execFileSync('powershell', [`[Threading.Thread]::CurrentThread.CurrentUICulture = 'en-US';
        //     $registryPath = 'Registry::${escapedKey}'
        //     $registryKey = Get-Item -Path $registryPath
        //     $registryValues = Get-ItemProperty -Path $registryPath

        //     $results = foreach ($valueName in $registryKey.Property) {
        //         $value = $registryValues.$valueName
        //         $valueType = $registryKey.GetValueKind($valueName)
                
        //         [PSCustomObject]@{
        //             Name = $valueName
        //             Value = $value
        //             Type = $valueType
        //         }
        //     }

        //     $results | ConvertTo-Json
        //     `]);
        //Get-ItemProperty -Path "Registry::" | ConvertTo-Json
        // console.log(result.toString());

        const res = await psRead([{keyPath:'HKLM\\Software\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay', s: true}
            , 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Phone\\Service'
        ]);
        debugger
    } catch (e:any) {
        console.error(e.toString());
    }
}

main()