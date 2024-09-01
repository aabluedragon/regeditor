
export class PromiseKillable<T> extends Promise<T> {
    kill() {
        this.#killer?.();
    }

    #killer = () => { }

    // Yeah I know, lots of typescript relaxations.
    static create<T>(fn: (res: (res: T) => any, rej: (rej: any) => any, setKiller: (fn: (...any) => any) => any) => any): PromiseKillable<T> {
        let patchedRes: any, patchedRej: any;
        const p = new PromiseKillable((r, j) => {
            patchedRes = r; patchedRej = j;
        })
        fn(patchedRes, patchedRej, (k) => p.#killer = k)
        return p as any;
    }
}