import { Filter, FilterType, ReaderAppearance } from "../misc/appearance";
import { Planes, SOUND_MUTE, SOUND_PAUSED, SOUND_STREAM, SOUND_UPDATE } from "../misc/constants";
import { Matrix } from "../misc/matrix";
import { DemoParser, ReaderDemoAnimation, ReaderDemoAnimationFrame } from "./base_parser";
import { RevData } from "./interface";

const MIN_VERSION = 0;
const MAX_VERSION = 0;

const text_decoder = new TextDecoder();

export class DemoParserBinary extends DemoParser {
	private read_buffer = new Uint8Array(65536);
	private read_buffer_end = 0;
	private file_index = 0;
	private load_end = 0;
	private has_read_header = false;
	async handle_data(data: Uint8Array) {
		if(this.read_buffer_end + data.length > this.read_buffer.length) {
			let desired_size = this.read_buffer.length;
			while(this.read_buffer_end + data.length > desired_size) desired_size *= 2;
			let new_buffer = new Uint8Array(desired_size);
			new_buffer.set(this.read_buffer);
			this.read_buffer = new_buffer;
		}
		this.read_buffer.set(data, this.read_buffer_end);
		this.read_buffer_end += data.length;

		let chunk_start = 0;

		if(!this.has_read_header) {
			if(this.read_buffer_end < 3) return;
			let magic = this.read_buffer[0];
			if(magic != 0xCB) throw new Error('Invalid demo header');
			let version = this.read_buffer[1] | (this.read_buffer[2] << 8);
			if(version > MAX_VERSION || version < MIN_VERSION) {
				throw new Error(`Version ${version} demo files are incompatible with this player`);
			}
			let commit_hash_end = 3;
			while(this.read_buffer_end > commit_hash_end && this.read_buffer[commit_hash_end] != 0) commit_hash_end++;
			if(commit_hash_end+4 >= this.read_buffer_end) return;
			let commit_info = text_decoder.decode(this.read_buffer.subarray(3, commit_hash_end));
			if(commit_info[0] == '{') {
				this.set_rev_data(JSON.parse(commit_info) as RevData);
			} else {
				this.set_rev_data({commit: commit_info, repo: 'yogstation13/Yogstation'});
			}

			this.load_end = this.read_buffer[commit_hash_end+1] + (this.read_buffer[commit_hash_end+2]<<8) + (this.read_buffer[commit_hash_end+3]<<16) + (this.read_buffer[commit_hash_end+4]<<24);

			this.has_read_header = true;
			chunk_start = commit_hash_end+5;
			this.file_index = chunk_start;
		}

		while(chunk_start < this.read_buffer_end) {
			let chunk_type = this.read_buffer[chunk_start];
			let chunk_data_start = chunk_start+2;
			let chunk_length = 0;
			for(let i = chunk_start+1; i < this.read_buffer_end; i++) {
				chunk_data_start = i+1;
				let byte = this.read_buffer[i];
				chunk_length <<= 7;
				chunk_length += (byte & 0x7F);
				if(!(byte & 0x80)) break;
			}
			if (chunk_data_start + chunk_length >= this.read_buffer_end) break;
			this.file_index += (chunk_data_start - chunk_start);
			let should_wait = this.handle_chunk(this.read_buffer.subarray(chunk_data_start, chunk_data_start + chunk_length), chunk_type);
			this.file_index += chunk_length;
			chunk_start = chunk_data_start + chunk_length;
			if(should_wait) {
				await new Promise(resolve => setTimeout(resolve, 16));
			}
			if(this.load_end) {
				let progress = this.file_index / this.load_end;
				this.update_progress(progress, progress >= 1);
			}
		}
		this.read_buffer.set(this.read_buffer.subarray(chunk_start));
		this.read_buffer_end -= chunk_start;
	}

	chunk_usage_stats : (number|undefined)[] = [];
	num_empty_updates = 0;

	handle_chunk(data : Uint8Array, type : number) : boolean {
		let p = new DataPointer(data, this.file_index, type);
		this.chunk_usage_stats[type] = (this.chunk_usage_stats[type] ?? 0) + data.length;
		if(!this.current_frame.size_stats) this.current_frame.size_stats = [];
		this.current_frame.size_stats[type] = (this.current_frame.size_stats[type] ?? 0) + data.length;

		try {
			switch(type) {
			case 0x00:
				let new_world_time = p.read_float();
				this.push_frame(new_world_time);
				if(this.load_end) {
					this.load_end = 0;
					this.update_progress(1, true);
				}
				break;
			case 0x01:
				this.resize(p.read_uint16(), p.read_uint16(), p.read_uint16());
				break;
			case 0x2:
			case 0x3:
			case 0x4:
			case 0x5:
				this.handle_atom_data(p, type);
				if(this.load_end) return true;
				break;
			case 0x7:
				this.handle_animate(p);
				break;
			case 0x8:
				this.handle_chat(p);
				break;
			case 0x9:
				this.handle_client(p);
				break;
			case 0xA:
				this.resource_loads.push({
					id: p.read_uint32(),
					blob: new Blob([p.data.subarray(p.i)])
				});
				break;
			case 0xB:
				this.handle_sound(p);
				break;
			default:
				console.warn(`Unknown chunk 0x${type.toString(16)}, length ${data.length} at 0x${this.file_index.toString(16)}`)
				break;
			}
		} catch(e) {
			console.error(p.toString());
			console.error(e);
		}
		return false;
	}

	convert_relative_ref(ref : number, parent_ref : number) : number {
		if(ref & 0x80000000) {
			ref = (ref & 0x7F000000) | (((ref & 0xFFFFFF) + (parent_ref & 0xFFFFFF)) & 0xFFFFFF)
		}
		return ref;
	}

	handle_sound(p : DataPointer) : void {
		let recipient_flags = p.read_uint8();
		let recipients : Array<undefined|string> = [];
		if(recipient_flags & 4) recipients.push(undefined);
		if(recipient_flags & 2) recipients.push('world');
		if(recipient_flags & 1) {
			let num_clients = p.read_vlq();
			for(let i = 0; i < num_clients; i++) {
				let ckey = this.client_id_to_ckey[p.read_uint16()];
				if(ckey) recipients.push(ckey);
			}
		}

		let resources : number[] = [];
		let num_resources = p.read_vlq();
		for(let i = 0; i < num_resources; i++) {
			let resource = this.parse_resource_id(p);
			if(resource) resources.push(resource);
		}
		let flags = p.read_uint8();
		let status = 0;
		if(flags & 0x8) status |= SOUND_MUTE;
		if(flags & 0x10) status |= SOUND_PAUSED;
		if(flags & 0x20) status |= SOUND_STREAM;
		if(flags & 0x40) status |= SOUND_UPDATE;
		let sound = {
			recipients, resources,
			repeat: (flags & 0x3),
			wait: !!(flags & 0x4),
			status,
			channel: p.read_uint16(),
			volume: p.read_uint8(),
			frequency: p.read_float(),
			pan: p.read_float(),
			x:0,y:0,z:0,falloff:1
		};
		if(flags & 0x80) {
			sound.x = p.read_float();
			sound.y = p.read_float();
			sound.z = p.read_float();
			sound.falloff = p.read_float();
		}
		if(!sound.recipients.length) return;
		if(!this.current_frame.sounds) this.current_frame.sounds = [];
		this.current_frame.sounds.push(sound);
	}

	handle_chat(p : DataPointer) : void {
		let flags = p.read_uint8();
		let recipients : Array<undefined|string> = [];
		if(flags & 4) recipients.push(undefined);
		if(flags & 2) recipients.push('world');
		if(flags & 1) {
			let num_clients = p.read_vlq();
			for(let i = 0; i < num_clients; i++) {
				let ckey = this.client_id_to_ckey[p.read_uint16()];
				if(ckey) recipients.push(ckey);
			}
		}
		if(flags & 8) {
			let num_turfs = p.read_vlq();
			for(let i = 0; i < num_turfs; i++) p.read_uint32();
		}
		let msg = this.parse_string(p);
		this.add_chat({
			clients: recipients,
			message: (flags & 16) ? {text: msg} : {html: msg}
		});
	}

	client_id_to_ckey : Array<string|undefined> = [];
	handle_client(p : DataPointer) : void {
		let client_id = p.read_uint16();
		let ckey = this.client_id_to_ckey[client_id];
		let flags = p.read_uint8();
		if(flags & 2) {
			if(ckey != null) {
				this.set_client_status(ckey, false);
				this.set_mob(ckey, 0);
				this.set_client_screen(ckey, []);
				this.client_id_to_ckey[client_id] = undefined;
			}
		}
		if(flags & 1) {
			ckey = this.parse_string(p);
			let key = this.parse_string(p);
			this.set_client_status(ckey, true);
			this.client_id_to_ckey[client_id] = ckey;
		}
		if(flags & 4) {
			let mob = p.read_uint32();
			if(ckey) this.set_mob(ckey, mob);
		}
		if(flags & 8) {
			let view_width = p.read_uint8();
			let view_height = p.read_uint8();
		}
		if(flags & 16) {
			let eye = p.read_uint32();
		}
		if(flags & 32) {
			let old_screen = ckey ? (this.current_frame.forward.set_client_screen?.get(ckey) ?? this.running_client_screens.get(ckey) ?? []) : [];
			let screen_set = new Set(old_screen);
			let num_del = p.read_vlq();
			for(let i = 0; i < num_del; i++) {
				let ref = p.read_uint32();
				screen_set.delete(ref);
			}
			let num_add = p.read_vlq();
			for(let i = 0; i < num_add; i++) {
				let ref = p.read_uint32();
				screen_set.add(ref);
			}
			if(ckey && (num_add || num_del)) this.set_client_screen(ckey, [...screen_set]);

			let images_del = ckey ? this.current_frame.forward.client_del_images?.get(ckey) : undefined;
			let images_add = ckey ? this.current_frame.forward.client_add_images?.get(ckey) : undefined;
			let num_images_del = p.read_vlq();
			for(let i = 0; i < num_images_del; i++) {
				let ref = p.read_uint32();
				if(!images_del) images_del = new Set();
				images_del.add(ref);
				images_add?.delete(ref);
			}
			let num_images_add = p.read_vlq();
			for(let i = 0; i < num_images_add; i++) {
				let ref = p.read_uint32();
				if(!images_add) images_add = new Set();
				images_add.add(ref);
				images_del?.delete(ref);
			}
			if(ckey) {
				if(!this.current_frame.forward.client_add_images) this.current_frame.forward.client_add_images = new Map();
				if(!this.current_frame.forward.client_del_images) this.current_frame.forward.client_del_images = new Map();
				if(images_add) this.current_frame.forward.client_add_images.set(ckey, images_add);
				if(images_del) this.current_frame.forward.client_del_images.set(ckey, images_del);
			}
		}
	}

	handle_animate(p : DataPointer) : void {
		while(!p.reached_end()) {
			let target = p.read_uint32();
			let appearance = this.parse_appearance(p) ?? this.appearance_id(ReaderAppearance.base);
			let flags = p.read_uint8();
			let loop = p.read_uint16();
			let num_frames = p.read_vlq();
			let animation : ReaderDemoAnimation = {
				base_appearance: appearance,
				end_appearance: appearance,
				start_time: this.current_frame.time,
				end_time: this.current_frame.time,
				duration: 0,
				chain_end_time: this.current_frame.time,
				chain_parent: null,
				chain_parent_influence_end: Infinity,
				frames: [],
				loop,
				parallel: !!(flags & 2),
				end_now: !!(flags & 1)
			};
			if(animation.parallel || !animation.end_now) {
				animation.chain_parent = this.current_frame.forward.set_animation?.get(target) ?? this.get_running_atom(target).animation ?? null;
				if(animation.chain_parent && animation.chain_parent.chain_end_time <= animation.start_time) animation.chain_parent = null;
				if(animation.chain_parent) {
					animation.chain_end_time = Math.max(animation.end_time, animation.chain_parent.chain_end_time);
				}
			}
			for(let i = 0; i < num_frames; i++) {
				let frame : ReaderDemoAnimationFrame = {
					appearance: this.parse_appearance(p) ?? animation.end_appearance,
					time: p.read_float(),
					easing: p.read_uint8(),
					linear_transform: !!(p.read_uint8() & 1)
				};
				animation.frames.push(frame);
				animation.end_appearance = frame.appearance;
				animation.duration += frame.time;
			}
			if(animation.frames.length <= 1) animation.loop = 1; // Animations need more than one frame to loop, so let's save the cpu cycles
			if(!animation.parallel && animation.chain_parent) {
				animation.chain_parent_influence_end = animation.start_time + (animation.frames[0]?.time ?? 0)
			}
			let checkpoint = animation;
			while(checkpoint.chain_parent && checkpoint.chain_parent_influence_end > animation.start_time) checkpoint = checkpoint.chain_parent;
			if(checkpoint.chain_parent) {
				// Cut off the chain because the structured clone algorithm doesn't like long chains.
				// Specifically cut it off at the point where the animation has lost its influence.
				if(animation == checkpoint) {
					checkpoint.chain_parent = null;
				} else {
					let ccp = checkpoint.chain_parent;
					checkpoint.chain_parent = null;
					animation.chain_parent = DemoParserBinary.clone_animation_chain(animation.chain_parent);
					checkpoint.chain_parent = ccp;
				}
			}
			animation.end_time = loop > 0 ? animation.start_time + (animation.duration * animation.loop) : Infinity;
			animation.chain_end_time = Math.max(animation.end_time, animation.chain_end_time);

			let existing_appearance = this.current_frame.forward.set_appearance?.get(target) ?? this.get_running_atom(target).appearance;
			if(animation.frames.length == 0 || existing_appearance == null || animation.duration <= 0) {
				this.set_animation(target, null);
			} else {
				this.set_animation(target, animation);
			}
		}
	}

	static clone_animation_chain(anim : ReaderDemoAnimation|null) : ReaderDemoAnimation|null {
		if(!anim) return null;
		return {
			...anim,
			chain_parent: this.clone_animation_chain(anim.chain_parent)
		};
	}

	private copy_bufs : Array<{loc:number, vis_contents:number[]}|undefined> = [];

	handle_atom_data(p : DataPointer, type : number) : void {
		let ref_base = 0;
		switch(type) {
		case 0x02:
			ref_base = 0x01000000;
			break;
		case 0x03:
			ref_base = 0x02000000;
			break;
		case 0x04:
			ref_base = 0x03000000;
			break;
		case 0x05:
			ref_base = 0x0D000000;
			break;
		default:
			throw new Error("Invalid type for handle_atom_data");
			return;
		}
		let copy_buf = this.copy_bufs[ref_base >> 24];
		if(!copy_buf) {
			copy_buf = this.copy_bufs[ref_base >> 24] = {
				loc: 0,
				vis_contents: []
			};
		}
		let curr_id = 0;
		while(true) {
			let to_add = p.read_vlq();
			if(to_add == 0 && curr_id != 0) break;
			curr_id += to_add;
			let to_read = p.read_vlq();
			for(let i = 0; i < to_read; i++) {
				let ref = curr_id | ref_base;

				let update_flags = p.read_uint8();
				if(!update_flags) this.num_empty_updates++;
				if(update_flags & 0x80) {
					throw new Error('Invalid atom update flags');
				}
				if(update_flags & 0x01) {
					let appearance : number|null = this.parse_appearance(p);
					this.set_appearance(ref, appearance);
				}
				if(update_flags & 0x02) {
					let loc : number = this.convert_relative_ref(copy_buf.loc = p.read_uint32(), curr_id);
					this.set_loc(ref, loc);
				}
				if(update_flags & 0x04) {
					let vis_contents : number[] = [];
					let num_vis_contents = p.read_vlq();
					for(let i = 0; i < num_vis_contents; i++) {
						vis_contents.push(this.convert_relative_ref(p.read_uint32(), curr_id));
					}
					this.set_vis_contents(ref, vis_contents);
				}
				if(update_flags & 0x08) {
					let step_x = p.read_int16() / 256;
					let step_y = p.read_int16() / 256;
					// TODO: handle step_x/step_y
				}
				if(update_flags & 0x40) {
					this.set_mobextras(ref, {
						sight: p.read_uint16(),
						see_invisible: p.read_uint8()
					});
				}
				if(update_flags & 0x10) {
					let loc : number = this.convert_relative_ref(copy_buf.loc, curr_id);
					this.set_loc(ref, loc);
				}
				curr_id++;
				if(this.load_end) {
					this.update_progress(Math.min(1, (p.i+p.start_abs_offset)/this.load_end), false);
				}
			}
		}
	}

	private appearance_refs : Array<number|undefined> = [];
	parse_appearance(p : DataPointer) : number|null {
		let id_part = p.read_int32();
		let appearance_ref = id_part & 0xFFFFFF;
		if(id_part & 0xFE000000) {
			throw new Error('Bad bits set in appearance data');
		}
		if(id_part & 0x1000000) {
			if(appearance_ref == 0xFFFF) throw new Error('Non-null 0xFFFF(NONE) appearance');
			let appearance = {...ReaderAppearance.base};
			let daf = p.read_uint32();
			appearance.appearance_flags = p.read_uint16();
			appearance.dir = [2,1,4,8,6,10,5,9][daf & 0x07];
			appearance.opacity = !!(daf & 0x08);
			appearance.density = !!(daf & 0x10);
			appearance.dir_override = !!(daf & 0x80);
			if(daf & 0x100) {
				appearance.name = this.parse_string(p);
			}
			if(daf & 0x200) {
				/*appearance.desc = */this.parse_string(p);
			}
			if(daf & 0x400) {
				appearance.screen_loc = this.parse_string(p);
			}
			appearance.icon = this.parse_resource_id(p);
			appearance.icon_state = this.parse_string(p);
			if(daf & 0x800) {
				appearance.maptext = {
					maptext: this.parse_string(p),
					x: p.read_int16(),
					y: p.read_int16(),
					width: p.read_int16(),
					height: p.read_int16()
				}
			}
			if(daf & 0x1000) {
				let num_overlays = p.read_vlq();
				let overlays : number[] = [];
				for(let i = 0; i < num_overlays; i++) {
					let overlay = this.parse_appearance(p);
					if(overlay != null)
						overlays.push(overlay);
				}
				if(overlays.length) appearance.overlays = overlays;
				let num_underlays = p.read_vlq();
				let underlays : number[] = [];
				for(let i = 0; i < num_underlays; i++) {
					let underlay = this.parse_appearance(p);
					if(underlay != null)
						underlays.push(underlay);
				}
				if(underlays.length) appearance.underlays = underlays;
			}
			if(daf & 0x4000) {
				appearance.invisibility = p.read_uint8();
			}
			if(daf & 0x10000) {
				appearance.pixel_x = p.read_int16();
				appearance.pixel_y = p.read_int16();
			}
			if(daf & 0x20000) {
				appearance.pixel_w = p.read_int16();
				appearance.pixel_z = p.read_int16();
			}
			if(daf & 0x8000) {
				appearance.glide_size = p.read_float();
			}
			if(daf & 0x2000) {
				appearance.layer = p.read_float();
			} else { appearance.layer = 3; }
			if(daf & 0x40000) {
				appearance.plane = p.read_int16();
			} else { appearance.plane = -32767; }
			if(daf & 0x80000) {
				let transform : Matrix = [1,0,0,0,1,0];
				appearance.transform = transform;
				for(let i = 0; i < 6; i++) {
					transform[i] = p.read_float();
				}
			}
			if(daf & 0x100000) {
				appearance.color_alpha = p.read_uint32();
			}
			if(daf & 0x200000) {
				appearance.color_matrix = p.read_color_matrix();
			}
			appearance.animate_movement = (daf >>> 22) & 0x3;
			appearance.blend_mode = (daf >>> 24) & 0x7;
			appearance.mouse_opacity = (daf >>> 27) & 0x3;
			if(daf & 0x20000000) {
				let filters : Filter[] = [];
				let num_filters = p.read_vlq();
				for(let i = 0; i < num_filters; i++) {
					let filter = this.parse_filter(p);
					if(filter) filters.push(filter);
				}
				// Uncomment this once filters are actually being used somewhere
				//if(filters.length) appearance.filters = filters;
			}
			appearance.override = !!(daf & 0x40000000);
			if(daf & 0x80000000) {
				appearance.vis_flags = p.read_uint8();
			}

			if(appearance.plane == Planes.LIGHTING_PLANE && !appearance.screen_loc) appearance.blend_mode = 4; // This only exists because I CBA to implement plane masters right now
			return this.appearance_refs[appearance_ref] = this.appearance_id(appearance);
		} else {
			if(appearance_ref == 0xFFFF) return null;
			let to_ret = this.appearance_refs[appearance_ref];
			if(to_ret == null) throw new Error(`Reference to undefined appearance 0x${appearance_ref.toString(16)}`);
			return to_ret;
		}
	}

	private filter_refs : Array<Filter|null|undefined> = [];
	parse_filter(p : DataPointer) : Filter|null {
		let id_part = p.read_int32();
		let filter_ref = id_part & 0xFFFFFF;
		if(id_part & 0xFE000000) {
			throw new Error('Bad bits set in filter data');
		}
		if(id_part & 0x1000000) {
			if(filter_ref == 0xFFFF) throw new Error('Non-null 0xFFFF(NONE) filter');
			let type = p.read_uint8();
			let id = p.read_uint8();
			let filter : Filter|null = null;
			switch(type) {
				case FilterType.Blur:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float()
					};
					break;
				case FilterType.Outline:
					filter = {
						type, id,
						size: p.read_float(),
						color: p.read_uint32(),
						flags: p.read_uint8()
					};
					break;
				case FilterType.DropShadow:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float(),
						offset: p.read_float(),
						color: p.read_uint32()
					};
					break;
				case FilterType.MotionBlur:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float()
					};
					break;
				case FilterType.Wave:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float(),
						offset: p.read_float(),
						flags: p.read_uint8()
					};
					break;
				case FilterType.Ripple:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float(),
						repeat: p.read_float(),
						radius: p.read_float(),
						falloff: p.read_float(),
						flags: p.read_uint8()
					};
					break;
				case FilterType.Alpha:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						icon: this.parse_resource_id(p),
						render_source: p.read_cstring()
					};
					break;
				case FilterType.Displace:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float(),
						icon: this.parse_resource_id(p),
						render_source: p.read_cstring()
					};
					break;
				case FilterType.Color:
					filter = {
						type, id,
						color: p.read_color_matrix(),
						space: p.read_uint8()
					};
					break;
				case FilterType.RadialBlur:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float()
					};
					break;
				case FilterType.AngularBlur:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float()
					};
					break;
				case FilterType.Rays:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						size: p.read_float(),
						color: p.read_uint32(),
						offset: p.read_float(),
						density: p.read_float(),
						threshold: p.read_float(),
						factor: p.read_float(),
						flags: p.read_uint8()
					};
					break;
				case FilterType.Layer:
					filter = {
						type, id,
						x: p.read_float(),
						y: p.read_float(),
						icon: this.parse_resource_id(p),
						render_source: p.read_cstring(),
						flags: p.read_uint8(),
						color: p.read_color_matrix(),
						transform: [p.read_float(),p.read_float(),p.read_float(),p.read_float(),p.read_float(),p.read_float()],
						blend_mode: p.read_uint8()
					};
					break;
				case FilterType.Bloom:
					filter = {
						type, id,
						color_alpha: p.read_uint32(),
						size: p.read_float(),
						offset: p.read_float()
					};
					break;
			}
			return this.filter_refs[filter_ref] = filter;
		} else {
			if(filter_ref == 0xFFFF) return null;
			let to_ret = this.filter_refs[filter_ref];
			if(to_ret === undefined) throw new Error(`Reference to undefined filter 0x${filter_ref.toString(16)}`);
			return to_ret;
		}
	}

	string_cache : Array<string|undefined> = [];
	parse_string(p : DataPointer) : string {
		let first_byte = p.read_uint8();
		let num_bytes_in_id = (first_byte >> 1) & 0x03;
		let id = 0;
		for(let i = 0; i < num_bytes_in_id; i++) {
			id <<= 8;
			id += p.read_uint8();
		}
		if(first_byte & 1) {
			let str_start = p.i;
			while(p.read_uint8() != 0);
			return (this.string_cache[id] = text_decoder.decode(p.data.subarray(str_start, p.i-1)));
		} else if(id) {
			let str = this.string_cache[id];
			if(str == null) throw new Error(`Reference to undefined string 0x${id.toString(16)}`);
			return str;
		}
		return "";
	}

	parse_resource_id(p : DataPointer) : number|null {
		let first_byte = p.read_uint8();
		let num_bytes_in_id = (first_byte >> 1) & 0x03;
		if(!num_bytes_in_id) return null;
		let id = 0;
		for(let i = 0; i < num_bytes_in_id; i++) {
			id <<= 8;
			id += p.read_uint8();
		}
		if(first_byte & 1) {
			let str_start = p.i;
			while(p.read_uint8() != 0);
			this.resource_loads.push({id, path: text_decoder.decode(p.data.subarray(str_start, p.i-1))});
		}
		return id;
	}
}

class DataPointer {
	dv : DataView;
	i = 0;
	constructor(public data : Uint8Array, public start_abs_offset : number = 0, public chunk_id : number|null = null) {
		this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}

	reached_end() {
		return this.i >= this.dv.byteLength;
	}

	read_vlq() : number  {
		let number = 0;
		while(true) {
			number <<= 7;
			if(this.i >= this.data.length) throw new Error('Reached end of data!');
			let byte = this.data[this.i];
			number += byte & 0x7F;
			this.i++;
			if(!(byte & 0x80)) break;
		}
		return number;
	}
	read_float() : number  {
		let n = this.dv.getFloat32(this.i, true);
		this.i += 4;
		return n;
	}
	read_int32() : number  {
		let n = this.dv.getInt32(this.i, true);
		this.i += 4;
		return n;
	}
	read_uint32() : number {
		let n = this.dv.getUint32(this.i, true);
		this.i += 4;
		return n;
	}
	read_int16() : number  {
		let n = this.dv.getInt16(this.i, true);
		this.i += 2;
		return n;
	}
	read_uint16() : number {
		let n = this.dv.getUint16(this.i, true);
		this.i += 2;
		return n;
	}
	read_uint8() : number {
		let n = this.data[this.i];
		this.i++;
		return n;
	}
	read_cstring() : string {
		let str_start = this.i;
		while(this.read_uint8() != 0);
		return text_decoder.decode(this.data.subarray(str_start, this.i-1));
	}
	read_color_matrix() : Float32Array {
		let cmf = this.read_uint8();
		let cm = new Float32Array(20);
		let next_num = (cmf & 1) ? () => {
			return this.read_float();
		} : () => {
			return this.read_uint8() / 255;
		};
		cm[0] = next_num();
		if(cmf & 0x80) {
			cm[1] = next_num();
			cm[2] = next_num();
		} else {cm[2] = cm[1] = cm[0];}
		if(cmf & 0x40) cm[3] = next_num();
		cm[4] = next_num();
		if(cmf & 0x80) {
			cm[5] = next_num();
			cm[6] = next_num();
		} else {cm[6] = cm[5] = cm[4];}
		if(cmf & 0x40) cm[7] = next_num();
		cm[8] = next_num();
		if(cmf & 0x80) {
			cm[9] = next_num();
			cm[10] = next_num();
		} else {cm[10] = cm[9] = cm[8];}
		if(cmf & 0x40) cm[11] = next_num();
		if(cmf & 0x10) {
			cm[12] = next_num();
			if(cmf & 0x80) {
				cm[13] = next_num();
				cm[14] = next_num();
			} else {cm[14] = cm[13] = cm[12];}
		}
		if(cmf & 0x20) cm[15] = next_num();
		if(cmf & 0x02) {
			cm[16] = next_num();
			cm[17] = next_num();
			cm[18] = next_num();
		}
		if(cmf & 0x04) {
			cm[19] = next_num();
		} else if(cmf & 0x08) {
			cm[19] = 1;
		}
		return cm;
	}

	toString() {
		return `(0x${this.start_abs_offset.toString(16)}:0x${this.i.toString(16)} (0x${(this.start_abs_offset+this.i).toString(16)}), chunk ${this.chunk_id})`;
	}
}
