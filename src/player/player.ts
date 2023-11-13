import * as Comlink from "comlink";
import { DemoPlayerUi } from "../main/ui";
import { Appearance, TransitionalAppearance } from "../misc/appearance";
import { DemoAnimation, DemoFrame, DemoFrameDirection, ReaderDemoFrameDirection, TransitionalDemoFrame, TransitionalDemoFrameDirection } from "../parser/base_parser";
import { DemoParserInterface, RevData } from "../parser/interface";
import { IconLoader } from "./rendering/icon_loader";
import { Resource } from "./resource";
import { AtlasNode, DmiAtlas } from "./rendering/atlas";
import { IconState, IconStateDir } from "./rendering/icon";
import { CmdViewport, FollowDesc, RenderingCmd } from "./rendering/commands";
import { DrawBuffer } from "./rendering/buffer";
import { LONG_GLIDE, Planes, RESET_ALPHA, RESET_COLOR, RESET_TRANSFORM, SEE_MOBS, SEE_OBJS, SEE_THRU, SEE_TURFS, SeeInvisibility } from "../misc/constants";
import { matrix_is_identity, matrix_multiply } from "../misc/matrix";
import { despam_promise } from "../misc/promise_despammer";
import { view_turfs } from "./view";
import { animate_appearance, appearance_interpolate } from "./rendering/animation";

const empty_arr : [] = [];

export class DemoPlayer {
	parser_interface : Comlink.Remote<DemoParserInterface>;

	frames : DemoFrame[] = [];
	appearance_cache : Appearance[] = [];

	resort_set : Set<Atom> = new Set();
	atoms : Array<Array<Atom|undefined>|undefined> = [];
	maxx = 0; maxy = 0; maxz = 0;
	time = 0;
	frame_index = -1;

	clients : Set<string> = new Set();
	client_mobs : Map<string, Atom> = new Map(); 
	client_screens : Map<string, Atom[]> = new Map();
	client_images : Map<string, Set<number>> = new Map();

	current_images : Set<number>|undefined = undefined;

	ui : Comlink.Remote<DemoPlayerUi>|undefined;

	resources : Array<Resource|undefined> = [];
	rev_data : RevData|undefined;
	chat_css : Promise<string>;
	icon_loader : IconLoader;

	z_level = 2;
	use_index = 0;
	see_invisible = SeeInvisibility.SEE_INVISIBLE_OBSERVER;

	change_counter = 0;

	constructor(parser_endpoint : Comlink.Endpoint, icon_loader : MessagePort) {
		//@ts-ignore
		self.demo_player = this;
		this.parser_interface = Comlink.wrap(parser_endpoint);
		this.icon_loader = Comlink.wrap<IconLoader>(icon_loader);

		this.parser_interface.consume_data(Comlink.proxy(async (data) => {
			try {
				if(!this.rev_data) {
					this.rev_data = await this.parser_interface.rev_data;	
				}
				for(let appearance of data.appearances) {
					let converting = appearance as TransitionalAppearance;
					for(let i = 0; i < converting.overlays.length; i++) {
						let overlay = converting.overlays[i];
						if(typeof overlay == "number") converting.overlays[i] = this.appearance_cache[overlay]
					}
					for(let i = 0; i < converting.underlays.length; i++) {
						let underlay = converting.underlays[i];
						if(typeof underlay == "number") converting.underlays[i] = this.appearance_cache[underlay]
					}
					converting.sorted_appearances = undefined;
					converting.icon_state_dir = undefined;
					converting.derived_from = converting as Appearance;
					this.appearance_cache.push(converting as Appearance);
				}
				for(let frame of data.frames) {
					let converting = frame as TransitionalDemoFrame;
					this.dereference_frame_direction(frame.forward);
					this.dereference_frame_direction(frame.backward);
					this.frames.push(converting as DemoFrame);
				}
				for(let res_load of data.resource_loads) {
					let res = this.get_resource(res_load.id);
					if(res_load.blob) {
						res.data = res_load.blob;
						res.load_url = undefined;
					}
					if(res_load.path) {
						res.path = res_load.path;
						if(!res.data) {
							let paintings_pattern = "data/paintings/public/";
							if(res_load.path.startsWith(paintings_pattern) && this.rev_data?.repo == "yogstation13/Yogstation") {
								res.load_url = "https://cdn.yogstation.net/paintings/" + res_load.path.substring(paintings_pattern.length);
							} else {
								res.load_url = `https://cdn.jsdelivr.net/gh/${this.rev_data?.repo || "yogstation13/Yogstation"}@${(this.rev_data?.commit || "master")}/${res_load.path}`;
							}
						}
					}
					res.update();
				}
				if(this.ui) this.ui.update_duration(this.get_demo_duration());
				this.advance_time();
			} catch(e) {
				console.error(e);
			}
		}));

		this.chat_css = this.parser_interface.chat_css;
	}
	private dereference_frame_direction(dir : TransitionalDemoFrameDirection) {
		if(dir.set_appearance) {
			for(let [n, a] of dir.set_appearance) {
				if(typeof a == "number") {
					dir.set_appearance.set(n, this.appearance_cache[a]);
				}
			}
		}
		if(dir.set_animation) {
			for(let anim of dir.set_animation.values()) {
				while(anim && typeof anim.base_appearance == "number") {
					if(typeof anim.base_appearance == "number") anim.base_appearance = this.appearance_cache[anim.base_appearance];
					if(typeof anim.end_appearance == "number") anim.end_appearance = this.appearance_cache[anim.end_appearance];
					for(let frame of anim.frames) {
						if(typeof frame.appearance == "number") frame.appearance = this.appearance_cache[frame.appearance];
					}
					anim = anim.chain_parent;
				}
			}
		}
	}

	adjust_z(adj : number) {
		this.z_level += adj;
		if(this.z_level < 1) this.z_level = 1;
		if(this.z_level > this.maxz) this.z_level = this.maxz;
		this.ui?.update_hash(this.z_level);
	}

	follow_ckey : string|undefined;
	last_state_str = "";
	last_objects : Renderable[] = [];
	current_turfs = new Set<Turf>();
	current_obscured_turfs = new Set<Turf>();
	run_frame(dt : number, playback_speed : number, turf_window:{left:number,right:number,top:number,bottom:number,pixel_scale:number,follow?:FollowDesc}, canvas_draw_list : {ref:number, width:number, height:number}[]) : RenderingCmd[] {
		this.follow_ckey = typeof turf_window.follow?.ref == "string" ? turf_window.follow.ref : undefined;
		if(playback_speed != 0)
			this.advance_time_relative(dt / 100 * playback_speed, playback_speed > 0);

		this.current_images = undefined;
		let view_origin : Turf|undefined;
		let view_mob : Mob|undefined;
		let view_dist_x = 0;
		let view_dist_y = 0;
		let follow_data : {ref:number|string,x:number,y:number}|undefined;
		let followview_window : {x:number,y:number,width:number,height:number}|undefined;
		if(turf_window.follow) {
			let iterated_set = new Set()
			let ref = turf_window.follow.ref;
			let atom = typeof ref == "string" ? this.client_mobs.get(ref) : (ref ? this.get_atom(ref) : null);
			if(typeof ref == "string") {
				this.current_images = this.client_images.get(ref);
			}
			if(typeof ref == "string" && atom instanceof Mob) view_mob = atom;
			while(atom && !(atom.loc instanceof Turf)) {
				if(iterated_set.has(atom)) atom = null;
				else {
					iterated_set.add(atom);
					atom = atom.loc;
				}
			}
			if(atom && atom.loc instanceof Turf) {
				let [x,y] = atom.get_offset(this);
				let appearance = atom.get_appearance(this);
				if(appearance && typeof ref != "string") {
					for(let part of Appearance.get_appearance_parts(appearance)) {
						if(!part.icon_state_dir) part.icon_state_dir = this.get_appearance_dir(part);
					}
					let bounds = Appearance.get_display_boundary(appearance);
					x += bounds.x + bounds.width/2;
					y += bounds.y + bounds.height/2;
				} else {
					x += 16;
					y += 16;
				}

				if(typeof ref == "string") {
					view_dist_x = 9.5;
					view_dist_y = 7.5;
					view_origin = atom.loc;
				}

				follow_data = {ref, x:x/32, y:y/32};
				this.z_level = atom.loc.z;
			} else {
				follow_data = {ref, x:0, y:0};
			}
			
			let dx = follow_data.x - (turf_window.follow.x ?? ((turf_window.right+turf_window.left)/2));
			let dy = follow_data.y - (turf_window.follow.y ?? ((turf_window.top+turf_window.bottom)/2));
			turf_window.left += dx;
			turf_window.right += dx;
			turf_window.bottom += dy;
			turf_window.top += dy;

			if(view_dist_x && view_dist_y) {
				followview_window = {
					x: follow_data.x-view_dist_x,
					y: follow_data.y-view_dist_y,
					width: view_dist_x*2,
					height: view_dist_y*2
				};
			}
		}

		let q_turf_window = {
			left: Math.max(1, Math.floor(turf_window.left - 2)),
			right: Math.min(this.maxx+1, Math.ceil(turf_window.right + 2)),
			bottom: Math.max(1, Math.floor(turf_window.bottom - 2)),
			top: Math.min(this.maxy+1, Math.ceil(turf_window.top + 2))
		};
		
		let pixel_scale = turf_window.pixel_scale * 0.95;
		if(pixel_scale > 1) {
			pixel_scale = Math.ceil(pixel_scale);
		} else {
			pixel_scale = 2**Math.ceil(Math.log2(pixel_scale));
		}

		let draw_margin = 2 * Math.min(1, 1 / pixel_scale);
		let d_turf_window = {
			left: turf_window.left - draw_margin,
			right: turf_window.right + draw_margin,
			bottom: turf_window.bottom - draw_margin,
			top: turf_window.top + draw_margin,
		};
		let d_quant = Math.min(8, 32 * pixel_scale);
		d_turf_window.left = Math.floor(d_turf_window.left * d_quant) / d_quant;
		d_turf_window.right = Math.ceil(d_turf_window.right * d_quant) / d_quant;
		d_turf_window.bottom = Math.floor(d_turf_window.bottom * d_quant) / d_quant;
		d_turf_window.top = Math.ceil(d_turf_window.top * d_quant) / d_quant;

		let state_str = JSON.stringify([q_turf_window, d_turf_window, pixel_scale, this.change_counter, this.time, this.z_level, canvas_draw_list, turf_window.follow?.ref]);
		if(state_str == this.last_state_str) {
			return [];
		}
		this.last_state_str = state_str;
		this.use_index++;

		if(view_origin && !(view_mob && (view_mob.sight & SEE_THRU))) {
			let view = view_turfs(this, view_origin, q_turf_window.left, q_turf_window.bottom, q_turf_window.right, q_turf_window.top, true);
			let turfs = new Set(view);
			for(let turf of this.current_turfs) {
				if(!turfs.has(turf)) {
					this.current_turfs.delete(turf);
				}
			}
			for(let turf of turfs) {
				this.current_turfs.add(turf);
			}
			this.current_obscured_turfs = new Set(view.obscured);
		} else {
			for(let turf of this.current_turfs) {
				if(turf.z != this.z_level || turf.x < q_turf_window.left || turf.y < q_turf_window.bottom || turf.x >= q_turf_window.right || turf.y >= q_turf_window.top) {
					this.current_turfs.delete(turf);
				}
			}
			for(let y = q_turf_window.bottom; y < q_turf_window.top; y++) for(let x = q_turf_window.left; x < q_turf_window.right; x++) {
				let turf = this.get_turf(x,y,this.z_level);
				if(!turf) continue;
				this.current_turfs.add(turf);
			}
			this.current_obscured_turfs.clear();
		}

		let drawing_commands : RenderingCmd[] = [];

		let viewport_width = (d_turf_window.right - d_turf_window.left) * 32;
		let viewport_height = (d_turf_window.top - d_turf_window.bottom) * 32;
		let viewport_max = Math.max(viewport_width, viewport_height);
		while(viewport_max * pixel_scale > 4096) {
			if(pixel_scale > 2) pixel_scale--;
			else pixel_scale /= 2;
		}

		let objects : Renderable[] = [];
		for(let turf of this.current_turfs) {
			if(turf.appearance) {
				objects.push(turf);
			}
			for(let thing of turf.contents) {
				if(thing.appearance) {
					objects.push(thing);
				}
			}
		}
		if(view_mob && (view_mob.sight & (SEE_MOBS|SEE_OBJS|SEE_TURFS))) {
			let see_mobs = view_mob.sight & SEE_MOBS;
			let see_objs = view_mob.sight & SEE_OBJS;
			let see_turfs = view_mob.sight & SEE_TURFS;
			for(let turf of this.current_obscured_turfs) {
				if(turf.appearance && see_turfs) {
					objects.push(turf);
				}
				for(let thing of turf.contents) {
					if(!thing.appearance) continue;
					if((thing instanceof Mob)) {
						if(see_mobs) objects.push(thing);
					} else if(see_objs) objects.push(thing);
				}
			}
		}
		if(typeof follow_data?.ref == "string") {
			let screen = this.client_screens.get(follow_data.ref);
			if(screen) for(let thing of screen) {
				if(thing.appearance && thing.appearance.screen_loc) {
					objects.push(...Appearance.parse_screen_loc(thing.appearance.screen_loc, followview_window?.width, followview_window?.height).map(([x,y]) => {
						return new ScreenProxy(thing, x*32, y*32);
					}));
				}
			}
		}
		let main_viewport : CmdViewport;
		drawing_commands.push(main_viewport = {
			cmd: "viewport",
			x: 0,
			y: 0,
			width: Math.ceil(viewport_width * pixel_scale),
			height: Math.ceil(viewport_height * pixel_scale),
			world_location: {
				x: d_turf_window.left,
				y: d_turf_window.bottom,
				width: d_turf_window.right - d_turf_window.left,
				height: d_turf_window.top - d_turf_window.bottom
			}
		});
		this.draw_object_list(drawing_commands, objects, this.see_invisible, followview_window);
		drawing_commands.push({cmd: "copytoviewport", follow_data, followview_window});
		this.last_objects = objects;

		let packing_rects = [
			new PackingRect(main_viewport.width, 0, 4096 - main_viewport.width, main_viewport.height, true),
			new PackingRect(0, main_viewport.y, 4096, main_viewport.height, false)
		];

		for(let i = 0; i < canvas_draw_list.length; i++) {
			let draw_item = canvas_draw_list[i];
			let atom = this.get_atom(draw_item.ref);
			let atom_offset = atom.get_offset(this);
			//let atom_bounds = {x:atom_offset[0], y:atom_offset[1], width:32, height:32};
			let appearance = atom.get_appearance(this);
			if(appearance) {
				for(let part of Appearance.get_appearance_parts(appearance)) {
					if(!part.icon_state_dir) part.icon_state_dir = this.get_appearance_dir(part);
				}
			}
			let atom_bounds = appearance ? Appearance.get_display_boundary(appearance) : {x:0,y:0,width:32,height:32};
			atom_bounds.x += atom_offset[0];
			atom_bounds.y += atom_offset[1];
			atom_bounds.width = Math.max(1, atom_bounds.width);
			atom_bounds.height = Math.max(1, atom_bounds.height);
			let pixel_scale = Math.min(draw_item.width / atom_bounds.width, draw_item.height / atom_bounds.height);
			pixel_scale *= 0.95;
			if(pixel_scale > 1) {
				pixel_scale = Math.ceil(pixel_scale);
			} else {
				pixel_scale = 2**Math.ceil(Math.log2(pixel_scale));
			}
			if(atom_bounds.width / atom_bounds.height > draw_item.width / draw_item.height) {
				let leftover = draw_item.height / draw_item.width * atom_bounds.width - atom_bounds.height;
				atom_bounds.y -= leftover/2;
				atom_bounds.height += leftover;
			} else {
				let leftover = draw_item.width / draw_item.height * atom_bounds.height - atom_bounds.width;
				atom_bounds.x -= leftover/2;
				atom_bounds.width += leftover;
			}
			while(Math.max(atom_bounds.width, atom_bounds.height) * pixel_scale > 512) {
				if(pixel_scale > 2) pixel_scale--;
				else pixel_scale /= 2;
			}
			//atom_bounds.x = Math.round(atom_bounds.x * pixel_scale) / pixel_scale;
			//atom_bounds.y = Math.round(atom_bounds.y * pixel_scale) / pixel_scale;
			let viewport_width = Math.round(pixel_scale*atom_bounds.width);
			let viewport_height = Math.round(pixel_scale*atom_bounds.height);
			atom_bounds.width = viewport_width / pixel_scale;
			atom_bounds.height = viewport_height / pixel_scale;

			let viewport_rect : {x:number,y:number,width:number,height:number}|undefined;
			for(let packing_rect of packing_rects) {
				viewport_rect = packing_rect.allocate(viewport_width, viewport_height);
				if(viewport_rect) break;
			}
			if(!viewport_rect) {
				drawing_commands.push({cmd: "flush"});
				packing_rects = [new PackingRect(0,0,4096,4096,false)];
				viewport_rect = packing_rects[0].allocate(viewport_width, viewport_height);
			}
			if(!viewport_rect) continue;

			drawing_commands.push({
				cmd: "viewport",
				...viewport_rect,
				world_location: {
					x: atom_bounds.x / 32,
					y: atom_bounds.y / 32,
					width: atom_bounds.width / 32,
					height: atom_bounds.height / 32,
				}
			});
			this.draw_object_list(drawing_commands, [atom], 101);
			drawing_commands.push({cmd: "copytocanvas", canvas_index: i});
		}
		drawing_commands.push({cmd: "flush"});

		let commands : RenderingCmd[] = [];
		for(let atlas of this.icon_atlases) {
			atlas.update_anim_dirs(this.time, this.use_index);
			atlas.add_icon_commands(commands);
		}
		commands.push(...drawing_commands);
		let transferables : Transferable[] = [];
		this.cleanup_maptext();
		for(let command of commands) if(command.transferables) transferables.push(...command.transferables);
		return Comlink.transfer(commands, transferables);
	}
	
	draw_buffer = new DrawBuffer();
	draw_object_list(commands : RenderingCmd[], objects : Renderable[], see_invisible = 60, followview_window? : {x:number,y:number,width:number,height:number}|undefined) {
		for(let i = 0; i < objects.length; i++) {
			objects.push(...objects[i].get_floating_overlays(this, see_invisible))
		}
		let buffer = this.draw_buffer;
		let buffer_index = 0;
		objects.sort((a, b) => {
			let a_appearance = a.get_appearance(this, see_invisible);
			let b_appearance = b.get_appearance(this, see_invisible);
			let a_plane = Appearance.resolve_plane(a_appearance?.plane ?? 0);
			let b_plane = Appearance.resolve_plane(b_appearance?.plane ?? 0);
			if(a_plane != b_plane) return a_plane - b_plane;
			let a_layer = a_appearance?.layer ?? 0;
			let b_layer = b_appearance?.layer ?? 0;
			return a_layer - b_layer;
		});

		for(let thing of objects) {
			let [x,y] = thing.get_offset(this);
			if(thing.is_screen_obj()) {
				if(!followview_window) continue;
				x += followview_window.x*32;
				y += followview_window.y*32;
			}
			let root_appearance = thing.get_appearance(this, see_invisible);
			if(!root_appearance || root_appearance.invisibility > see_invisible) continue;
			if(Appearance.is_lighting_plane(root_appearance.plane) && !this.show_darkness) continue;
			for(let appearance of Appearance.get_appearance_parts(root_appearance)) {
				if(!appearance.icon_state_dir) {
					let dir = this.get_appearance_dir(appearance, buffer.atlas);
					if(dir) {
						appearance.icon_state_dir = dir;
					}
				}
				if(appearance.icon_state_dir?.atlas_node) {
					if(buffer.atlas != appearance.icon_state_dir.atlas_node?.atlas || (buffer.blend_mode || 1) != (appearance.blend_mode || 1) || buffer.uses_color_matrices != !!appearance.color_matrix) {
						if(buffer_index) {
							buffer.add_draw(commands, 0, buffer_index);
							buffer_index = 0;
						}
						buffer.atlas = appearance.icon_state_dir.atlas_node?.atlas as DmiAtlas;
						buffer.blend_mode = appearance.blend_mode || 1;
						buffer.uses_color_matrices = !!appearance.color_matrix;
					}
					appearance.icon_state_dir.atlas_node.use_index = this.use_index;
					if(buffer_index >= buffer.get_size()) buffer.expand();
					buffer.write_appearance(buffer_index++, appearance, x, y);
				}
				if(appearance.maptext && appearance.maptext.maptext) {
					let node = this.get_maptext(appearance.maptext);
					if(buffer.atlas != node.atlas || (buffer.blend_mode || 1) != (appearance.blend_mode || 1) || buffer.uses_color_matrices != !!appearance.color_matrix) {
						if(buffer_index) {
							buffer.add_draw(commands, 0, buffer_index);
							buffer_index = 0;
						}
						buffer.atlas = node.atlas as DmiAtlas;
						buffer.blend_mode = appearance.blend_mode || 1;
						buffer.uses_color_matrices = !!appearance.color_matrix;
					}
					node.use_index = this.use_index;
					if(buffer_index >= buffer.get_size()) buffer.expand();
					buffer.write_appearance(buffer_index++, {
						layer: appearance.layer,
						color_alpha: appearance.color_alpha,
						color_matrix: appearance.color_matrix,
						pixel_w: appearance.pixel_w,
						pixel_x: appearance.pixel_x,
						pixel_y: appearance.pixel_y,
						pixel_z: appearance.pixel_z,
						transform: matrix_multiply([1,0,appearance.maptext.x,0,1,appearance.maptext.y], appearance.transform)
					}, x, y, node);
				}
			}
		}
		if(buffer_index) {
			buffer.add_draw(commands, 0, buffer_index);
			buffer_index = 0;
		}
	}

	get_appearance_dir(appearance : Appearance, preferred_atlas? : DmiAtlas) : IconStateDir|undefined {
		if(appearance.icon == null) return;
		let resource = this.get_resource(appearance.icon);
		if(!resource.data) {
			resource.load();
			return;
		}
		if(!resource.icon) {
			resource.load_icon(this.icon_loader);
			return;
		}
		let icon = resource.icon;
		let icon_state;
		if(appearance.icon_state) icon_state = icon.icon_states.get(appearance.icon_state);
		if(!icon_state) icon_state = icon.icon_states.get("");
		if(!icon_state) icon_state = icon.icon_states.get(" ");
		if(!icon_state) return;

		if(!icon_state.atlas) this.allocate_icon_state(icon_state, preferred_atlas);

		let eff_dir = appearance.dir;
		if(icon_state.dirs.length <= 4) {
			if(eff_dir == 5 || eff_dir == 6) eff_dir = 4;
			if(eff_dir == 9 || eff_dir == 10) eff_dir = 8;
		}
		let dir_index = [0,1,0,0,2,6,4,2,3,7,5,3,2,1,0,0][eff_dir] ?? 0;
		let dir = icon_state.dirs[dir_index & (icon_state.dirs.length-1)];
		return dir;
	}

	icon_atlases : DmiAtlas[] = [new DmiAtlas(8, 12, 0)];
	allocate_icon_state(icon_state : IconState, preferred_atlas? : DmiAtlas) {
		if(preferred_atlas && preferred_atlas.allocate_icon_state(icon_state)) return;
		for(let atlas of this.icon_atlases) {
			if(atlas != preferred_atlas) {
				if(atlas.allocate_icon_state(icon_state)) return;
			}
		}
		console.log("Creating new atlas #" + this.icon_atlases.length);
		let atlas = new DmiAtlas(8, 12, this.icon_atlases.length);
		this.icon_atlases.push(atlas);
		if(!atlas.allocate_icon_state(icon_state)) {
			this.icon_atlases.pop();
			icon_state.atlas = preferred_atlas ?? this.icon_atlases[0]; // just prevent it from trying again or something.
			throw new Error("FAILED TO ALLOCATE ICON STATE (" + icon_state.width + ", " + icon_state.height + ") ATLAS SIZE: " + atlas.size_index);
		}
	}

	allocate_surface(width : number, height : number, preferred_atlas? : DmiAtlas) {
		if(preferred_atlas) {
			let node = preferred_atlas.alloc(width, height);
			if(node) return node;
		}
		for(let atlas of this.icon_atlases) {
			if(atlas != preferred_atlas) {
				let node = atlas.alloc(width, height);
				if(node) return node;
			}
		}
		console.log("Creating new atlas #" + this.icon_atlases.length);
		let atlas = new DmiAtlas(8, 12, this.icon_atlases.length);
		this.icon_atlases.push(atlas);
		let node = atlas.alloc(width, height);
		if(node) {
			return node;
		} else {
			this.icon_atlases.pop();
			throw new Error("FAILED TO ALLOCATE SURFACE (" + width + ", " + height + ") ATLAS SIZE: " + atlas.size_index);
		}
	}

	maptext_nodes = new Map<string, AtlasNode>();
	used_maptext_nodes = new Set<AtlasNode>();
	get_maptext(maptext : {maptext: string, width: number, height: number}, preferred_atlas? : DmiAtlas) {
		let str = `${maptext.width}x${maptext.height} ${maptext.maptext}`;
		let node = this.maptext_nodes.get(str);
		if(!node) {
			node = this.allocate_surface(maptext.width, maptext.height, preferred_atlas);
			let atlas = <DmiAtlas>node.atlas;
			atlas.add_maptext(maptext.maptext, node);
			this.maptext_nodes.set(str, node);
		}
		this.used_maptext_nodes.add(node);
		return node;
	}
	cleanup_maptext() {
		for(let [str, node] of this.maptext_nodes) {
			if(this.used_maptext_nodes.has(node)) continue;
			node.free();
			this.maptext_nodes.delete(str);
		}
		this.used_maptext_nodes.clear();
	}

	get_demo_duration() {
		return this.frames.length ? this.frames[this.frames.length-1].time : 0;
	}

	initialize_ui() {
		if(!this.ui) return;
		this.ui.update_time(this.time);
		this.ui.update_duration(this.get_demo_duration());
	}

	advance_time_relative(dt : number, realtime = false) {
		let time = this.time;
		let demo_duration = this.get_demo_duration();
		if(dt < 0) time = Math.min(time+dt, demo_duration);
		else if(dt > 0 && time >= demo_duration) return;
		else time = Math.max(Math.min(time+dt, demo_duration), time);
		this.advance_time(time, realtime);
	}

	advance_time(new_time : number = this.time, realtime = false) {
		if(new_time < 0) new_time = 0;
		let last_frame_index = this.frame_index;
		if(new_time < this.time) {
			while(this.frames[this.frame_index] && new_time < this.frames[this.frame_index].time) {
				this.undo_frame(this.frames[this.frame_index]);
				this.time = Math.min(this.time, this.frames[this.frame_index].time);
				this.frame_index--;
			}
		} else {
			while(this.frames[this.frame_index+1] && new_time >= this.frames[this.frame_index+1].time) {
				this.frame_index++;
				this.apply_frame(this.frames[this.frame_index], realtime);
				this.time = this.frames[this.frame_index].time;
				if(this.frames[this.frame_index].time <= 0) {
					// Since time can't go below zero, this frame will never be unapplied, and therefore will never be re-applied again
					// so we can safely delete it to save memory.
					this.frames.splice(this.frame_index, 1);
					this.frame_index--;
				}
			}
		}
		if(last_frame_index != this.frame_index) {
			for(let listener of this.frame_listeners) {
				listener(this.frame_index);
			}
		}
		if(this.time != new_time && this.ui) this.ui.update_time(new_time);
		this.time = new_time;

	}

	private apply_frame(frame : DemoFrame, realtime : boolean = false) {
		this.apply_frame_direction(frame, frame.forward, true);
		if(realtime && this.ui && frame.sounds) {
			let sounds = frame.sounds.filter(s => (s.recipients.includes("world") || s.recipients.includes(this.follow_ckey)));
			if(sounds.length) this.ui.handle_sounds(sounds);
		}
		this.change_counter++;
	}
	private undo_frame(frame : DemoFrame) {
		this.apply_frame_direction(frame, frame.backward, false);
		this.change_counter++;
	}

	private apply_frame_direction(frame : DemoFrame, dir : DemoFrameDirection, is_forward = true) {
		if(dir.resize) {
			[this.maxx, this.maxy, this.maxz] = dir.resize;
			this.adjust_z(0);
		}
		if(dir.set_appearance) {
			for(let [ref, appearance] of dir.set_appearance) {
				let atom = this.get_atom(ref);
				atom.appearance = appearance;
				this.trigger_inspect_listeners(atom);
				this.resort_set.add(atom);
			}
		}
		if(dir.set_loc) {
			for(let [ref, loc] of dir.set_loc) {
				let atom = this.get_atom(ref);
				let prev_loc = atom.loc;
				if(is_forward && atom instanceof Obj) {
					atom.last_loc = atom.loc;
					atom.loc_change_time = frame.time;
				}
				atom.loc = loc ? this.get_atom(loc) : null;
				this.trigger_inspect_listeners(prev_loc);
				this.trigger_inspect_listeners(atom.loc);
				this.trigger_inspect_listeners(atom);
				this.resort_set.add(atom);
			}
		}
		if(dir.set_last_loc) {
			for(let [ref, loc] of dir.set_last_loc) {
				let atom = this.get_atom(ref);
				if(atom instanceof Obj) {
					atom.last_loc = loc ? this.get_atom(loc) : null;
				}
			}
		}
		if(dir.set_loc_change_time) {
			for(let [ref, time] of dir.set_loc_change_time) {
				let atom = this.get_atom(ref);
				if(atom instanceof Obj) {
					atom.loc_change_time = time;
				}
			}
		}
		if(dir.set_vis_contents) {
			for(let [ref, vis_contents] of dir.set_vis_contents) {
				let atom = this.get_atom(ref);
				atom.vis_contents = vis_contents.length ? vis_contents.filter(Boolean).map(a => this.get_atom(a)) : empty_arr;
			}
		}
		if(dir.set_mobextras) {
			for(let [ref, extras] of dir.set_mobextras) {
				let atom = this.get_atom(ref);
				if(atom instanceof Mob) {
					atom.sight = extras.sight;
					atom.see_invisible = extras.see_invisible;
				}
			}
		}
		if(dir.set_animation) {
			for(let [ref, animation] of dir.set_animation) {
				let atom = this.get_atom(ref);
				atom.animation = animation;
			}
		}
		if(dir.set_client_status) {
			for(let [client, logged_in] of dir.set_client_status) {
				if(logged_in) this.clients.add(client);
				else this.clients.delete(client);
				this.trigger_inspect_listeners(this.client_mobs.get(client));
			}
		}
		if(dir.set_mob) {
			for(let [client, ref] of dir.set_mob) {
				let prev_mob = this.client_mobs.get(client);
				if(!ref) this.client_mobs.delete(client);
				else {
					this.client_mobs.set(client, this.get_atom(ref));
					this.trigger_inspect_listeners(this.get_atom(ref));
				}
				this.trigger_inspect_listeners(prev_mob);
			}
		}
		if(dir.set_client_screen) {
			for(let [client, screen] of dir.set_client_screen) {
				let atoms = this.client_screens.get(client);
				if(!atoms) {
					atoms = [];
					this.client_screens.set(client, atoms);
				}
				atoms.length = 0;
				for(let item of screen) if(item) atoms.push(this.get_atom(item));
			}
		}
		if(dir.client_del_images) {
			for(let [client, todel] of dir.client_del_images) {
				let images = this.client_images.get(client);
				if(!images) images = new Set();
				for(let image of todel) images.delete(image);
				this.client_images.set(client, images);
			}
		}
		if(dir.client_add_images) {
			for(let [client, toadd] of dir.client_add_images) {
				let images = this.client_images.get(client);
				if(!images) images = new Set();
				for(let image of toadd) images.add(image);
				this.client_images.set(client, images);
			}
		}
	}

	get_chat_messages(target : string|undefined, start : number = 0, end : number = this.frames.length) {
		start = Math.max(0, start);
		end = Math.min(end, this.frames.length);
		let messages : {message: string|{text?:string,html?:string}, frame_index: number, time: number}[] = [];
		for(let i = start; i < end; i++) {
			let frame = this.frames[i];
			if(!frame.chat) continue;
			for(let chat of frame.chat) {
				if(chat.clients.includes(target) || chat.clients.includes("world")) {
					messages.push({
						message: chat.message,
						frame_index: i,
						time: frame.time
					});
				}
			}
		}
		return messages;
	}

	private frame_listeners = new Set<(chat_frame : number) => Promise<void>>();
	add_frame_listener(callback : Comlink.Remote<(chat_frame : number) => Promise<void>>) {
		let despammed_callback = despam_promise(callback);
		this.frame_listeners.add(despammed_callback);
		despammed_callback(this.frame_index);
		return Comlink.proxy(() => {
			this.frame_listeners.delete(despammed_callback);
			callback[Comlink.releaseProxy]();
		});
	}

	private inspect_listeners = new Map<Atom, Array<()=>Promise<void>>>();
	add_inspect_listener(ref : number, callback : Comlink.Remote<(data : InspectData) => Promise<void>>) {
		let atom = this.get_atom(ref);
		let despammed_callback = despam_promise(async () => {
			let obj : InspectData = {
				name: atom.appearance?.name ?? "null",
				ref,
				clients: this.get_object_clients(atom),
				loc: atom.loc ? {name: atom.loc.appearance?.name ?? "null", ref: atom.loc.ref} : null,
				contents: atom.contents.map(thing => ({name: thing.appearance?.name ?? "null", ref: thing.ref}))
			};
			try {
				await callback(obj);
			} catch(e) {
				console.error(e);
			}
		});
		despammed_callback();
		let listeners_list = this.inspect_listeners.get(atom);
		if(!listeners_list) this.inspect_listeners.set(atom, listeners_list = []);
		listeners_list.push(despammed_callback);
		
		return Comlink.proxy(() => {
			let index = listeners_list?.indexOf(despammed_callback) ?? -1;
			if(index >= 0) listeners_list?.splice(index, 1);
			if(!listeners_list?.length && this.inspect_listeners.get(atom) == listeners_list) this.inspect_listeners.delete(atom);
			callback[Comlink.releaseProxy]();
		});
	}
	trigger_inspect_listeners(atom? : Atom|null) {
		if(!atom) return;
		let listeners = this.inspect_listeners.get(atom);
		if(listeners) for(let listener of listeners) listener();
	}

	get_object_clients(thing : Atom) : string[] {
		if((thing.ref >> 24) != 3) return [];
		let clients = [];
		for(let [client, atom] of this.client_mobs) {
			if(atom == thing && this.clients.has(client)) {
				clients.push(client);
			}
		}
		return clients;
	}

	get_objects_through_point(x : number, y : number) {
		let things : {
			name: string,
			ref: number,
			clients: string[]
		}[] = [];
		let included_things = new Set<Atom>();
		let turf = this.get_turf(Math.floor(x), Math.floor(y), this.z_level);
		if(turf) {
			included_things.add(turf);
			things.push({name: turf.appearance?.name ?? "null", ref: turf.ref, clients: []});
			/*for(let obj of turf.contents) {
				things.push({name: obj.appearance?.name ?? "null", ref: obj.ref, clients: this.get_object_clients(obj)});
			}*/
		}
		for(let thing of this.last_objects) {
			let atom = thing.get_click_target();
			if(!atom || included_things.has(atom)) continue;
			let [ox, oy] = thing.get_offset(this);
			let appearance = thing.get_appearance(this);
			if(appearance && Appearance.check_appearance_click(appearance, x*32-ox, y*32-oy, true)) {
				included_things.add(atom);
				things.push({name: atom.appearance?.name ?? "null", ref: atom.ref, clients: this.get_object_clients(atom)});
			}
		}
		things.reverse();
		return things;
	}

	get_clicked_object_ref(x : number, y : number) {
		let objs = this.last_objects;
		for(let i = objs.length-1; i >= 0; i--) {
			let thing = objs[i];
			let atom = thing.get_click_target();
			if(!atom) continue;
			let [ox, oy] = thing.get_offset(this);
			let appearance = thing.get_appearance(this);
			if(appearance && Appearance.check_appearance_click(appearance, x*32-ox, y*32-oy, false)) {
				return atom.ref;
			}
		}
		return undefined;
	}

	get_clients_mobs() {
		let clients : {name: string, ref: number, ckey: string}[] = [];
		for(let client of [...this.clients].sort()) {
			let mob = this.client_mobs.get(client);
			clients.push({
				name: mob?.appearance?.name ?? "null",
				ref: mob?.ref ?? 0,
				ckey: client
			});
		}
		return clients;
	}

	get_atom(ref : number) {
		let type = (ref & 0xFF000000) >>> 24;
		let index = (ref & 0xFFFFFF);
		let list = this.atoms[type];
		if(!list) {
			list = this.atoms[type] = [];
		}
		let atom = list[index];
		if(!atom) {
			if(type == 1) {
				let x = (index % this.maxx) + 1;
				let d = Math.floor(index / this.maxx);
				let y = (d % this.maxy) + 1;
				let z = Math.floor(d / this.maxy) + 1;
				atom = new Turf(ref, x, y, z);

			} else if(type == 3) {
				atom = new Mob(ref);
			} else if(type == 2) {
				atom = new Obj(ref);
			} else if(type == 0xD) {
				atom = new ImageOverlay(ref);
			} else atom = new Atom(ref);
			list[index] = atom;
		}
		return atom;
	}

	get_turf(x : number, y : number, z : number) : Turf|undefined {
		if(x < 1 || x > this.maxx) return;
		if(y < 1 || y > this.maxy) return;
		if(z < 1 || z > this.maxz) return;
		let ref = 0x01000000 + (x-1) + ((y-1) + (z-1) * this.maxy) * this.maxx;
		return this.get_atom(ref) as Turf;
	}

	get_resource(id : number) : Resource {
		let res = this.resources[id];
		if(!res) {
			res = new Resource(id);
			res.icon_load_callbacks.push(() => {this.change_counter++;});
			this.resources[id] = res;
		}
		return res;
	}

	get_resource_blob(id : number) : Promise<Blob> {
		return this.get_resource(id).blob_promise();
	}

	show_darkness = true;
	toggle_darkness() {
		this.show_darkness = !this.show_darkness;
		this.change_counter++;
	}
	
	/**
	 * Adjust the see_invisibility that you can see on the replay viewer through the vision menu. Invisibility flags is how some objects and items are invisible
	to mobs. Like regular living players not being able to see ghosts, or cables under floor tiles
	 * @param vision_setting a number to determine the sight flag for the viewer. the SeeInvisibility enum has all the relevant vision flag settings
	 */
	set_see_invisible(vision_setting: number = SeeInvisibility.SEE_INVISIBLE_OBSERVER) {
		this.see_invisible = vision_setting;
		this.change_counter++;
	}
}

export abstract class Renderable {
	abstract get_appearance(player:DemoPlayer, see_invisible? : number) : Appearance|null;
	get_offset(player:DemoPlayer) : [number,number] {return [0,0];}
	get_click_target() : Atom|null {return null;};
	is_screen_obj() : boolean {return false;}

	floating_overlays? : OverlayProxy[] & {appearance_from? : Appearance|null};
	get_floating_overlays(player:DemoPlayer, see_invisible? : number) : OverlayProxy[] {
		let appearance = this.get_appearance(player, see_invisible);
		if(appearance) Appearance.get_appearance_parts(appearance);
		if(!appearance?.floating_appearances?.length) {
			this.floating_overlays = undefined;
			return empty_arr;
		}
		if(appearance != this.floating_overlays?.appearance_from) {
			if(!this.floating_overlays) this.floating_overlays = [];
			
			while(appearance.floating_appearances.length > this.floating_overlays.length) {
				this.floating_overlays.push(new OverlayProxy(this));
			}
			this.floating_overlays.length = appearance.floating_appearances.length;
			this.floating_overlays.appearance_from = appearance;
			for(let i = 0; i < this.floating_overlays.length; i++) {
				this.floating_overlays[i].appearance = appearance.floating_appearances[i];
			}
		}
		return this.floating_overlays;
	}
}

export class Atom extends Renderable {
	appearance: Appearance|null = null;
	animation : DemoAnimation|null = null;
	private _loc: Atom|null = null;
	contents: Atom[] = [];
	image_objects: ImageOverlay[] = [];
	vis_contents: Atom[] = empty_arr;
	anim_appearance : Appearance&{animate_time: number}|null = null;
	combined_appearance : (Appearance & {vis_contents_appearances : Appearance[]})|null = null;
	constructor(public ref: number) {super()}
	set loc(val : Atom|null) {
		if(val == this._loc) return;
		if(this._loc) {
			let index = this._get_loc_contents(this._loc).indexOf(this);
			if(index >= 0) this._get_loc_contents(this._loc).splice(index, 1);
		}
		this._loc = val;
		if(val) {
			this._get_loc_contents(val).push(this);
		}
	}
	get loc() {return this._loc;}
	protected _get_loc_contents(atom : Atom) : Atom[] {return atom.contents;}

	get_offset(player:DemoPlayer) : [number,number]  {
		if(this._loc instanceof Turf) {
			return this._loc.get_offset(player);
		}
		return [0,0];
	}

	get_click_target() : Atom|null {return this;}

	get_appearance(player: DemoPlayer, see_invisible = 101, vis_contents_depth = 100): Appearance | null {
		if(vis_contents_depth <= 0) {
			console.warn(`Deep (possibly looping) vis_contents/images detected at [0x${this.ref.toString(16)}]. Pruning.`);
			this.vis_contents = empty_arr;
		}
		if(!this.appearance) {
			this.combined_appearance = null;
			return null;
		}
		let base_appearance = this.appearance;
		if(this.animation && player.time >= this.animation.start_time && player.time < this.animation.chain_end_time) {
			if(this.anim_appearance && this.anim_appearance.animate_time == player.time && this.anim_appearance.derived_from == base_appearance) {
				base_appearance = this.anim_appearance;
			} else {
				this.anim_appearance = base_appearance = animate_appearance(this.animation, base_appearance, player.time);
			}
		} else {
			this.anim_appearance = null;
		}
		if(this.vis_contents.length || this.image_objects.length) {
			let vis_contents_appearances : Appearance[] = [];
			let overridden = false;
			for(let thing of this.image_objects) {
				if(!(player.current_images?.has(thing.ref))) continue;
				let appearance = thing.get_appearance(player, vis_contents_depth-1, see_invisible);
				if(appearance) {
					if(appearance.override) overridden = true;
					vis_contents_appearances.push(appearance);
				}
			}
			if(base_appearance.invisibility <= see_invisible) {
				for(let thing of this.vis_contents) {
					let appearance = thing.get_appearance(player, vis_contents_depth - 1);
					if(appearance && appearance.invisibility <= see_invisible) vis_contents_appearances.push(appearance);
				}
			}
			if(!vis_contents_appearances.length) {
				this.combined_appearance = null;
				return base_appearance;
			}
			let matches = true;
			if(!this.combined_appearance || this.combined_appearance.derived_from != base_appearance || vis_contents_appearances.length != this.combined_appearance.vis_contents_appearances.length) {
				matches = false;
			} else {
				for(let i = 0; i < vis_contents_appearances.length; i++) {
					if(vis_contents_appearances[i] != this.combined_appearance.vis_contents_appearances[i]) {
						matches = false;
						break;
					}
				}
			}
			if(!matches || !this.combined_appearance) {
				this.combined_appearance = {
					...base_appearance,
					overlays: [...base_appearance.overlays, ...vis_contents_appearances],
					derived_from: base_appearance,
					vis_contents_appearances
				}
				if(base_appearance.invisibility > see_invisible || overridden) {
					this.combined_appearance.invisibility = 0;
					this.combined_appearance.overlays = vis_contents_appearances;
					this.combined_appearance.underlays = empty_arr;
					this.combined_appearance.icon = null;
					this.combined_appearance.icon_state = "";
					this.combined_appearance.icon_state_dir = undefined;
				}
				if(this.combined_appearance.floating_appearances) this.combined_appearance.floating_appearances = undefined;
				if(this.combined_appearance.sorted_appearances) this.combined_appearance.sorted_appearances = undefined;
			}
			return this.combined_appearance;
		} else {
			this.combined_appearance = null;
			return base_appearance;
		}
	}
}

export class Obj extends Atom {
	last_loc : Atom|null = null;
	loc_change_time : number = 0;

	get_offset(player:DemoPlayer) : [number,number] {
		let [x,y] = super.get_offset(player);
		let loc = this.loc;
		if(!this.appearance || !this.appearance.animate_movement || !(this.last_loc instanceof Turf) || !(loc instanceof Turf) || loc == this.last_loc || loc.z != this.last_loc.z || player.time < this.loc_change_time) return [x,y];
		let [px,py] = this.last_loc.get_offset(player);
		let dx = px-x;
		let dy = py-y;
		if(Math.abs(dx) > 32 || Math.abs(dy) > 32) {
			this.last_loc = null;
			return [x,y];
		}
		let distance;
		if(this.appearance.appearance_flags & LONG_GLIDE) {
			distance = Math.max(Math.abs(dx),Math.abs(dy));
		} else {
			distance = Math.sqrt(dx*dx+dy*dy);
		}
		if(distance == 0) return [x,y];
		let glide_size = this.appearance.glide_size;
		let glide_duration = distance / glide_size * 0.5;
		let fac = Math.max(0, 1 - (player.time - this.loc_change_time) / glide_duration);
		return [
			x + (dx * fac),
			y + (dy * fac)
		];
	}
}

export class Mob extends Obj {
	sight = 0;
	see_invisible = 0;
}

export class ImageOverlay extends Atom {
	protected _get_loc_contents(atom : Atom) : Atom[] {atom.combined_appearance = null; return atom.image_objects;}
}

export class OverlayProxy extends Renderable {
	constructor(public parent: Renderable) {super();}
	appearance: Appearance|null = null;

	get_offset(player:DemoPlayer) : [number,number]  {
		return this.parent.get_offset(player);
	}
	get_appearance(player: DemoPlayer, see_invisible = 101): Appearance | null {
		return this.appearance;
	}
	is_screen_obj(): boolean {
		return this.parent.is_screen_obj();
	}
}

export class ScreenProxy extends Renderable {
	constructor(public parent: Renderable, public screen_x : number, public screen_y : number) {super();}
	get_offset(player:DemoPlayer) : [number,number] {
		return [this.screen_x, this.screen_y];
	}
	appearance : Appearance|null = null;
	get_appearance(player: DemoPlayer, see_invisible? : number): Appearance | null {
		let base_appearance = this.parent.get_appearance(player, see_invisible);
		if(!base_appearance || (
			base_appearance.pixel_x == 0
			&&base_appearance.pixel_y == 0
			&&base_appearance.pixel_w == 0
			&&base_appearance.pixel_z == 0
		)) {
			this.appearance = null;
			return base_appearance;
		}
		if(base_appearance == this.appearance?.derived_from) {
			return this.appearance;
		}
		let appearance : Appearance = {
			...base_appearance,
			derived_from: base_appearance
		};
		if(appearance.sorted_appearances) appearance.sorted_appearances = undefined;
		if(appearance.floating_appearances) appearance.floating_appearances = undefined;
		appearance.pixel_x = 0;
		appearance.pixel_y = 0;
		appearance.pixel_z = 0;
		appearance.pixel_w = 0;
		this.appearance = appearance;
		return appearance;
	}
	is_screen_obj(): boolean {
		return true;
	}
}

export class Turf extends Atom {
	constructor(
		ref : number,
		public x : number,
		public y : number,
		public z : number,
	) {super(ref);}
	get_offset(player:DemoPlayer) : [number,number]  {return [32*this.x, 32*this.y];}
}

export interface InspectData {
	name: string;
	ref: number;
	clients: string[];
	loc: {
		name: string;
		ref: number;
	}|null;
	contents: {name: string; ref: number}[];
};

class PackingRect {
	constructor(
		public x:number,
		public y:number,
		public width:number,
		public height:number,
		public vertical:boolean
	) {}

	line_thickness = 0;
	line_length = 0;

	allocate(width:number, height:number) : {x:number,y:number,width:number,height:number}|undefined {
		if(width > this.width || height > this.height) return undefined;
		if(this.vertical) {
			if((this.width - this.line_thickness) < width && (this.height - this.line_length) < height) return;
			if((this.height - this.line_length) >= height) {
				let y = this.line_length + this.y;
				this.line_length += height;
				this.line_thickness = Math.max(this.line_thickness, width);
				return {
					x: this.x, y, width, height
				};
			} else {
				this.x += this.line_thickness;
				this.line_length = height;
				this.line_thickness = width;
				return {x: this.x, y: this.y, width, height};
			}
		} else {
			if((this.width - this.line_length) < width && (this.height - this.line_thickness) < height) return;
			if((this.width - this.line_length) >= width) {
				let x = this.line_length + this.x;
				this.line_length += width;
				this.line_thickness = Math.max(this.line_thickness, height);
				return {
					x, y: this.y, width, height
				};
			} else {
				this.y += this.line_thickness;
				this.line_length = width;
				this.line_thickness = height;
				return {x: this.x, y: this.y, width, height};
			}
		}
	}
}
