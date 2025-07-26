/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
export default function ensurePromiseReturn<T extends (...args: Array<any>) => any>(func: T, thisArg: ThisParameterType<T>, ...args: Parameters<T>): Promise<ReturnType<T> extends Promise<any> ? Awaited<ReturnType<T>> : ReturnType<T>> {
    try {
        const r: unknown = func.call(thisArg, ...args);
        return (r instanceof Promise ? r : Promise.resolve(r)) as any;
    } catch (err) {
        return Promise.reject(err);
    }
}
