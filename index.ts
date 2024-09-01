import { query } from "./lib/query";

function write() {
    // TODO
}

function remove() {
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
        const p = query(
            {

                keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\DirectPlay\\Service Providers\\IPX Connection For DirectPlay',
                f: '*',
                // keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node',
                // keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Lenovo\\MachineInfo',
                timeout: 1000 * 60 * 60 * 2,
                reg64: true,
                s: true
            }
        )
        // p.stop()
        console.log(JSON.stringify(await p, null, 4));
    } catch (e) {
        console.error(e);
    }
}

main()