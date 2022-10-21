import { Appearance, BaseAppearance, ReaderAppearance } from "../misc/appearance";
import { RevData } from "./interface";

const empty_arr : [] = [];

export abstract class DemoParser {
	abstract handle_data(data : Uint8Array) : void|Promise<void>;

	running_atoms : Array<Array<RunningAtom|undefined>|undefined> = [];
	running_size : [number,number,number] = [0,0,0];
	running_clients : Set<string> = new Set();
	running_client_mobs : Map<string,number> = new Map();
	running_client_screens : Map<string, number[]> = new Map();

	duration : number = 0;
	current_frame : ReaderDemoFramePartial;
	frames : ReaderDemoFrame[] = [];
	constructor(protected frame_callbacks : Array<() => void>, protected set_rev_data : (rev:RevData) => void) {
		this.current_frame = {
			time: 0,
			forward: {}
		};
		
		// @ts-ignore
		self.demo_parser = this;
	}

	progress_callback : ((progress:number, done:boolean) => Promise<void>)|undefined;
	private last_progress = -1;
	protected update_progress(progress:number, done = false) {
		if(!this.progress_callback) return;
		if(progress < this.last_progress + 0.005 && !done) return;
		this.last_progress = progress;
		this.progress_callback(progress, done);
	}

	push_frame(new_time? : number) {
		if(new_time == undefined) new_time = this.current_frame.time;
		if(new_time < this.current_frame.time) throw new Error(`Can't go back in time, dummy. Old time is ${this.current_frame.time}, attempted to go back to ${new_time}`);
		if(!is_frame_empty(this.current_frame)) {
			let frame : ReaderDemoFrame = {...this.current_frame, backward: {}};
			if(frame.forward.set_appearance) {
				frame.backward.set_appearance = new Map();
				for(let [atom, appearance] of frame.forward.set_appearance) {
					let running = this.get_running_atom(atom);
					frame.backward.set_appearance.set(atom, running.appearance);
					running.appearance = appearance;
				}
			}
			if(frame.forward.set_loc) {
				frame.backward.set_loc = new Map();
				if(!frame.backward.set_last_loc) frame.backward.set_last_loc = new Map();
				if(!frame.backward.set_loc_change_time) frame.backward.set_loc_change_time = new Map();
				for(let [atom, loc] of frame.forward.set_loc) {
					let running = this.get_running_atom(atom);
					frame.backward.set_loc.set(atom, running.loc);
					frame.backward.set_last_loc.set(atom, running.last_loc);
					frame.backward.set_loc_change_time.set(atom, running.loc_change_time);
					running.loc_change_time = this.current_frame.time;
					running.last_loc = running.loc;
					running.loc = loc;
				}
			}
			if(frame.forward.set_vis_contents) {
				frame.backward.set_vis_contents = new Map();
				for(let [atom, vis_contents] of frame.forward.set_vis_contents) {
					let running = this.get_running_atom(atom);
					frame.backward.set_vis_contents.set(atom, running.vis_contents);
					running.vis_contents = vis_contents;
				}
			}
			if(frame.forward.set_client_status) {
				frame.backward.set_client_status = new Map();
				for(let [client, status] of frame.forward.set_client_status) {
					frame.backward.set_client_status.set(client, this.running_clients.has(client));
					if(status) this.running_clients.add(client);
					else this.running_clients.delete(client);
				}
			}
			if(frame.forward.set_mob) {
				frame.backward.set_mob = new Map();
				for(let [client, mob] of frame.forward.set_mob) {
					frame.backward.set_mob.set(client, this.running_client_mobs.get(client) ?? 0);
					this.running_client_mobs.set(client, mob);
				}
			}
			if(frame.forward.set_mobextras) {
				frame.backward.set_mobextras = new Map();
				for(let [atom, extras] of frame.forward.set_mobextras) {
					let running = this.get_running_atom(atom);
					frame.backward.set_mobextras.set(atom, {see_invisible: running.see_invisible, sight: running.sight});
					running.see_invisible = extras.see_invisible;
					running.sight = extras.sight;
				}
			}
			if(frame.forward.set_client_screen) {
				frame.backward.set_client_screen = new Map();
				for(let [client, screen] of frame.forward.set_client_screen) {
					frame.backward.set_client_screen.set(client, this.running_client_screens.get(client) ?? []);
					this.running_client_screens.set(client, screen);
				}
			}
			if(frame.forward.set_animation) {
				frame.backward.set_animation = new Map();
				for(let [atom, animation] of frame.forward.set_animation) {
					let running = this.get_running_atom(atom);
					frame.backward.set_animation.set(atom, running.animation);
					running.animation = animation;
				}
			}
			frame.backward.client_del_images = frame.forward.client_add_images;
			frame.backward.client_add_images = frame.forward.client_del_images;
			if(frame.forward.resize) {
				frame.backward.resize = this.running_size;
				this.running_size = frame.forward.resize;
			}
			this.frames.push(frame);
		}
		this.duration = this.current_frame.time;
		this.current_frame = {
			time: new_time,
			forward: {}
		};
		for(let callback of this.frame_callbacks) callback();
		this.frame_callbacks.length = 0;
	}

	protected get_running_atom(atom : number) : RunningAtom {
		let type = (atom & 0xFF000000) >>> 24;
		let index = (atom & 0xFFFFFF);
		let list = this.running_atoms[type];
		if(!list) {
			list = this.running_atoms[type] = [];
		}
		let running = list[index];
		if(!running) {
			running = list[index] = {
				appearance: null,
				loc: 0,
				loc_change_time: 0,
				last_loc: 0,
				vis_contents: empty_arr,
				animation: null,
				sight: 0,
				see_invisible: 0
			};
		}
		return running;
	}
	protected set_appearance(atom: number, appearance: number|null) {
		if(!this.current_frame.forward.set_appearance) this.current_frame.forward.set_appearance = new Map();
		this.current_frame.forward.set_appearance.set(atom, appearance);
	}
	protected set_loc(atom: number, loc: number) {
		if(!this.current_frame.forward.set_loc) this.current_frame.forward.set_loc = new Map();
		this.current_frame.forward.set_loc.set(atom, loc);
	}
	protected set_client_status(client : string, status : boolean) {
		if(!this.current_frame.forward.set_client_status) this.current_frame.forward.set_client_status = new Map();
		this.current_frame.forward.set_client_status.set(client, status);
	}
	protected set_mob(client : string, mob : number) {
		if(!this.current_frame.forward.set_mob) this.current_frame.forward.set_mob = new Map();
		this.current_frame.forward.set_mob.set(client, mob);
	}
	protected set_client_screen(client : string, screen : number[]) {
		if(!this.current_frame.forward.set_client_screen) this.current_frame.forward.set_client_screen = new Map();
		this.current_frame.forward.set_client_screen.set(client, screen);
	}
	protected set_animation(atom: number, animation: ReaderDemoAnimation|null) {
		if(!this.current_frame.forward.set_animation) this.current_frame.forward.set_animation = new Map();
		this.current_frame.forward.set_animation.set(atom, animation);
	}
	protected resize(maxx:number, maxy:number, maxz:number) {
		this.push_frame();
		this.current_frame.forward.resize = [maxx,maxy,maxz];
	}
	protected add_chat(msg : DemoChatMessage) {
		if(!this.current_frame.chat) this.current_frame.chat = [];
		this.current_frame.chat.push(msg);
	}
	protected set_vis_contents(atom:number, vis_contents: number[]) {
		if(vis_contents.length == 0) vis_contents = empty_arr;
		if(!this.current_frame.forward.set_vis_contents) this.current_frame.forward.set_vis_contents = new Map();
		this.current_frame.forward.set_vis_contents.set(atom, vis_contents);
	}
	protected set_mobextras(atom : number, extras : {sight:number, see_invisible:number}) {
		if(!this.current_frame.forward.set_mobextras) this.current_frame.forward.set_mobextras = new Map();
		this.current_frame.forward.set_mobextras.set(atom, extras);
	}

	private appearance_id_cache = new Map<string, number>();
	appearance_cache : ReaderAppearance[] = [];

	protected appearance_id(a : ReaderAppearance) : number;
	protected appearance_id(a : null) : null;
	protected appearance_id(a : ReaderAppearance|null) : number|null;
	protected appearance_id(a : ReaderAppearance|null) : number|null {
		if(a == null) return null;
		let str = JSON.stringify(Object.values(a));
		let id = this.appearance_id_cache.get(str);
		if(id != undefined) {
			return id;
		}
		id = this.appearance_cache.length;
		this.appearance_id_cache.set(str, id);
		this.appearance_cache.push(a);
		return id;
	}
	protected appearance_from_id(a : number|null) : ReaderAppearance|null {
		if(a == null) return null;
		return this.appearance_cache[a];
	}

	resource_loads : ResourceLoadInfo[] = [];
}

function is_frame_empty(frame : ReaderDemoFramePartial) {
	for(let key of Object.keys(frame.forward)) return false;
	if(frame.chat) return false;
	return true;
}

export interface BaseDemoFramePartial<T> {
	time: number;
	forward: BaseDemoFrameDirection<T>;
	chat?: DemoChatMessage[];
	sounds? : DemoSound[];
	size_stats? : (number|undefined)[];
}
export interface BaseDemoFrame<T> extends BaseDemoFramePartial<T> {
	backward: BaseDemoFrameDirection<T>;
}
export interface BaseDemoFrameDirection<T> {
	set_appearance? : Map<number, T|null>;
	set_loc? : Map<number, number>;
	set_last_loc? : Map<number,number>;
	set_loc_change_time? : Map<number,number>;
	set_client_status? : Map<string, boolean>;
	set_mob? : Map<string, number>;
	set_client_screen? : Map<string, number[]>;
	set_vis_contents? : Map<number,number[]>;
	set_mobextras? : Map<number, {sight:number, see_invisible:number}>;
	set_animation? : Map<number, BaseDemoAnimation<T>|null>;
	client_add_images? : Map<string, Set<number>>;
	client_del_images? : Map<string, Set<number>>;
	resize? : [number,number,number];
}
export interface BaseDemoAnimation<T> {
	loop: number;
	parallel: boolean;
	end_now: boolean;
	start_time: number;
	end_time: number;
	chain_end_time: number;
	chain_parent: BaseDemoAnimation<T>|null;
	base_appearance: T;
	end_appearance: T;
	frames: BaseDemoAnimationFrame<T>[];
	duration: number;
}
export interface BaseDemoAnimationFrame<T> {
	appearance: T;
	time: number;
	easing: number;
	linear_transform: boolean;
}
export interface DemoChatMessage {
	clients : Array<string|undefined>;
	message : string|{text?:string, html?:string};
}

export interface RunningAtom {
	appearance : number|null;
	loc : number;
	last_loc : number;
	loc_change_time : number;
	vis_contents : number[];
	animation: ReaderDemoAnimation|null;
	sight : number;
	see_invisible : number;
}

export interface ReaderDemoBatchData {
	frames : BaseDemoFrame<number>[];
	appearances : ReaderAppearance[];
	resource_loads: ResourceLoadInfo[];
}

export type ReaderDemoFramePartial = BaseDemoFramePartial<number>;
export type ReaderDemoFrame = BaseDemoFrame<number>;
export type ReaderDemoFrameDirection = BaseDemoFrameDirection<number>;
export type ReaderDemoAnimation = BaseDemoAnimation<number>;
export type ReaderDemoAnimationFrame = BaseDemoAnimationFrame<number>;

export type DemoFramePartial = BaseDemoFramePartial<Appearance>;
export type DemoFrame = BaseDemoFrame<Appearance>;
export type DemoFrameDirection = BaseDemoFrameDirection<Appearance>;
export type DemoAnimation = BaseDemoAnimation<Appearance>;
export type DemoAnimationFrame = BaseDemoAnimationFrame<Appearance>;

export type TransitionalDemoFrame = BaseDemoFrame<Appearance|number>;
export type TransitionalDemoFrameDirection = BaseDemoFrameDirection<Appearance|number>;

export interface ResourceLoadInfo {
	id : number;
	path? : string;
	blob? : Blob;
}

export interface DemoSound {
	recipients: (string | undefined)[];
	resources: number[];
	repeat: number;
	wait: boolean;
	status: number;
	channel: number;
	volume: number;
	frequency: number;
	pan: number;
	x: number;
	y: number;
	z: number;
	falloff: number;
}
