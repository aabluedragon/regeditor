import { AddParameters } from "utils";

type PromiseCallBackType = ConstructorParameters<typeof Promise>[0];
type WithSetStoppable = AddParameters<PromiseCallBackType, [(stop: () => void) => void]>;

export class PromiseStoppable<T> extends Promise<T> {
    stop() {this.#stopper?.();}

    #stopper = () => { }

    static createStoppable<T>(fn: WithSetStoppable): PromiseStoppable<T> {
        let patchedRes: (r: T) => void, patchedRej: (e: any) => any;
        const p = new PromiseStoppable<T>((r, j) => {
            patchedRes = r; patchedRej = j;
        })
        fn(patchedRes, patchedRej, k => p.#stopper = k)
        return p;
    }

    static allStoppable<HANDLE_RESULT_TYPE, RES>(promises: PromiseStoppable<RES>[], handleResult: (results: RES[]) => Promise<HANDLE_RESULT_TYPE>): PromiseStoppable<HANDLE_RESULT_TYPE> {
        return PromiseStoppable.createStoppable(async (res, rej, setStopper) => {
            setStopper(() => {
                promises.forEach(p => p.stop());
            })
            try {
                const results = await Promise.all(promises);
                res(await handleResult(results));
            } catch (e) {
                rej(e);
            }
        })
    }
}