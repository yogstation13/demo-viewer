import { IconStateDir } from "../player/rendering/icon";
import { RESET_ALPHA, RESET_COLOR, RESET_TRANSFORM } from "./constants";
import { Matrix, matrix_invert, matrix_is_identity, matrix_multiply } from "./matrix";

export interface BaseAppearance<T> {
	icon : number|null;
	icon_state : string|null;
	name : string|null;
	appearance_flags : number;
	layer : number;
	plane : number;
	dir : number;
	color_alpha : number;
	pixel_x : number;
	pixel_y : number;
	pixel_w : number;
	pixel_z : number;
	blend_mode : number;
	glide_size : number;
	transform : Matrix;
	invisibility : number;
	overlays : T[];
	underlays : T[];
}

interface AppearanceCachedData {
	sorted_appearances? : Appearance[];
	floating_appearances? : Appearance[];
	derived_from : Appearance;
	icon_state_dir? : IconStateDir;
}

export type ReaderAppearance = BaseAppearance<number>;
export type Appearance = BaseAppearance<Appearance> & AppearanceCachedData;
export type TransitionalAppearance = BaseAppearance<TransitionalAppearance|Appearance|number> & Partial<AppearanceCachedData>;

export namespace Appearance {
	export function resolve_plane(plane : number, parent_plane = 0) : number {
		if(parent_plane < -10000 || parent_plane > 10000) parent_plane = resolve_plane(parent_plane);
		if(plane < -10000 || plane > 10000) {
			plane = ((parent_plane + plane + 32767) << 16) >> 16;
		}
		return plane;
	}

	export function get_appearance_parts(appearance : Appearance) {
		if(appearance.sorted_appearances) return appearance.sorted_appearances;
		let appearances : Appearance[] = [];
		for(let underlay of appearance.underlays) {
			underlay = overlay_inherit(appearance, underlay);
			appearances.push(...get_appearance_parts(underlay));
		}
		appearances.push(appearance)
		for(let overlay of [...appearance.overlays].sort((a,b) => {
			let a_layer = a.layer < 0 ? appearance.layer : a.layer;
			let b_layer = b.layer < 0 ? appearance.layer : b.layer;
			if(a_layer < b_layer)
				return a_layer - b_layer;
			let a_float_layer = a.layer < 0 ? a.layer : -1;
			let b_float_layer = b.layer < 0 ? b.layer : -1;
			if(a_float_layer < b_float_layer)
				return a_float_layer - b_float_layer;
			return 0;
		})) {
			overlay = overlay_inherit(appearance, overlay);
			appearances.push(...get_appearance_parts(overlay));
		}
		appearance.sorted_appearances = appearances;
		return appearances;
	}

	export function overlay_inherit(appearance : Appearance, overlay : Appearance) {
		let cloned = false;
		let clone = () => {
			if(!cloned) {
				cloned = true;
				overlay = {...overlay};
			}
		}
		if(!overlay.dir) {
			clone();
			overlay.dir = appearance.dir;
		}
		if(appearance.pixel_x || appearance.pixel_y || appearance.pixel_z || appearance.pixel_w && !(appearance.appearance_flags & RESET_TRANSFORM)) {
			clone();
			overlay.pixel_x += appearance.pixel_x;
			overlay.pixel_y += appearance.pixel_y;
			overlay.pixel_z += appearance.pixel_z;
			overlay.pixel_w += appearance.pixel_w;
		}
		if(!(appearance.appearance_flags & RESET_TRANSFORM) && !matrix_is_identity(appearance.transform)) {
			clone();
			overlay.transform = [...overlay.transform];
			matrix_multiply(overlay.transform, appearance.transform);
		}
		if((appearance.color_alpha & 0xFF000000) != 0xFF000000 && !(appearance.appearance_flags & RESET_ALPHA)) {
			clone();
			let alpha = Math.round((appearance.color_alpha >>> 24) * (overlay.color_alpha >>> 24) / 255);
			overlay.color_alpha = (overlay.color_alpha & 0xFFFFFF) | (alpha << 24);
		}
		if((appearance.color_alpha & 0xFFFFFF) != 0xFFFFFF && !(appearance.appearance_flags & RESET_COLOR)) {
			clone();
			let color_alpha = overlay.color_alpha & 0xFF000000;
			for(let i = 0; i < 24; i += 8) {
				let color = Math.round(((appearance.color_alpha >>> i) & 0xFF) * ((overlay.color_alpha >>> i) & 0xFF) / 255)
				color_alpha |= (color << i);
			}
			overlay.color_alpha = color_alpha;
		}
		return overlay;
	}

	export function get_display_boundary(appearance : Appearance) {
		let left = Infinity;
		let right = -Infinity;
		let bottom = Infinity;
		let top = -Infinity;

		for(let part of get_appearance_parts(appearance)) {
			let icon_width = part.icon_state_dir?.atlas_node?.width ?? 32;
			let icon_height = part.icon_state_dir?.atlas_node?.height ?? 32;
			for(let ix of [-0.5,0.5]) for(let iy of [-0.5,0.5]) {
				let x = part.transform[0] * ix * icon_width + part.transform[1] * iy * icon_height + part.transform[2] + 0.5 * icon_width + part.pixel_x + part.pixel_w;
				let y = part.transform[3] * ix * icon_width + part.transform[4] * iy * icon_height + part.transform[5] + 0.5 * icon_height + part.pixel_y + part.pixel_z;

				left = Math.min(left, x);
				right = Math.max(right, x);
				bottom = Math.min(bottom, y);
				top = Math.max(top, y);
			}
		}
		if(left > right || bottom > top) return {x:0,y:0,width:0,height:0};
		return {
			x: left,
			y: bottom,
			width: right-left,
			height: top-bottom
		};
	}

	export function check_appearance_click(appearance : Appearance, x:number, y:number, full_mouse_opacity = false) {
		let parts = get_appearance_parts(appearance);
		for(let i = parts.length-1; i >= 0; i--) {
			let mouse_opacity = full_mouse_opacity ? 2 : 1;
			if(mouse_opacity == 0) continue;
			let part = parts[i];
			let inv_mat = matrix_invert([...part.transform]);
			if(!inv_mat) continue;
			let frame = part.icon_state_dir?.current_frame;
			if(!frame && mouse_opacity <= 1) continue;
			let icon_width = 32;
			let icon_height = 32;
			if(frame) {
				icon_width = frame.sprite_data.width;
				icon_height = frame.sprite_data.height;
			}
			let irx = x - (icon_width/2) - part.pixel_x - part.pixel_w;
			let iry = y - (icon_height/2) - part.pixel_y - part.pixel_z;
			let rx = irx * inv_mat[0] + iry * inv_mat[1] + inv_mat[2] + icon_width/2;
			let ry = irx * inv_mat[3] + iry * inv_mat[4] + inv_mat[5] + icon_height/2;
			if(rx < 0 || ry < 0 || rx >= icon_width || ry >= icon_height) continue;
			if(mouse_opacity <= 1 && frame) {
				if(frame.sprite_data.data[(Math.floor(icon_height-ry) * icon_width + Math.floor(rx)) * 4 + 3] == 0) continue;
			}
			return true;
		}
		return false;
	}
}

export namespace ReaderAppearance {
	export const base : ReaderAppearance = {
		icon: null,
		icon_state: null,
		name: null,
		appearance_flags: 0,
		layer: 2,
		plane: -32767,
		dir: 2,
		color_alpha: -1,
		pixel_x: 0,
		pixel_y: 0,
		pixel_z: 0,
		pixel_w: 0,
		blend_mode: 0,
		glide_size: 8,
		transform: [1,0,0,0,1,0],
		invisibility: 0,
		overlays: [],
		underlays: []
	};
}
