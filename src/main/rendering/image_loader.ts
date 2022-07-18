import * as Comlink from 'comlink';
import { not_null, read_pixels_async } from '../../misc/gl_util';

const canvas = document.createElement("canvas");
const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
const canvas2 = document.createElement("canvas");

const max_texture_size = gl?.getParameter(gl.MAX_TEXTURE_SIZE);

export async function load_image(blob : Blob) : Promise<Uint8Array> {
	if(!gl) throw new Error("Could not load image - webgl not available");
	if(!(blob.type.startsWith("image/"))) blob = new Blob([blob], {type: "image/png"});

	let image = await createImageBitmap(blob, {premultiplyAlpha: 'none'});

	let image_width = image.width;
	let image_height = image.height;
	if(image_width > max_texture_size || image_height > max_texture_size) {
		console.warn(`Image of size ${image_width}x${image_height} exceeds maximum WebGL texture size of ${max_texture_size} - falling back to canvas2d for loading. Colors in transparent parts will be mangled.`);
		const ctx = not_null(canvas2.getContext('2d'));
		canvas2.width = image_width;
		canvas2.height = image_height;
		ctx.drawImage(image, 0, 0);
		let imagedata = ctx.getImageData(0, 0, image_width, image_height);
		return Comlink.transfer(new Uint8Array(imagedata.data.buffer), [imagedata.data.buffer]);
	}
	
	let framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	let temp_texture = gl.createTexture();
	let full_data = new Uint8Array(image_width*image_height*4);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, temp_texture);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, temp_texture, 0);
	//await read_pixels_async(gl, 0, 0, image_width, image_height, gl.RGBA, gl.UNSIGNED_BYTE, full_data);
	gl.readPixels(0, 0, image_width, image_height, gl.RGBA, gl.UNSIGNED_BYTE, full_data);
	gl.deleteTexture(temp_texture);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.deleteFramebuffer(framebuffer);

	return Comlink.transfer(full_data, [full_data.buffer]);
}