import { AddParameters } from "./utils";

type StopperCallbackFn = (isTimeout?:boolean) => void
type PromiseCallBackType<T> = ConstructorParameters<typeof Promise<T>>[0];
type WithSetStoppable<T> = AddParameters<PromiseCallBackType<T>, [(stop: StopperCallbackFn) => void]>;
type TypeOrPromiseLikeType<T> = T | PromiseLike<T>;

export class PromiseStoppable<T> extends Promise<T> {
    stop() { this.#stopper?.(false); }

    #stopper:StopperCallbackFn = () => { }

    static createStoppable<T>(fn: WithSetStoppable<T>, timeout?: number): PromiseStoppable<T> {
        let origResolve: (r: TypeOrPromiseLikeType<T>) => void, origReject: (e: any) => any;
        const p = new PromiseStoppable<T>((r, j) => {
            origResolve = r; origReject = j;
        })
        
        let timer: NodeJS.Timeout | null = null;
        if (timeout != null) {
            timer = setTimeout(() => {
                wrappedReject(new PromiseStoppableTimeoutError('PromiseStoppable timed out'));
                p.#stopper?.(true);
            }, timeout);
        }

        let finished = false;
        function wrappedResolve(r: TypeOrPromiseLikeType<T>) {
            if (finished) return;
            finished = true;
            clearTimeout(timer!);
            origResolve?.(r);
        }

        const wrappedReject = (e: any)=>{
            if (finished) return;
            finished = true;
            clearTimeout(timer!);
            origReject?.(e);
        }

        fn(wrappedResolve, wrappedReject, k => p.#stopper = k)

        return p;
    }

    static allStoppable<HANDLE_RESULT_TYPE, RES>(promises: PromiseStoppable<RES>[], handleResult: (results: RES[]) => Promise<HANDLE_RESULT_TYPE> | HANDLE_RESULT_TYPE): PromiseStoppable<HANDLE_RESULT_TYPE> {
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

export class PromiseStoppableTimeoutError extends Error { constructor(message: string) { super(message); this.name = 'PromiseStoppableTimeoutError'; } }