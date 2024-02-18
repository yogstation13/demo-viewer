import { Appearance } from "../../misc/appearance";
import { AppearanceAttributeIndex, BlendMode, MAX_LAYER, Planes } from "../../misc/constants";
import { Matrix, matrix_multiply, matrix_translate } from "../../misc/matrix";
import { DmiAtlas } from "./atlas";
import { RenderingCmd } from "./commands";
import { IconStateDir } from "./icon";

type AppearanceLike = {
	icon_state_dir?: IconStateDir,
	transform? : Matrix,
	pixel_x? : number,
	pixel_y? : number,
	pixel_z? : number,
	pixel_w? : number,
	color_alpha? : number,
	color_matrix? : Float32Array|null,
	layer : number
};

export class DrawBuffer {
	uses_color_matrices : boolean = false;
	blend_mode : number = BlendMode.DEFAULT;
	atlas : DmiAtlas|undefined;
	plane : number = Planes.GAME_PLANE;

	float_attribs : Float32Array = new Float32Array(1024 * this.get_stride());

	write_appearance(index : number, appearance : AppearanceLike, step_x : number = 0, step_y : number = 0, node = appearance.icon_state_dir?.atlas_node) {
		let stride = this.get_stride();
		
		let off = index * stride;
		let fa = this.float_attribs;
		//https://www.byond.com/docs/ref/#/matrix
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_A] = 1;
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_B] = 0;
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_C] = 0;
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_D] = 0;
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_E] = 1;
		fa[off+AppearanceAttributeIndex.TRANSFORMATION_MATRIX_3x3_F] = 0;
		let matrix_view = fa.subarray(off,off+AppearanceAttributeIndex.ICON_BOUND_X_1);
		let icon_width = node?.width ?? 32;
		let icon_height = node?.height ?? 32;
		matrix_translate(matrix_view, -icon_width/2, -icon_height/2);
		if(appearance.transform) matrix_multiply(matrix_view, appearance.transform);
		matrix_translate(matrix_view, icon_width/2, icon_height/2);
		matrix_translate(matrix_view, step_x + (appearance?.pixel_x??0) + (appearance?.pixel_w??0), step_y + (appearance?.pixel_y??0) + (appearance?.pixel_z??0));
		if(node) {
			fa[off+AppearanceAttributeIndex.ICON_BOUND_X_1] = node.x;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_Y_1] = node.y;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_X_2] = node.x+node.width;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_Y_2] = node.y+node.height;
		} else {
			fa[off+AppearanceAttributeIndex.ICON_BOUND_X_1] = 0;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_Y_1] = 0;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_X_2] = 32;
			fa[off+AppearanceAttributeIndex.ICON_BOUND_Y_2] = 32;
		}
		fa[off+AppearanceAttributeIndex.ICON_LAYER] = 1-Math.max(Math.min(appearance.layer / MAX_LAYER, 1), 0);
		let color_alpha = appearance.color_alpha ?? -1;
		if(this.uses_color_matrices) {
			if(appearance.color_matrix) {
				fa.set(appearance.color_matrix, off+AppearanceAttributeIndex.COLOR_MATRIX_RED);
			} else {
				//https://www.byond.com/docs/ref/#/{notes}/color-matrix
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_RED				] = (color_alpha & 0xFF) / 0xFF;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_RED_GREEN		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_RED_BLUE			] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_RED_ALPHA		] = 0;

				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_GREEN_RED		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_GREEN			] = ((color_alpha >> 8) & 0xFF) / 0xFF;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_GREEN_BLUE		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_GREEN_ALPHA		] = 0;
 
 				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_BLUE_RED			] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_BLUE_GREEN		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_BLUE				] = ((color_alpha >> 16) & 0xFF) / 0xFF;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_BLUE_ALPHA		] = 0;
 
 				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_ALPHA_RED		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_ALPHA_GREEN		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_ALPHA_BLUE		] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_ALPHA_ALPHA		] = ((color_alpha >> 24) & 0xFF) / 0xFF;
 
 				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_COMPONENT_RED	] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_COMPONENT_GREEN	] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_COMPONENT_BLUE	] = 0;
				fa[off + AppearanceAttributeIndex.COLOR_MATRIX_COMPONENT_ALPHA	] = 0;
			}
		} else {
			fa[off+AppearanceAttributeIndex.COLOR_RGBA_RED	] = (color_alpha & 0xFF) / 0xFF;
			fa[off+AppearanceAttributeIndex.COLOR_RGBA_GREEN] = ((color_alpha >> 8) & 0xFF) / 0xFF;
			fa[off+AppearanceAttributeIndex.COLOR_RGBA_BLUE	] = ((color_alpha >> 16) & 0xFF) / 0xFF;
			fa[off+AppearanceAttributeIndex.COLOR_RGBA_ALPHA] = ((color_alpha >> 24) & 0xFF) / 0xFF;
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
		//console.log("draw buffer", this)
		out.push({
			cmd: "batchdraw",
			atlas_index: this.atlas?.tex_index ?? 0,
			blend_mode: this.blend_mode,
			plane: this.plane,
			use_color_matrix: this.uses_color_matrices,
			data: slice,
			transferables: [slice.buffer],
			num_elements: end-start
		});
	}
}