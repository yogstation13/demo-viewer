export function not_null<T>(val : T|null|undefined) : T {
	if(val == null) throw new Error("Unexpected null value");
	return val;
}

export async function read_pixels_async(gl : WebGLRenderingContext, x:number, y:number, w:number, h:number, format:number, type:number, output : ArrayBufferView) {
	if(!(gl instanceof WebGL2RenderingContext)) {
		gl.readPixels(x,y,w,h,format,type,output);
		return;
	}

	const buf = not_null(gl.createBuffer());
	gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
	gl.bufferData(gl.PIXEL_PACK_BUFFER, output.byteLength, gl.STREAM_READ);
	gl.readPixels(x,y,w,h,format,type,0);
	gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

	const sync = not_null(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));

	gl.flush();

	while(true) {
		let res = gl.clientWaitSync(sync, 0, 0);
		if(res == gl.WAIT_FAILED) {
			throw new Error("readPixels failed");
		} else if(res == gl.TIMEOUT_EXPIRED) {
			await new Promise(resolve => setTimeout(resolve, 100));
		} else {
			break;
		}
	}

	gl.deleteSync(sync);
	
}