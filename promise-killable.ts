
export class PromiseStoppable<T> extends Promise<T> {
    stop() {
        this.#stopper?.();
    }

    #stopper = () => { }

    // Yeah I know, lots of typescript relaxations.
    static create<T>(fn: (res: (res: T) => any, rej: (rej: any) => any, setStopper: (fn: (...any) => any) => any) => any): PromiseStoppable<T> {
        let patchedRes: any, patchedRej: any;
        const p = new PromiseStoppable((r, j) => {
            patchedRes = r; patchedRej = j;
        })
        fn(patchedRes, patchedRej, (k) => p.#stopper = k)
        return p as any;
    }

    static allStoppable<HANDLE_RESULT_TYPE, RES>(promises: PromiseStoppable<RES>[], handleResult: (results: RES[]) => Promise<HANDLE_RESULT_TYPE>): PromiseStoppable<HANDLE_RESULT_TYPE> {
        return PromiseStoppable.create(async (res, rej, setStopper) => {
            setStopper(() => {
                promises.forEach(p => p.stop());
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