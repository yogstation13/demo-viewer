let blank_fun = ()=>{}
export function create_exposed_promise<T>() : Promise<T> & {resolve: (val:T|PromiseLike<T>)=>void, reject: (reason:any)=>void} {
	let resolve : (val:T|PromiseLike<T>) => void = blank_fun;
	let reject : (reason:any) => void = blank_fun;
	let promise = new Promise<T>((res, rej) => {
		resolve = res; reject = rej;
	});
	resolve = resolve.bind(promise);
	reject = reject.bind(promise);
	return Object.assign(promise, {resolve, reject});
}