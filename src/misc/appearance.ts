import { IconStateDir } from "../player/rendering/icon";
import { Planes, RESET_ALPHA, RESET_COLOR, RESET_TRANSFORM } from "./constants";
import { Matrix, matrix_invert, matrix_is_identity, matrix_multiply } from "./matrix";

export enum FilterType {
	Blur = 1,
	Outline = 2,
	DropShadow = 3,
	MotionBlur = 4,
	Wave = 5,
	Ripple = 6,
	Alpha = 7,
	Displace = 8,
	Color = 9,
	RadialBlur = 10,
	AngularBlur = 11,
	Rays = 12,
	Layer = 13,
	Bloom = 14,
};

interface FilterBase {
	type : FilterType;
	id : number;
}

export interface FilterBlur extends FilterBase {
	type : FilterType.Blur;
	x : number;
	y : number;
	size : number;
};
export interface FilterOutline extends FilterBase {
	type : FilterType.Outline;
	size : number;
	color : number;
	flags : number;
};
export interface FilterDropShadow extends FilterBase {
	type : FilterType.DropShadow;
	x : number;
	y : number;
	size : number;
	offset : number;
	color : number;
};
export interface FilterMotionBlur extends FilterBase {
	type : FilterType.MotionBlur;
	x : number;
	y : number;
};
export interface FilterWave extends FilterBase {
	type : FilterType.Wave;
	x : number;
	y : number;
	size : number;
	offset : number;
	flags : number;
};
export interface FilterRipple extends FilterBase {
	type : FilterType.Ripple;
	x : number;
	y : number;
	size : number;
	repeat : number;
	falloff : number;
	radius: number;
	flags : number;
};
export interface FilterAlpha extends FilterBase {
	type : FilterType.Alpha;
	x : number;
	y : number;
	icon : number|null;
	render_source : string;
};
export interface FilterDisplace extends FilterBase {
	type : FilterType.Displace;
	x : number;
	y : number;
	size : number;
	icon : number|null;
	render_source : string;
};
export interface FilterColor extends FilterBase {
	type : FilterType.Color;
	color : Float32Array;
	space : number;
};
export interface FilterRadialBlur extends FilterBase {
	type : FilterType.RadialBlur;
	x : number;
	y : number;
	size : number;
};
export interface FilterAngularBlur extends FilterBase {
	type : FilterType.AngularBlur;
	x : number;
	y : number;
	size : number;
};
export interface FilterRays extends FilterBase {
	type : FilterType.Rays;
	x : number;
	y : number;
	size : number;
	color : number;
	offset : number;
	density : number;
	threshold : number;
	factor : number;
	flags : number;
};
export interface FilterLayer extends FilterBase {
	type : FilterType.Layer;
	x : number;
	y : number;
	icon : number|null;
	render_source : string;
	flags : number;
	color : Float32Array;
	transform : Matrix;
	blend_mode : number;
};
export interface FilterBloom extends FilterBase {
	type : FilterType.Bloom;
	color_alpha : number;
	size : number;
	offset : number;
};
export type Filter = FilterBlur|FilterOutline|FilterDropShadow|FilterMotionBlur|FilterWave|FilterRipple|FilterAlpha|FilterDisplace|FilterColor|FilterRadialBlur|FilterAngularBlur|FilterRays|FilterLayer|FilterBloom;

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
	screen_loc : string|null;
	transform : Matrix;
	invisibility : number;
	overlays : T[];
	underlays : T[];
	opacity : boolean;
	density : boolean;
	dir_override : boolean;
	override : boolean;
	color_matrix : Float32Array|null;
	maptext : {maptext: string, x:number, y:number, width:number, height:number}|null;
	mouse_opacity: number;
	animate_movement : number;
	filters : Filter[];
	vis_flags : number;
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
	const empty_arr : [] = [];
	export function resolve_plane(plane : number, parent_plane = 0) : number {
		if(parent_plane < Planes.LOWEST_EVER_PLANE || parent_plane > Planes.HIGHEST_EVER_PLANE) parent_plane = resolve_plane(parent_plane);
		if(plane < Planes.LOWEST_EVER_PLANE || plane > Planes.HIGHEST_EVER_PLANE) {
			plane = ((parent_plane + plane + 32767) << 16) >> 16;
		}
		return plane;
	}

	/**
	 * Used to determine if the appearance belongs to a plane that should be invisible when darkness is toggled off. Without darkness there's no reason to see sprites
	 * that exist to be an alpha mask of the dark.
	 * @param plane of the appearance as a number
	 * @returns TRUE if the plane value falls within the range of Byond lighting planes, FALSE if the plane is anything else
	 */
	export function is_lighting_plane(plane : number): boolean {
		return (plane >= Planes.EMISSIVE_BLOCKER_PLANE && plane <= Planes.O_LIGHTING_VISUAL_PLANE)
	}

	export function get_appearance_parts(appearance : Appearance) {
		if(appearance.sorted_appearances) return appearance.sorted_appearances;
		let appearances : Appearance[] = [];
		let float_appearances : Appearance[] = [];
		for(let underlay of appearance.underlays) {
			underlay = overlay_inherit(appearance, underlay);
			if(resolve_plane(underlay.plane, appearance.plane) != resolve_plane(appearance.plane)) {
				float_appearances.push(underlay);
			} else {
				appearances.push(...get_appearance_parts(underlay));
			}
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
			if(resolve_plane(overlay.plane, appearance.plane) != resolve_plane(appearance.plane)) {
				float_appearances.push(overlay);
			} else {
				appearances.push(...get_appearance_parts(overlay));
			}
		}
		appearance.sorted_appearances = appearances;
		appearance.floating_appearances = float_appearances.length ? float_appearances : empty_arr;
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
		if(overlay.dir != appearance.dir && !overlay.dir_override) {
			clone();
			overlay.dir = appearance.dir;
		}
		if(appearance.pixel_x || appearance.pixel_y || appearance.pixel_z || appearance.pixel_w && !(overlay.appearance_flags & RESET_TRANSFORM)) {
			clone();
			overlay.pixel_x += appearance.pixel_x;
			overlay.pixel_y += appearance.pixel_y;
			overlay.pixel_z += appearance.pixel_z;
			overlay.pixel_w += appearance.pixel_w;
		}
		if(!(overlay.appearance_flags & RESET_TRANSFORM) && !matrix_is_identity(appearance.transform)) {
			clone();
			overlay.transform = [...overlay.transform];
			matrix_multiply(overlay.transform, appearance.transform);
		}
		if((appearance.color_alpha & 0xFF000000) != 0xFF000000 && !(overlay.appearance_flags & RESET_ALPHA)) {
			clone();
			let alpha = Math.round((appearance.color_alpha >>> 24) * (overlay.color_alpha >>> 24) / 255);
			overlay.color_alpha = (overlay.color_alpha & 0xFFFFFF) | (alpha << 24);
		}
		if((appearance.color_alpha & 0xFFFFFF) != 0xFFFFFF && !(overlay.appearance_flags & RESET_COLOR)) {
			clone();
			let color_alpha = overlay.color_alpha & 0xFF000000;
			for(let i = 0; i < 24; i += 8) {
				let color = Math.round(((appearance.color_alpha >>> i) & 0xFF) * ((overlay.color_alpha >>> i) & 0xFF) / 255)
				color_alpha |= (color << i);
			}
			overlay.color_alpha = color_alpha;
		}
		if(overlay.blend_mode == 0 && appearance.blend_mode > 0) {
			clone();
			overlay.blend_mode = appearance.blend_mode;
		}
		if(overlay.plane < Planes.LOWEST_EVER_PLANE || overlay.plane > Planes.HIGHEST_EVER_PLANE) {
			clone();
			overlay.plane = resolve_plane(overlay.plane, appearance.plane);
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
			let mouse_opacity = full_mouse_opacity ? 2 : appearance.mouse_opacity;
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

	export function parse_screen_loc(screen_loc : string, screen_width : number = 15, screen_height : number = 15, icon_width : number = 32, icon_height : number = icon_width) : [number,number][] {
		if(screen_loc.includes(" to ")) {
			let [part1, part2] = screen_loc.split(" to ");
			part2 ??= part1;
			let [x1,y1] = parse_screen_loc(part1, screen_width, screen_height, icon_width, icon_height)[0];
			let [x2,y2] = parse_screen_loc(part2, screen_width, screen_height, icon_width, icon_height)[0];
			let tiles : [number,number][] = [];
			for(let y = y1; y <= y2; y++) for(let x = x1; x <= x2; x++) {
				tiles.push([x, y]);
			}
			return tiles;
		}
		let [x_str, y_str] = screen_loc.split(",");
		y_str ??= x_str;
		if(
			x_str.includes('NORTH') || x_str.includes('SOUTH') || x_str.includes('TOP') || x_str.includes('BOTTOM')
			|| y_str.includes('EAST') || y_str.includes('WEST') || y_str.includes('LEFT') || y_str.includes('RIGHT')
		) {[x_str, y_str] = [y_str, x_str];}
		let x = 0, y = 0;
		for(let i = 0; i < 2; i++) {
			let str = i ? y_str : x_str;
			let start_idx = 0;

			let percent = 0;
			let tiles = 0;
			let pixels = 0;

			while(str[start_idx] >= 'A' && str[start_idx] <= 'Z') start_idx++;
			let word = str.substring(0, start_idx);
			str = str.substring(start_idx);

			if(word == "CENTER") percent = 0.5;
			else if(i && word.startsWith("NORTH")) percent = 1;
			else if(i && word.startsWith("SOUTH")) percent = 0;
			else if(!i && word.endsWith("EAST")) percent = 1;
			else if(!i && word.endsWith("WEST")) percent = 0;
			else if(i && word.startsWith("TOP")) percent = 1;
			else if(i && word.startsWith("BOTTOM")) percent = 0;
			else if(!i && word.endsWith("RIGHT")) percent = 1;
			else if(!i && word.endsWith("LEFT")) percent = 0;
			else tiles--;

			let [tiles_str, pixels_str] = str.split(":");
			if(tiles_str.startsWith("+")) tiles_str = tiles_str.substring(1);
			if(tiles_str.endsWith("%")) percent += +(tiles_str.substring(0, tiles_str.length-1))/100;
			else tiles += +tiles_str;
			if(pixels_str) pixels += +pixels_str;

			let coord = percent * ((i ? screen_height : screen_width)-1) + tiles + (pixels / (i ? icon_height : icon_width));
			if(i) y = coord;
			else x = coord;
		}
		return [[x,y]];
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
		screen_loc: null,
		transform: [1,0,0,0,1,0],
		invisibility: 0,
		overlays: [],
		underlays: [],
		opacity: false,
		density: false,
		dir_override: true,
		override: false,
		color_matrix: null,
		maptext: null,
		mouse_opacity: 1,
		animate_movement: 1,
		filters: [],
		vis_flags: 0
	};
}
