import { AddParameters } from "./utils";

type StopperCallbackFn = (isTimeout?: boolean) => void
type PromiseCallBackType<T> = ConstructorParameters<typeof Promise<T>>[0];
type SetStopperFunction = (stop: StopperCallbackFn) => void;
type WithSetStoppable<T> = AddParameters<PromiseCallBackType<T>, [SetStopperFunction]>;
type TypeOrPromiseLikeType<T> = T | PromiseLike<T>;

export type PromiseStoppableTimeoutOpts = { timeout?: number, error?: Error }
export type PromiseStoppableTimeout = number | undefined | PromiseStoppableTimeoutOpts

export interface PromiseStoppable<T> extends Promise<T> {
    stop: () => void,
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseStoppable<TResult1 | TResult2>
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): PromiseStoppable<T | TResult>;
}

export const PromiseStoppableFactory = {
    create: function (timeoutCfg?: PromiseStoppableTimeout) {
        const timeoutOptsDefault = typeof timeoutCfg === 'number' ? { timeout:timeoutCfg } : timeoutCfg;

        const newPWrapped: typeof newStoppable = (fn, timeout?) => {
            const timeoutOpts = typeof timeout === 'number' ? { timeout } : timeout;
            const useOpts = Object.assign({}, timeoutOptsDefault, timeoutOpts);
            return newStoppable(fn, useOpts);
        }

        const newFnWrapped: typeof newStoppableFn = (fn, timeout?) => {
            const timeoutOpts = typeof timeout === 'number' ? { timeout } : timeout;
            const useOpts = Object.assign({}, timeoutOptsDefault, timeoutOpts);
            return newStoppableFn(fn, useOpts);
        }

        return {
            newPromise: newPWrapped,
            newFn: newFnWrapped,
            all: allStoppable,
            allSettled: allSettledStoppable,
            race: raceStoppable,
        }
    }
}

export function allStoppable<T extends readonly unknown[] | []>(values: T): PromiseStoppable<{ -readonly [P in keyof T]: Awaited<T[P]>; }> {
    return newStoppable((res, rej, setStopper) => {
        setStopper(() => {
            values.forEach(p => (p as PromiseStoppable<any>)?.stop());
        })
        Promise.all(values).then(res).catch(rej);
    });
}

export function allSettledStoppable<T extends readonly unknown[] | []>(values: T): PromiseStoppable<{ -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>; }> {
    return newStoppable((res, rej, setStopper) => {
        setStopper(() => {
            values.forEach(p => (p as PromiseStoppable<any>)?.stop());
        })
        Promise.allSettled(values).then(res).catch(rej);
    });
}

export function raceStoppable<T extends readonly unknown[] | []>(values: T): PromiseStoppable<Awaited<T[number]>> {
    return newStoppable((res, rej, setStopper) => {
        setStopper(() => {
            values.forEach(p => (p as PromiseStoppable<any>)?.stop());
        })
        Promise.race(values).then(res).catch(rej);
    });
}

export function newStoppable<T>(fn: WithSetStoppable<T>, timeout?: PromiseStoppableTimeout): PromiseStoppable<T> {

    let stopper: StopperCallbackFn = () => { }

    let origResolve: (r: TypeOrPromiseLikeType<T>) => void, origReject: (e: any) => any;
    const p: PromiseStoppable<T> = new Promise<T>((r, j) => {
        origResolve = r; origReject = j;
    }) as PromiseStoppable<T>;
    p.stop = () => {
        stopper?.();
    }

    let timer: NodeJS.Timeout | null = null;
    const timeoutOpts = typeof timeout === 'number' ? { timeout } : timeout;
    const timeoutMS = timeoutOpts?.timeout;
    if (timeoutMS != null) {
        timer = setTimeout(() => {
            const errObj = (()=>{
                if(timeoutOpts?.error) {
                    try {
                        return structuredClone(timeoutOpts.error);
                    } catch (e) {}
                }
                return new PromiseStoppableTimeoutError('PromiseStoppable timed out');
            })();
            wrappedReject(errObj);
            stopper?.(true);
        }, timeoutMS);
    }

    let finished = false;
    function wrappedResolve(r: TypeOrPromiseLikeType<T>) {
        if (finished) return;
        finished = true;
        clearTimeout(timer!);
        origResolve?.(r);
    }

    const wrappedReject = (e: any) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer!);
        origReject?.(e);
    }

    function patchStopAvailabilityThroughChain<T>(fromPromise: Promise<T>, isRoot = false): void {
        if (!(fromPromise instanceof Promise)) return;

        if (!isRoot) {
            const origStop = ((fromPromise as any) as any as PromiseStoppable<any>)?.stop;
            ((fromPromise as any) as PromiseStoppable<any>).stop = () => {
                p?.stop?.()
                if (origStop != p.stop) origStop?.()
            };
        }

        ['then', 'catch', 'finally'].forEach(fnName => {
            const orig = (fromPromise as any)[fnName];
            (fromPromise as any)[fnName] = function (...args: any[]) {
                const res = (orig as (...any: any[]) => any).apply(this, args);
                patchStopAvailabilityThroughChain(res);
                return res;
            }
            return fromPromise
        });
    }

    patchStopAvailabilityThroughChain(p, true)

    fn(wrappedResolve, wrappedReject, k => stopper = k);

    return p;
}

export function newStoppableFn<T>(fn: (setStopper: SetStopperFunction) => T | Promise<T>, timeout?: PromiseStoppableTimeout): PromiseStoppable<T> {
    return newStoppable(async (resolve, reject, setStopper) => {
        try {
            const res = await fn(setStopper);
            resolve(res);
        } catch (e) {
            reject(e);
        }
    }, timeout);
}

export class PromiseStoppableTimeoutError extends Error { constructor(message: string) { super(message); this.name = 'PromiseStoppableTimeoutError'; } }