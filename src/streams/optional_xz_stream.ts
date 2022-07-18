import { XzReadableStream } from "./xzwasm";

export class OptionalXzReadableStream extends ReadableStream {
	constructor(stream : ReadableStream) {
		let first_chunk_taken = false;
		let teed_stream : ReadableStream;
		[stream, teed_stream] = stream.tee();
		let reader = stream.getReader();
		super({
			pull: async (controller) => {
				let chunk = await reader.read();
				if(chunk.done) {
					controller.close();
					return;
				}
				if(!first_chunk_taken) {
					first_chunk_taken = true;
					if(chunk.value[0] == 0xFD) {
						reader.cancel();
						reader = new XzReadableStream(teed_stream).getReader();
						chunk = await reader.read();
					} else {
						teed_stream.cancel();
					}
				}
				if(chunk.done) {
					controller.close();
				} else {
					controller.enqueue(chunk.value);
				}
			},
			cancel: async () => {
				teed_stream.cancel();
				stream.cancel();
				return await reader.cancel();
			}
		});
	}
}