export class StreamQueue<R = any> {
	public readonly readable : ReadableStream<R>;

	constructor() {
		this.readable = new ReadableStream<R>({
			pull: async (controller) => {
				let acted = false;
				while(!acted) {
					while(!this._ended && !this._readers.length) {
						if(this._continue_cb) throw new Error("Multiple pulls!");
						await new Promise<void>(resolve => {this._continue_cb = resolve;});
					}
					if(this._readers.length) {
						let reader = this._readers[0];
						let chunk = await reader.read();
						if(chunk.done) {
							if(reader != this._readers[0]) throw new Error("Reader queue head got changed while reading");
							this._readers.shift();
						} else {
							controller.enqueue(chunk.value);
							acted = true;
						}
					} else if(this._ended) {
						controller.close();
						acted = true;
					}
				}
			},
			cancel: async () => {
				this._canceled = true;
				await Promise.all(this._readers.map(reader => reader.cancel()));
				this._readers.length = 0;
			}
		});
	}

	private _ended = false;
	private _canceled = false;
	private _readers : ReadableStreamDefaultReader<R>[] = [];
	private _continue_cb : undefined | (() => void) = undefined;

	private _continue() {
		if(this._continue_cb) {
			let cb = this._continue_cb;
			this._continue_cb = undefined;
			cb();
		}
	}

	end() {
		this._ended = true;
		this._continue();
	}

	add(stream : ReadableStream<R>) {
		if(this._ended) throw new Error("Cannot add stream: stream queue has been closed");
		if(this._canceled) return;
		this._readers.push(stream.getReader());
		this._continue();
	}
}
