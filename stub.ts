import { regCmdQuery, regCmdDelete, regCmdAdd, regApply, regCmdImport } from './src/index';

async function main() {

    try {
        const p = regCmdQuery(
            {keyPath:'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay', s:true},
        )
        const res = await p;
        console.log(JSON.stringify(res, null, 4));

        // const p = regCmdDelete({
        //     keyPath:"HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay\\name",
        // })
        // // p.stop();
        // const res = await p;
        // console.log(res)

        // const p = regCmdAdd({
        //     keyPath:"HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay",
        //     value: {
        //         type: "REG_NONE",
        //     },
        //     v: "name"
        // })
        // // p.stop();
        // const res = await p;
        // console.log(res)


        /*

[HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\Microsoft\DirectPlay\Services\{5146ab8cb6b1ce11920c00aa006c4972}\Players]

[HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\Microsoft\DirectPlay\Services\{5146ab8cb6b1ce11920c00aa006c4972}\Sessions]

         */

        regApply({
            "HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay": {
                // "(Default)": {type:"REG_SZ", data: "cool"},
                what: {type:"REG_SZ", data: "cool"},
                dwReserved1: {type:"REG_DWORD", data: 0x32},
                dwReserved2: {type:"REG_DWORD", data: 0x0},
                Guid: {type:"REG_SZ", data: "{685BC400-9D2C-11cf-A9CD-00AA006886E3}"},
                Path: {type:"REG_SZ", data: "dpwsockx.dll"},
                DescriptionA: {type:"REG_SZ", data: "IPX Connection For DirectPlay"},
                DescriptionW: {type:"REG_SZ", data: "IPX Connection For DirectPlay"},
            },
            "HKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\DirectPlay\\Services\\{5146ab8cb6b1ce11920c00aa006c4972}": {
                Description:{type:"REG_SZ", data:"WinSock IPX Connection For DirectPlay"},
                Path: {type: "REG_BINARY", data:[0x64,0x00,0x70,0x00,0x77,0x00,0x73,0x00,0x6f,0x00,0x63,0x00,0x6b,0x00,0x78,0x00,0x2e,0x00,0x64,0x00,0x6c,0x00,0x6c,0x00,0x00,0x00]}
            },
            "HKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\DirectPlay\\Services\\{5146ab8cb6b1ce11920c00aa006c4972}\\Players": {},
            "HKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\DirectPlay\\Services\\{5146ab8cb6b1ce11920c00aa006c4972}\\Sessions": {}
        }, {deleteUnspecifiedValues: false, forceCmdMode:"import"})

        
        // regCmdImport({fileName:"directplay-win64.reg"});

    } catch (e) {
        console.error(e);
    }
}

main()