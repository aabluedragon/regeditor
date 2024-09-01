import { del } from "./lib/commands/delete";
import { query } from "./lib/commands/query";

function write() {
    // TODO
}

function ensure() {
    // TODO
}

function batch() {
    // TODO
}

async function main() {
    try {
        // const p = query(
        //     {

        //         keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay',
        //         // f: '*',
        //         // keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node',
        //         // s: true,
        //         // keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Lenovo\\MachineInfo',
        //         timeout: 1000 * 60 * 60 * 2,
        //         // reg64: true,
        //         // d: true,
        //     },
        //     {keyPath:'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay', s:true},
        // )
        // p.stop()
        // const res = await p;
        // console.log(JSON.stringify(res, null, 4));

        const p = del({
            keyPath:"HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay",
            v:"name",
        })
        // p.stop();
        const res = await p;
        console.log(res)

    } catch (e) {
        console.error(e);
    }
}

main()