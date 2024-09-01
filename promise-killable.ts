
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

    static allKillable<HANDLE_RESULT_TYPE, T>(promises: PromiseKillable<T>[], handleResult: (results: T[]) => Promise<HANDLE_RESULT_TYPE>): PromiseKillable<HANDLE_RESULT_TYPE> {
        return PromiseKillable.create(async (res, rej, setKiller) => {
            setKiller(() => {
                promises.forEach(p => p.kill());
            })
            try {
                const results = await Promise.all(promises);
                res(await handleResult(results) as any);
            } catch (e) {
                rej(e);
            }
        })
    }
}