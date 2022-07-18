import { AtlasNode, DmiAtlas } from "./atlas";

export type SpriteHash = number;

export interface Icon {
	width : number;
	height : number;
	icon_states : Map<string, IconState>;
}

export interface IconState {
	movement_state : IconState|undefined;
	dirs : Array<IconStateDir>;
	num_dirs : number;
	width : number; height : number;
	atlas : DmiAtlas|undefined;
	requires_sorting : boolean;
}

export interface IconStateDir {
	frames : IconStateFrame[];
	total_delay : number;
	atlas_node : AtlasNode|undefined;
	current_frame : IconStateFrame|undefined;
}

export function get_dir_anim_frame(dir : IconStateDir, time : number) : IconStateFrame {
	if(dir.frames.length == 1) return dir.frames[0];
	let partial_delay : number = time % dir.total_delay;
	let accum_delay : number = 0;
	for(let i = 0; i < dir.frames.length; i++) {
		let frame = dir.frames[i];
		accum_delay += frame.delay;
		if(accum_delay >= partial_delay) return frame;
	}
	return dir.frames[0];
}

export interface IconStateFrame {
	delay : number;
	dmi_index : number;
	atlas_node : AtlasNode|undefined;
	sprite_hash : SpriteHash;
	sprite_data : FrameData;
}

export interface FrameData {
	width: number;
	height: number;
	data: Uint8Array;
}
