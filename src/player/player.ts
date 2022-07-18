import * as Comlink from "comlink";
import { DemoPlayerUi } from "../main/ui";
import { Appearance, TransitionalAppearance } from "../misc/appearance";
import { DemoFrame, DemoFrameDirection, ReaderDemoFrameDirection, TransitionalDemoFrame, TransitionalDemoFrameDirection } from "../parser/base_parser";
import { DemoParserInterface } from "../parser/interface";
import { IconLoader } from "./rendering/icon_loader";
import { Resource } from "./resource";
import { DmiAtlas } from "./rendering/atlas";
import { IconState, IconStateDir } from "./rendering/icon";
import { CmdViewport, FollowDesc, RenderingCmd } from "./rendering/commands";
import { DrawBuffer } from "./rendering/buffer";
import { LONG_GLIDE, RESET_ALPHA, RESET_COLOR, RESET_TRANSFORM } from "../misc/constants";
import { matrix_is_identity, matrix_multiply } from "../misc/matrix";
import { despam_promise } from "../misc/promise_despammer";

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

	ui : Comlink.Remote<DemoPlayerUi>|undefined;

	resources : Array<Resource|undefined> = [];
	rev_data : string|undefined;
	chat_css : Promise<string>;
	icon_loader : IconLoader;

	z_level = 2;
	use_index=0;

	change_counter = 0;

	constructor(parser_endpoint : Comlink.Endpoint, icon_loader : MessagePort) {
		//@ts-ignore
		self.demo_player = this;
		this.parser_interface = Comlink.wrap(parser_endpoint);
		this.icon_loader = Comlink.wrap<IconLoader>(icon_loader);

		this.parser_interface.consume_data(Comlink.proxy(async (data) => {
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
						if(res_load.path.startsWith(paintings_pattern)) {
							res.load_url = "https://cdn.yogstation.net/paintings/" + res_load.path.substring(paintings_pattern.length);
						} else {
							res.load_url = "https://cdn.jsdelivr.net/gh/yogstation13/yogstation@" + (this.rev_data || "master") + "/" + res_load.path;
						}
					}
				}
				res.update();
			}
			if(this.ui) this.ui.update_duration(this.get_demo_duration());
			this.advance_time();
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
	}

	adjust_z(adj : number) {
		this.z_level += adj;
		if(this.z_level < 1) this.z_level = 1;
		if(this.z_level > this.maxz) this.z_level = this.maxz;
		this.ui?.update_hash(this.z_level);
	}

	last_state_str = "";
	last_objects : Renderable[] = [];
	current_turfs = new Set<Turf>();
	run_frame(dt : number, playback_speed : number, turf_window:{left:number,right:number,top:number,bottom:number,pixel_scale:number,follow?:FollowDesc}, canvas_draw_list : {ref:number, width:number, height:number}[]) : RenderingCmd[] {
		if(playback_speed != 0)
			this.advance_time_relative(dt / 100 * playback_speed);

		let follow_data : {ref:number|string,x:number,y:number}|undefined;
		if(turf_window.follow) {
			let iterated_set = new Set()
			let ref = turf_window.follow.ref;
			let atom = typeof ref == "string" ? this.client_mobs.get(ref) : (ref ? this.get_atom(ref) : null);
			while(atom && !(atom.loc instanceof Turf)) {
				if(iterated_set.has(atom)) atom = null;
				else {
					iterated_set.add(atom);
					atom = atom.loc;
				}
			}
			if(atom && atom.loc instanceof Turf) {
				let [x,y] = atom.get_offset(this);
				if(atom.appearance) {
					let bounds = Appearance.get_display_boundary(atom.appearance);
					x += bounds.x + bounds.width/2;
					y += bounds.y + bounds.height/2;
				} else {
					x += 16;
					y += 16;
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
				if(turf.appearance) {
					objects.push(thing);
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
		this.draw_object_list(drawing_commands, objects);
		drawing_commands.push({cmd: "copytoviewport", follow_data});
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
			let atom_bounds = atom.appearance ? Appearance.get_display_boundary(atom.appearance) : {x:0,y:0,width:32,height:32};
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
		for(let command of commands) if(command.transferables) transferables.push(...command.transferables);
		return Comlink.transfer(commands, transferables);
	}
	
	draw_buffer = new DrawBuffer();
	draw_object_list(commands : RenderingCmd[], objects : Renderable[], see_invisible = 60) {
		let buffer = this.draw_buffer;
		let buffer_index = 0;
		objects.sort((a, b) => {
			let a_plane = Appearance.resolve_plane(a.appearance?.plane ?? 0);
			let b_plane = Appearance.resolve_plane(b.appearance?.plane ?? 0);
			if(a_plane != b_plane) return a_plane - b_plane;
			let a_layer = a.appearance?.layer ?? 0;
			let b_layer = b.appearance?.layer ?? 0;
			return a_layer - b_layer;
		});

		for(let thing of objects) {
			let [x,y] = thing.get_offset(this);
			let root_appearance = thing.appearance;
			if(!root_appearance || root_appearance.invisibility > see_invisible) continue;
			for(let appearance of Appearance.get_appearance_parts(root_appearance)) {
				if(!appearance.icon_state_dir) {
					let dir = this.get_appearance_dir(appearance);
					if(dir) {
						appearance.icon_state_dir = dir;
					}
				}
				if(appearance.icon_state_dir?.atlas_node) {
					if(buffer.atlas != appearance.icon_state_dir.atlas_node?.atlas) {
						if(buffer_index) {
							buffer.add_draw(commands, 0, buffer_index);
							buffer_index = 0;
						}
						buffer.atlas = appearance.icon_state_dir.atlas_node?.atlas as DmiAtlas;
					}
					appearance.icon_state_dir.atlas_node.use_index = this.use_index;
					if(buffer_index >= buffer.get_size()) buffer.expand();
					buffer.write_appearance(buffer_index++, appearance, x, y);
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

		let dir_index = [0,1,0,0,2,6,4,2,3,7,5,3,2,1,0,0][appearance.dir] ?? 0;
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

	get_demo_duration() {
		return this.frames.length ? this.frames[this.frames.length-1].time : 0;
	}

	initialize_ui() {
		if(!this.ui) return;
		this.ui.update_time(this.time);
		this.ui.update_duration(this.get_demo_duration());
	}

	advance_time_relative(dt : number) {
		let time = this.time;
		let demo_duration = this.get_demo_duration();
		if(dt < 0) time = Math.min(time+dt, demo_duration);
		else if(dt > 0 && time >= demo_duration) return;
		else time = Math.max(Math.min(time+dt, demo_duration), time);
		this.advance_time(time);
	}

	advance_time(new_time : number = this.time) {
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
				this.apply_frame(this.frames[this.frame_index]);
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

	private apply_frame(frame : DemoFrame) {
		this.apply_frame_direction(frame, frame.forward, true);
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
	}

	get_chat_messages(target : string = "world", start : number = 0, end : number = this.frames.length) {
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
			if(thing.appearance && Appearance.check_appearance_click(thing.appearance, x*32-ox, y*32-oy, true)) {
				included_things.add(atom);
				things.push({name: atom.appearance?.name ?? "null", ref: atom.ref, clients: this.get_object_clients(atom)});
			}
		}
		things.reverse();
		return things;
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

			} else if(type == 3 || type == 2) {
				atom = new Obj(ref);
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
}

export abstract class Renderable {
	abstract appearance : Appearance|null;
	get_offset(player:DemoPlayer) : [number,number] {return [0,0];}
	get_click_target() : Atom|null {return null;};
}

export class Atom extends Renderable {
	appearance: Appearance|null = null;
	private _loc: Atom|null = null;
	contents: Atom[] = [];
	constructor(public ref: number) {super()}
	set loc(val : Atom|null) {
		if(val == this._loc) return;
		if(this._loc) {
			let index = this._loc.contents.indexOf(this);
			if(index >= 0) this._loc.contents.splice(index, 1);
		}
		this._loc = val;
		if(val) {
			val.contents.push(this);
		}
	}
	get loc() {return this._loc;}

	get_offset(player:DemoPlayer) : [number,number]  {
		if(this._loc instanceof Turf) {
			return this._loc.get_offset(player);
		}
		return [0,0];
	}

	get_click_target() : Atom|null {return this;}
}

export class Obj extends Atom {
	last_loc : Atom|null = null;
	loc_change_time : number = 0;

	get_offset(player:DemoPlayer) : [number,number] {
		let [x,y] = super.get_offset(player);
		let loc = this.loc;
		if(!this.appearance || !(this.last_loc instanceof Turf) || !(loc instanceof Turf) || loc == this.last_loc || loc.z != this.last_loc.z || player.time < this.loc_change_time) return [x,y];
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

export class OverlayProxy extends Renderable {
	constructor(public parent: Renderable) {super();}
	appearance: Appearance|null = null;

	get_offset(player:DemoPlayer) : [number,number]  {
		return this.parent.get_offset(player);
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
