import { Appearance } from "../../misc/appearance";
import { MAX_LAYER } from "../../misc/constants";
import { matrix_multiply, matrix_translate } from "../../misc/matrix";
import { DmiAtlas } from "./atlas";
import { RenderingCmd } from "./commands";

export class DrawBuffer {
	uses_color_matrices : boolean = false;
	blend_mode : number = 1;
	atlas : DmiAtlas|undefined;

	float_attribs : Float32Array = new Float32Array(1024 * this.get_stride());

	write_appearance(index : number, appearance : Appearance, step_x : number = 0, step_y : number = 0) {
		let stride = this.get_stride();
		let off = index * stride;
		let fa = this.float_attribs;
		fa[off] = 1;
		fa[off+1] = 0;
		fa[off+2] = 0;
		fa[off+3] = 0;
		fa[off+4] = 1;
		fa[off+5] = 0;
		let matrix_view = fa.subarray(off,off+6);
		let icon_width = appearance.icon_state_node?.width ?? 32;
		let icon_height = appearance.icon_state_node?.height ?? 32;
		matrix_translate(matrix_view, -icon_width/2, -icon_height/2);
		matrix_multiply(matrix_view, appearance.transform);
		matrix_translate(matrix_view, icon_width/2, icon_height/2);
		matrix_translate(matrix_view, step_x + appearance.pixel_x + appearance.pixel_w, step_y + appearance.pixel_y + appearance.pixel_z);
		if(appearance.icon_state_node) {
			let node = appearance.icon_state_node;
			fa[off+6] = node.x;
			fa[off+7] = node.y;
			fa[off+8] = node.x+node.width;
			fa[off+9] = node.y+node.height;
		} else {
			fa[off+6] = 0;
			fa[off+7] = 0;
			fa[off+8] = 32;
			fa[off+9] = 32;
		}
		fa[off+10] = 1-Math.max(Math.min(appearance.layer / MAX_LAYER, 1), 0);
		let color_alpha = appearance.color_alpha;
		if(this.uses_color_matrices) {
			fa[off+11] = (color_alpha & 0xFF) / 0xFF;
			fa[off+12] = 0;
			fa[off+13] = 0;
			fa[off+14] = 0;

			fa[off+15] = 0;
			fa[off+16] = ((color_alpha >> 8) & 0xFF) / 0xFF;
			fa[off+17] = 0;
			fa[off+18] = 0;

			fa[off+19] = 0;
			fa[off+20] = 0;
			fa[off+21] = ((color_alpha >> 16) & 0xFF) / 0xFF;
			fa[off+22] = 0;

			fa[off+23] = 0;
			fa[off+24] = 0;
			fa[off+25] = 0;
			fa[off+26] = ((color_alpha >> 24) & 0xFF) / 0xFF;

			fa[off+27] = 0;
			fa[off+28] = 0;
			fa[off+29] = 0;
			fa[off+30] = 0;
		} else {
			fa[off+11] = (color_alpha & 0xFF) / 0xFF;
			fa[off+12] = ((color_alpha >> 8) & 0xFF) / 0xFF;
			fa[off+13] = ((color_alpha >> 16) & 0xFF) / 0xFF;
			fa[off+14] = ((color_alpha >> 24) & 0xFF) / 0xFF;
		}
	}

	get_stride() {
		return this.uses_color_matrices ? 31 : 15;
	}
	get_size() {
		return Math.floor(this.float_attribs.length / this.get_stride());
	}
	expand() {
		let new_arr = new Float32Array(this.get_size() * 2 * this.get_stride());
		new_arr.set(this.float_attribs);
		this.float_attribs = new_arr;
	}

	add_draw(out: RenderingCmd[], start : number, end : number) {
		if(start >= end) return;
		let stride = this.get_stride();
		let slice = this.float_attribs.slice(start * stride, end * stride);
		out.push({
			cmd: "batchdraw",
			atlas_index: this.atlas?.tex_index ?? 0,
			blend_mode: this.blend_mode,
			data: slice,
			transferables: [slice.buffer],
			num_elements: end-start
		});
	}
}