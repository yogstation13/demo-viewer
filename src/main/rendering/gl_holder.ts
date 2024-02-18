import { DemoPlayerUi } from "../ui";
import { not_null } from "../../misc/gl_util";
import { CopyShader, get_copy_shader, get_icon_shader, IconShader, ShaderHolder } from "./shader";
import { RenderingCmd } from "../../player/rendering/commands";
import { ViewportElement } from "../viewport";
import { render_maptext } from "./maptext";
import { BlendMode } from "../../misc/constants";

export class DemoPlayerGlHolder {
	gl : WebGLRenderingContext;
	gl2 : WebGL2RenderingContext|undefined;
	instance_arrays : ANGLE_instanced_arrays;
	vao : OES_vertex_array_object|undefined;

	square_buffer : WebGLBuffer;

	max_texture_size : number;
	copy_framebuffer : WebGLFramebuffer;
	white_texture : WebGLTexture;
	canvas_copy : WebGLTexture;

	shader : IconShader;
	shader_matrix : IconShader;
	shader_copy : CopyShader;

	constructor(public ui : DemoPlayerUi) {
		let canvas = document.createElement("canvas");
		this.gl2 = canvas.getContext("webgl2", {desynchronized: true, powerPreference: "high-performance"}) ?? undefined;
		if(this.gl2) {
			this.gl = this.gl2;
		} else {
			let gl = canvas.getContext("webgl", {desynchronized: true, alpha: false});
			if(!gl) throw new Error("Could not initialize WebGL");
			this.gl = gl;
		}
		const gl = this.gl;
		const gl2 = this.gl2;
		if(gl2) {
			this.instance_arrays = {
				VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: gl2.VERTEX_ATTRIB_ARRAY_DIVISOR,
				drawArraysInstancedANGLE: gl2.drawArraysInstanced.bind(gl2),
				drawElementsInstancedANGLE: gl2.drawElementsInstanced.bind(gl2),
				vertexAttribDivisorANGLE: gl2.vertexAttribDivisor.bind(gl2)
			};
		} else {
			let ia = gl.getExtension("ANGLE_instanced_arrays");
			if(!ia) throw new Error("ANGLE_instanced_arrays is not supported");
			this.instance_arrays = ia;
		}
		this.vao = gl.getExtension("OES_vertex_array_object") ?? undefined;

		this.white_texture = not_null(gl.createTexture());
		gl.bindTexture(gl.TEXTURE_2D, this.white_texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
		gl.bindTexture(gl.TEXTURE_2D, null);
		this.copy_framebuffer = not_null(gl.createFramebuffer());
		this.max_texture_size = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 32768);

		this.canvas_copy = not_null(gl.createTexture());
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas_copy);

		this.square_buffer = not_null(gl.createBuffer());
		gl.bindBuffer(gl.ARRAY_BUFFER, this.square_buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

		gl.enable(gl.BLEND);
		gl.enable(gl.SCISSOR_TEST);

		this.shader = get_icon_shader(gl, false);
		this.shader_matrix = get_icon_shader(gl, true);
		this.shader_copy = get_copy_shader(gl);

		this.viewport_canvas = {
			x:0,
			y:0,
			width:1,
			height:1,
			elem: document.createElement("canvas")
		};
		this.ui.viewport.add_viewport_element(this.viewport_canvas);
	}

	viewport_canvas : ViewportElement;

	atlas_textures : Array<{
		texture: WebGLTexture,
		static_copy_texture: WebGLTexture,
		static_copy_dirty: boolean,
		width: number,
		height: number
	}|undefined> = [];
	async process_frame_data(frame_data: RenderingCmd[], frame_time : number, canvas_list: HTMLCanvasElement[]) {
		const gl = this.gl;
		const ia = this.instance_arrays;
		let curr_viewport = {x:0,y:0,width:0,height:0};
		let curr_viewport_pixel = {x:0,y:0,width:0,height:0};
		let icon_width = this.ui.viewport.icon_width;
		let icon_height = this.ui.viewport.icon_height;
		let target_canvas_width = 0;
		let target_canvas_height = 0;
		for(let cmd of frame_data) {
			if(cmd.cmd != "viewport") continue;
			target_canvas_width = Math.max(target_canvas_width, Math.ceil(cmd.x+cmd.width));
			target_canvas_height = Math.max(target_canvas_height, Math.ceil(cmd.y+cmd.height));
		}
		if(gl.canvas.width < target_canvas_width) gl.canvas.width = Math.ceil(target_canvas_width);
		if(gl.canvas.height < target_canvas_height) gl.canvas.height = Math.ceil(target_canvas_height);

		let flushables : ((bmp:ImageBitmap|HTMLCanvasElement) => Promise<void>)[] = [];

		for(let cmd of frame_data) {
			/*gl.flush();
			if(performance.now() > frame_time + 10) {
				frame_time = await new Promise(requestAnimationFrame);
			}*/
			if(cmd.cmd == "viewport") {
				gl.viewport(cmd.x, cmd.y, cmd.width, cmd.height);
				gl.scissor(cmd.x, cmd.y, cmd.width, cmd.height);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				curr_viewport_pixel = {x: cmd.x, y: cmd.y, width: cmd.width, height: cmd.height};
				curr_viewport = cmd.world_location;
			} else if(cmd.cmd == "resizeatlas") {
				let tex = this.atlas_textures[cmd.index];
				if(tex) {
					gl.deleteTexture(tex.static_copy_texture);
					let new_tex = this.create_blank_texture(cmd.width, cmd.height);
					gl.bindFramebuffer(gl.FRAMEBUFFER, this.copy_framebuffer);
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.texture, 0);
					gl.bindTexture(gl.TEXTURE_2D, new_tex);
					gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, tex.width, tex.height);
					gl.bindTexture(gl.TEXTURE_2D, null);
					gl.bindFramebuffer(gl.FRAMEBUFFER, null);
					gl.deleteTexture(tex.texture);
					tex.texture = new_tex;
					tex.static_copy_texture = this.create_blank_texture(cmd.width, cmd.height);
					tex.width = cmd.width;
					tex.height = cmd.height;
				} else {
					this.atlas_textures[cmd.index] = {
						texture: this.create_blank_texture(cmd.width, cmd.height),
						static_copy_texture: this.create_blank_texture(cmd.width,cmd.height),
						width: cmd.width,
						height: cmd.height,
						static_copy_dirty: false
					};
				}
			} else if(cmd.cmd == "atlastexdata") {
				let tex = not_null(this.atlas_textures[cmd.index]);
				gl.bindTexture(gl.TEXTURE_2D, tex.texture);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				for(let part of cmd.parts) {
					gl.texSubImage2D(gl.TEXTURE_2D, 0, part.x, part.y, part.width, part.height, gl.RGBA, gl.UNSIGNED_BYTE, part.data);
					tex.static_copy_dirty = true;
				}
				gl.bindTexture(gl.TEXTURE_2D, null);
			} else if(cmd.cmd == "atlastexmaptext") {
				let parts = await Promise.all(cmd.parts.map(async thing => {
					return {
						...thing,
						data: await render_maptext(thing.maptext, thing.width, thing.height)
					}
				}));

				let tex = not_null(this.atlas_textures[cmd.index]);
				gl.bindTexture(gl.TEXTURE_2D, tex.texture);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				for(let part of parts) {
					try {
						gl.texSubImage2D(gl.TEXTURE_2D, 0, part.x, part.y, gl.RGBA, gl.UNSIGNED_BYTE, part.data);	
					} catch(e) {
						console.warn(part.maptext);
						console.error(e);
						gl.texSubImage2D(gl.TEXTURE_2D, 0, part.x, part.y, part.width, part.height, gl.RGBA, gl.UNSIGNED_BYTE, null);
					}
				}
				gl.bindTexture(gl.TEXTURE_2D, null);
			} else if(cmd.cmd == "atlastexcopywithin") {
				let tex = not_null(this.atlas_textures[cmd.index]);
				let shader = this.shader_copy;
				this.set_shader(shader);
				gl.disable(gl.BLEND);
				gl.disable(gl.SCISSOR_TEST);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, this.copy_framebuffer);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.texture, 0);
				gl.viewport(0, 0, tex.width, tex.height);
				gl.bindTexture(gl.TEXTURE_2D, tex.static_copy_texture);
				if(tex.static_copy_dirty) {
					gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, tex.width, tex.height);
					tex.static_copy_dirty = false;
				}
				
				let data = new Float32Array(6*cmd.parts.length);
				let buf_ptr = 0;
				for(let part of cmd.parts) {
					data[buf_ptr+0] = part.x1;
					data[buf_ptr+1] = part.y1;
					data[buf_ptr+2] = part.x2;
					data[buf_ptr+3] = part.y2;
					data[buf_ptr+4] = part.width;
					data[buf_ptr+5] = part.height;
					//gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, part.x2, part.y2, part.x1, part.y1, part.width, part.height);
					buf_ptr += 6;
				}
				
				gl.uniform1i(shader.u_texture, 0);
				gl.uniform2f(shader.u_texture_size, tex.width, tex.height);

				gl.bindBuffer(gl.ARRAY_BUFFER, this.square_buffer);
				gl.vertexAttribPointer(shader.a_position, 2, gl.FLOAT, false, 0, 0);
				let buf = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, buf);
				gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
				gl.vertexAttribPointer(shader.a_from, 2, gl.FLOAT, false, 24, 0);
				gl.vertexAttribPointer(shader.a_to, 2, gl.FLOAT, false, 24, 8);
				gl.vertexAttribPointer(shader.a_size, 2, gl.FLOAT, false, 24, 16);
				ia.vertexAttribDivisorANGLE(shader.a_position, 0);
				ia.vertexAttribDivisorANGLE(shader.a_from, 1);
				ia.vertexAttribDivisorANGLE(shader.a_to, 1);
				ia.vertexAttribDivisorANGLE(shader.a_size, 1);
				ia.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, cmd.parts.length);
				gl.deleteBuffer(buf);

				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.bindTexture(gl.TEXTURE_2D, null);

				gl.enable(gl.BLEND);
				gl.enable(gl.SCISSOR_TEST);
			} else if(cmd.cmd == "batchdraw") {
				let tex = not_null(this.atlas_textures[cmd.atlas_index]);
				this.set_blend_mode(cmd.blend_mode);
				let shader = cmd.use_color_matrix ? this.shader_matrix : this.shader;
				this.set_shader(shader);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, tex.texture);
				gl.uniform1i(shader.u_texture, 0);
				gl.uniform2f(shader.u_texture_size, tex.width, tex.height);
				gl.uniform2f(shader.u_viewport_size, curr_viewport.width*icon_width, curr_viewport.height*icon_height);
				gl.uniform2f(shader.u_viewport_center, (curr_viewport.x+curr_viewport.width/2)*icon_width, (curr_viewport.y+curr_viewport.height/2)*icon_height);
				gl.uniform1f(shader.u_zoom, 1);
				
				let stride = (cmd.use_color_matrix ? 31 : 15) * 4;
				gl.bindBuffer(gl.ARRAY_BUFFER, this.square_buffer);
				gl.vertexAttribPointer(shader.a_position, 2, gl.FLOAT, false, 0, 0);
				let buf = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, buf);
				gl.bufferData(gl.ARRAY_BUFFER, cmd.data, gl.STREAM_DRAW);
				gl.vertexAttribPointer(shader.a_transform_x, 3, gl.FLOAT, false, stride, 0);
				gl.vertexAttribPointer(shader.a_transform_y, 3, gl.FLOAT, false, stride, 12);
				gl.vertexAttribPointer(shader.a_uv, 4, gl.FLOAT, false, stride, 24);
				gl.vertexAttribPointer(shader.a_layer, 1, gl.FLOAT, false, stride, 40);
				for(let i = 0; i < shader.a_color.length; i++)
					gl.vertexAttribPointer(shader.a_color[i], 4, gl.FLOAT, false, stride, 44 + i*16);
				ia.vertexAttribDivisorANGLE(shader.a_position, 0);
				for(let i = 0; i < shader.a_color.length; i++)
					ia.vertexAttribDivisorANGLE(shader.a_color[i], 1);
				ia.vertexAttribDivisorANGLE(shader.a_uv, 1);
				ia.vertexAttribDivisorANGLE(shader.a_transform_x, 1);
				ia.vertexAttribDivisorANGLE(shader.a_transform_y, 1);
				ia.vertexAttribDivisorANGLE(shader.a_layer, 1);
				ia.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, cmd.num_elements);
				gl.deleteBuffer(buf);
				// gl.activeTexture(gl.TEXTURE0 + 1);
				// gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.canvas);
			} else if(cmd.cmd == "copytoviewport") {
				let this_viewport_pixel = curr_viewport_pixel;
				let this_viewport = curr_viewport;
				let this_follow = cmd.follow_data;
				let this_followview = cmd.followview_window;
				flushables.push(async (canvas_bitmap : ImageBitmap|HTMLCanvasElement) => {
					let bitmap = await createImageBitmap(canvas_bitmap, this_viewport_pixel.x, gl.canvas.height-this_viewport_pixel.height-this_viewport_pixel.y, this_viewport_pixel.width, this_viewport_pixel.height);
					let canvas = this.viewport_canvas.elem as HTMLCanvasElement;
					let ctx = not_null(canvas.getContext('2d'));
					if(canvas.width != this_viewport_pixel.width) canvas.width = this_viewport_pixel.width;
					if(canvas.height != this_viewport_pixel.height) canvas.height = this_viewport_pixel.height;
					ctx.globalCompositeOperation = "copy";

					ctx.drawImage(bitmap, 0, 0);
					Object.assign(this.viewport_canvas, this_viewport);
					if(this_followview) {
						Object.assign(this.ui.viewport.followview, this_followview);
						this.ui.viewport.followview.elem.style.display = "block";
					} else {
						this.ui.viewport.followview.elem.style.display = "none";
					}
					let old_follow = this.ui.viewport.current_follow
					if(this_follow && old_follow && this_follow.ref == old_follow.ref) {
						if(this_follow.x != null) {
							if(old_follow.x != null) {
								this.ui.viewport.x += this_follow.x - old_follow.x;
							} else {
								this.ui.viewport.x = this_follow.x;
							}
						}
						if(this_follow.y != null) {
							if(old_follow.y != null) {
								this.ui.viewport.y += this_follow.y - old_follow.y;
							} else {
								this.ui.viewport.y = this_follow.y;
							}
						}
						this.ui.viewport.current_follow = this_follow;
					}
					this.ui.viewport.update_viewport();
				});
			} else if(cmd.cmd == "copytocanvas") {
				let this_viewport_pixel = curr_viewport_pixel;
				let canvas_index = cmd.canvas_index;
				flushables.push(async (canvas_bitmap : ImageBitmap|HTMLCanvasElement) => {
					let bitmap = await createImageBitmap(canvas_bitmap, this_viewport_pixel.x, gl.canvas.height-this_viewport_pixel.height-this_viewport_pixel.y, this_viewport_pixel.width, this_viewport_pixel.height);
					let canvas = canvas_list[canvas_index];
					let ctx = not_null(canvas.getContext('2d'));
					if(canvas.width != this_viewport_pixel.width) canvas.width = this_viewport_pixel.width;
					if(canvas.height != this_viewport_pixel.height) canvas.height = this_viewport_pixel.height;
					ctx.globalCompositeOperation = "copy";

					ctx.drawImage(bitmap, 0, 0);
				});
			} else if(cmd.cmd == "flush") {
				if(flushables.length) {
					let canvas_bitmap = flushables.length == 1 ? gl.canvas : await createImageBitmap(gl.canvas);
					await Promise.all(flushables.map(f => f(canvas_bitmap)));
				}
				flushables.length = 0;
			}
		}
	}
	create_blank_texture(width : number, height : number) {
		const gl = this.gl;
		const gl2 = this.gl2;
		const tex = not_null(gl.createTexture());
		gl.bindTexture(gl.TEXTURE_2D, tex);
		if(gl2) gl2.texStorage2D(gl.TEXTURE_2D, 1, (gl as unknown as {RGBA8:number}).RGBA8, width, height);
		else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return tex;
	}

	curr_blend_mode : number = -1; 
	// this one was fun - I made test cases in BYOND and took screenshots and tried to reverse-engineer the blending equations from that.
	// fun fact BYOND uses premultiplied alpha. However, when you 
	set_blend_mode(blend_mode : number) : void{
		//if(blend_mode == 0) blend_mode = 1;
		if(blend_mode == this.curr_blend_mode) return;
		this.curr_blend_mode = blend_mode;
		const gl = this.gl;
		switch(blend_mode){
			case BlendMode.DEFAULT: {
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
			}
			case BlendMode.ADD: {
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
			}
			case BlendMode.SUBTRACT: {
				gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
				gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
				break;
			}
			case BlendMode.MULTIPLY: {
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); // fun fact if you do the math everything cancels out so that the destination alpha doesn't change at all.
				break;
			}
			case BlendMode.INSET_OVERLAY: {
				// TODO figure out if this is actually right
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE)
				break;
			}
			case BlendMode.ALPHA: {
				gl.blendEquation(gl.FUNC_ADD);
				//gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.DST_ALPHA, gl.ZERO)
				gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
				break;
			}
			case BlendMode.ALPHA_INVERTED: {
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE)
				break;
			}
			//Just in case there's a weird value we'll use the default
			default: {
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
			}
		}
	}

	curr_shader : ShaderHolder|undefined;
	attrib_arrays_enabled : boolean[] = [];
	set_shader(shader : ShaderHolder) : void {
		if(shader == this.curr_shader) return;
		this.curr_shader = shader;
		const gl = this.gl;
		gl.useProgram(shader.shader);
		
		
		if(this.vao) {
			this.vao.bindVertexArrayOES(shader.vao);
		} else if(this.gl2) {
			this.gl2.bindVertexArray(shader.vao);
		} else {
			this.update_vertex_attrib_arrays(...shader.all_attrib_arrays);
		}
	}

	update_vertex_attrib_arrays(...arrays : number[]) : void {
		const gl = this.gl;
		let desired_attrib_arrays : boolean[] = [];
		for(let item of arrays) desired_attrib_arrays[item] = true;

		let total = Math.max(this.attrib_arrays_enabled.length, desired_attrib_arrays.length);
		for(let i = 0; i < total; i++) {
			if(desired_attrib_arrays[i] && !this.attrib_arrays_enabled[i]) {
				gl.enableVertexAttribArray(i);
			}
			if(!desired_attrib_arrays[i] && this.attrib_arrays_enabled[i]) {
				gl.disableVertexAttribArray(i);
				desired_attrib_arrays[i] = true;
			}
		}
		this.attrib_arrays_enabled = desired_attrib_arrays;
	}

	dump_textures() {
		const gl = this.gl;
		let urls = this.atlas_textures.map(tex => {
			if(!tex) return null;
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.copy_framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.texture, 0);
			//let buf = new Uint8Array(tex.width*tex.height*4);
			let image_data = new ImageData(tex.width, tex.height);
			gl.readPixels(0, 0, tex.width, tex.height, gl.RGBA, gl.UNSIGNED_BYTE, image_data.data);
			let canvas = document.createElement("canvas");
			canvas.width = tex.width;
			canvas.height = tex.height;
			let ctx = canvas.getContext('2d');
			if(ctx) {
				ctx.putImageData(image_data, 0, 0);
				return canvas.toDataURL();
			}
		});
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		let checker_url = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABhWlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw1AUhU9TxSoVBzsUcchQXbQgKuIoVSyChdJWaNXB5KV/0KQhSXFxFFwLDv4sVh1cnHV1cBUEwR8QRycnRRcp8b6k0CLGC4/3cd49h/fuA4RGhalm1wSgapaRisfEbG5V7HlFL8LwIYAxiZl6Ir2YgWd93VMn1V2UZ3n3/Vn9St5kgE8knmO6YRFvEM9sWjrnfeIQK0kK8TnxuEEXJH7kuuzyG+eiwwLPDBmZ1DxxiFgsdrDcwaxkqMTTxBFF1ShfyLqscN7irFZqrHVP/sJgXltJc53WMOJYQgJJiJBRQxkVWIjSrpFiIkXnMQ//kONPkksmVxmMHAuoQoXk+MH/4PdszcLUpJsUjAHdL7b9MQL07ALNum1/H9t28wTwPwNXWttfbQCzn6TX21rkCBjYBi6u25q8B1zuAOEnXTIkR/LTEgoF4P2MvikHDN4CfWvu3FrnOH0AMjSr5Rvg4BAYLVL2use7A51z+7enNb8fY6tyobZR7ZUAAAAGYktHRACZAJkAmV5EVoEAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQfmChAVFQLVNvuiAAAAGXRFWHRDb21tZW50AENyZWF0ZWQgd2l0aCBHSU1QV4EOFwAAACtJREFUOMtjnDlz5n8GPODs2bP4pBmYGCgEowYMBgNYCMWzsbHxaCAOfwMAB2UIU5u61XQAAAAASUVORK5CYII=`;

		let newwindow = window.open(undefined, "_blank");
		if(newwindow) {
			newwindow.document.head.innerHTML = `<style>img {background-image: url("${checker_url}");}</style>`;
			newwindow.document.body.innerHTML = urls.map(url => `<img src="${url}" style="transform: scaleY(-1);">`).join();
		}
	}
}
