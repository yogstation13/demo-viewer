import * as Comlink from 'comlink';

export async function remote_worker_spawn(url : string) {
	let worker = new Worker(url, {type: "module"});
	let proxy = Comlink.wrap(worker);
	let port = await proxy[Comlink.createEndpoint]();
	proxy[Comlink.releaseProxy]();
	return port;
}