import { normalize_ref } from "../misc/ref";
import { ReaderAppearance } from "../misc/appearance";
import { DemoParser } from "./base_parser";
import { Planes } from "../misc/constants";

const MIN_VERSION = 1;
const MAX_VERSION = 1;

export class DemoParserText extends DemoParser {
	private text_decoder = new TextDecoder();
	private partial_line : string = "";
	private version = -1;
	private line_counter = 1;
	private maxx=0; private maxy=0; private maxz=0;
	private turf_levels_loaded=0;
	private obj_levels_loaded=0;
	private null_loaded=true;
	private last_chat : string = "";
	async handle_data(data : Uint8Array) {
		this.partial_line += this.text_decoder.decode(data, {stream: true});
		let lines = this.partial_line.split(/\r?\n/g);
		this.partial_line = lines[lines.length-1];
		lines.length--;
		for(let line of lines) {
			let should_wait = this.handle_line(line);
			if(should_wait) {
				await new Promise(resolve => setTimeout(resolve, 16));
			}
		}
	}
	private handle_line(line : string) : boolean {
		if(this.version < 0) {
			if(!line.startsWith("demo version ")) {
				throw new Error("No version");
			}
			let version = +line.split(" ")[2];
			if(!(version >= MIN_VERSION && version <= MAX_VERSION)) {
				throw new Error("Unsupported demo version " + version);
			}
			this.version = version;
			this.line_counter++;
			return false;
		} else if(this.turf_levels_loaded < this.maxz) {
			this.handle_turf_zlevel(line, ++this.turf_levels_loaded);
			this.line_counter++;
			this.push_frame();
			return true;
		} else if(this.obj_levels_loaded < this.maxz) {
			this.handle_obj_zlevel(line, ++this.obj_levels_loaded);
			this.line_counter++;
			this.push_frame();
			return true;
		} else if(!this.null_loaded && this.maxz) {
			this.handle_obj_zlevel(line, null);
			this.null_loaded = true;
			this.line_counter++;
			this.push_frame();
			this.update_progress(1, true);
			return true;
		}
		let command_resolve = /^([a-z]+) /i.exec(line);
		if(!command_resolve) throw new Error("Could not parse line: " + line);
		let command = command_resolve[1];
		let content = line.substring(command.length + 1);
		let p = new TextPointer(content, this.line_counter++, command.length + 1);

		if(command == "commit") {
			console.log("Commit " + content);
			this.set_rev_data({commit: content, repo: "yogstation13/Yogstation"});
		} else if(command == "init") {
			[this.maxx,this.maxy,this.maxz] = content.split(" ").map(s=>parseInt(s));
			this.resize(this.maxx,this.maxy,this.maxz);
			this.null_loaded = false;
		} else if(command == "time") {
			this.push_frame(+content);
		} else if(command == "new") {
			while(p.idx < p.txt.length) {
				let ref = p.read_ref();
				p.read_expected_char(' ');
				let loc = normalize_ref(p.read_loc(null), this.maxx, this.maxy);
				p.read_expected_char(' ');
				let appearance = this.read_appearance(p);

				this.set_appearance(ref, this.appearance_id(appearance));
				this.set_loc(ref, loc);
				if(p.curr() == ',') p.idx++;
			}
		} else if(command == "del") {
			while(p.idx < p.txt.length) {
				let ref = p.read_ref();
				if(p.curr() == ',') p.idx++;
				this.set_appearance(ref, null);
				this.set_loc(ref, 0);
			}
		} else if(command == "update") {
			while(p.idx < p.txt.length) {
				let ref = p.read_ref();
				p.read_expected_char(' ');
				let old_loc = this.current_frame.forward.set_loc?.get(ref) ?? this.get_running_atom(ref).loc;
				let loc = normalize_ref(p.read_loc(old_loc), this.maxx, this.maxy);
				p.read_expected_char(' ');
				let old_appearance = this.current_frame.forward.set_appearance?.get(ref);
				if(old_appearance === undefined) old_appearance = this.get_running_atom(ref).appearance;
				let appearance = this.appearance_id(this.read_appearance(p, this.appearance_from_id(old_appearance)));
				if(old_loc != loc) this.set_loc(ref, loc);
				if(old_appearance != appearance) this.set_appearance(ref, appearance);
				if(p.curr() == ',') p.idx++;
			}
		} else if(command == "turf") {
			while(p.idx < p.txt.length) {
				p.read_expected_char('(');
				let ref = normalize_ref(p.read_loc(null), this.maxx, this.maxy);
				p.read_expected_char(')');
				p.read_expected_char('=');

				let old_appearance = this.current_frame.forward.set_appearance?.get(ref);
				if(old_appearance === undefined) old_appearance = this.get_running_atom(ref).appearance;
				let appearance = this.appearance_id(this.read_appearance(p, this.appearance_from_id(old_appearance)));
				this.set_appearance(ref, appearance);
				if(p.curr() == ',') p.idx++;
			}
		} else if(command == "login") {
			this.set_client_status(content, true);
		} else if(command == "logout") {
			this.set_client_status(content, false);
			this.set_mob(content, 0);
		} else if(command == "setmob") {
			let space_index = content.indexOf(' ');
			if(space_index < 0) throw new Error("Setmob needs ckey and mob reference");
			p.idx = space_index + 1;
			let client = content.substring(0, space_index);
			let ref = p.read_ref();
			this.set_mob(client, ref);
		} else if(command == "chat") {
			let result = /^([^ ]+) (.+)$/.exec(content);
			if(!result) throw new Error("Malformed chat");
			let clients = result[1].split(",");
			let message = result[2];
			if(message == "=") {
				message = this.last_chat;
			} else {
				message = JSON.parse(message);
				this.last_chat = message;
			}
			this.add_chat({
				clients,
				message
			});
		} else {
			console.warn("Unrecognized command " + command);
		}
		return false;
	}
	private handle_turf_zlevel(line : string, level : number) {
		let p = new TextPointer(line, this.line_counter, 0);
		let base_turf_id = 0x01000000 + (level-1)*this.maxx*this.maxy;
		let turf_index = 0;
		let last_appearance : number|null = null;
		let last_wasspace = false;
		let zsize = this.maxx*this.maxy;
		while(p.idx < p.txt.length) {
			if('0123456789'.includes(p.curr())) {
				let amount = p.read_number();
				for(let j = 1; j < amount; j++) {
					if(last_wasspace) last_appearance = this.appearance_id(this.get_space_appearance((turf_index % this.maxx) + 1, Math.floor(turf_index / this.maxx) + 1, level));
					this.set_appearance(base_turf_id + (turf_index++), last_appearance);
				}
			} else {
				if(p.curr() == 's') {
					p.idx++;
					last_appearance = this.appearance_id(this.get_space_appearance((turf_index % this.maxx) + 1, Math.floor(turf_index / this.maxx) + 1, level));
					last_wasspace = true;
				} else {
					last_appearance = this.appearance_id(this.read_appearance(p, this.appearance_from_id(last_appearance), true));
					last_wasspace = false;
				}
				this.set_appearance(base_turf_id + (turf_index++), last_appearance);
			}
			this.update_progress(0.4 * ((level-1 + ((p.idx+1) / p.txt.length)) / this.maxz), false);
			if(turf_index > zsize) throw new Error(`Exceeded z-level size at ${p}`);
			if(p.curr() == ',') p.idx++;
		}
		if(turf_index != this.maxx*this.maxy) {
			throw new Error(`Z-level of size ${this.maxx}x${this.maxy} should have ${this.maxx*this.maxy} turfs, has ${turf_index} turfs`);
		}
	}
	private handle_obj_zlevel(line : string, level : number|null) {
		let p = new TextPointer(line, this.line_counter, 0);
		let base_turf_id = level === null ? 0 : 0x01000000 + (level-1)*this.maxx*this.maxy;
		let index = 0;
		while(p.idx < p.txt.length) {
			if('0123456789'.includes(p.curr())) {
				index += p.read_number();
			} else {
				this.read_init_obj(p, base_turf_id && (base_turf_id + index));
			}
			if(level != null) {
				this.update_progress(0.4 + 0.4 * ((level-1 + ((p.idx+1) / p.txt.length)) / this.maxz), false);
			} else {
				this.update_progress(0.8 + 0.2 * (((p.idx+1) / p.txt.length)), false);
			}
			if(index > this.maxx*this.maxy) throw new Error(`Exceeded z-level size at ${p}`);
			if(p.curr() == ',') p.idx++;
		}
	}
	private read_init_obj(p : TextPointer, loc : number) {
		let ref = p.read_ref();
		this.set_loc(ref, loc);
		p.read_expected_char('=');
		let appearance = this.read_appearance(p);
		this.set_appearance(ref, this.appearance_id(appearance));
		if(p.curr() == '(') {
			p.idx++;
			while(p.curr() != ')') {
				this.read_init_obj(p, ref);
				if(!'),'.includes(p.txt[p.idx])) throw new Error(`Expected ) or , at ${p}, found ${p.curr()} instead`);
				if(p.curr() == ',') {
					p.idx++;
				}
			}
			p.idx++;
		}
	}


	private icon_cache : Array<number|null> = [];
	private icon_state_caches : Array<string|null>[] = [];
	private name_cache : Array<string|null> = [];

	private resource_id_cache = new Map<string,number>();
	private resource_id_counter = 0;
	protected get_icon_resource(n : string|null) : number|null {
		if(n == null) return null;
		let id = this.resource_id_cache.get(n);
		if(id != undefined) return id;
		id = ++this.resource_id_counter;
		this.resource_id_cache.set(n, id);
		if(n) {
			this.resource_loads.push({id, path: n});
		}
		return id;
	}

	private get_space_appearance(x=0,y=0,z=0) : ReaderAppearance {
		return {
			...ReaderAppearance.base,
			icon: this.get_icon_resource('icons/turf/space.dmi'),
			icon_state: `${(((x + y) ^ ~(x * y) + z) % 25 + 25) % 25}`,
			name: 'space',
			layer: 1.8,
			plane: Planes.SPACE_PLANE,
		};
	}

	private read_appearance(p : TextPointer, comparison : ReaderAppearance|null = null, inherit_overlays=true) : ReaderAppearance|null {
		if(p.curr() == 'n') {
			p.idx++;
			return null;
		}
		if(p.curr() == '=') {
			p.idx++;
			return comparison;
		}
		if(p.curr() == 's' || p.curr() == 't') {
			let appearance : ReaderAppearance = {
				...ReaderAppearance.base,
				icon: this.get_icon_resource('icons/turf/space.dmi'),
				icon_state: '1',
				name: 'space',
				layer: 1.8,
				plane: Planes.SPACE_PLANE
			};
			if(p.curr() == 't') {
				p.idx++;
				appearance.dir = +p.curr();
				if(appearance.dir == 1) appearance.transform = [-1,0,0,0,-1,0];
				else if(appearance.dir == 4) appearance.transform = [0,-1,0,1,0,0];
				else if(appearance.dir == 8) appearance.transform = [0,1,0,-1,0,0];
				appearance.icon_state = 'speedspace_ns_?';
			}
			p.idx++;
			return appearance;
		}
		let appearance : ReaderAppearance;
		if(p.curr() == '~') {
			p.idx++;
			if(!comparison) {
				console.warn(`Comparison to null at ${p}`);
				appearance = {...ReaderAppearance.base};
			} else {
				appearance = {...comparison};
				if(!inherit_overlays) {
					appearance.overlays = [];
					appearance.underlays = [];
				}
			}
		} else {
			appearance = {...ReaderAppearance.base};
		}
		p.read_expected_char('{');
		if(p.curr() == '}') {p.idx++; return appearance;}
		let icon_state_cache : Array<string|null>|undefined;
		if(p.curr() != ';') {
			if(p.curr() == '"') {
				appearance.icon = this.get_icon_resource(p.read_string());
				this.icon_cache.push(appearance.icon);
				icon_state_cache = [];
				this.icon_state_caches.push(icon_state_cache);
			} else if(p.curr() == 'n') {
				p.idx += 4;
				appearance.icon = null;
				this.icon_cache.push(appearance.icon);
				icon_state_cache = [];
				this.icon_state_caches.push(icon_state_cache);
			} else {
				let num = p.read_number();
				appearance.icon = this.icon_cache[num-1];
				icon_state_cache = this.icon_state_caches[num-1];
			}
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') {
			if(!icon_state_cache) {
				console.error(this.icon_cache);
				console.error(icon_state_cache);
				throw new Error(`Unknown icon at ${p}`);
			}
			if(p.curr() == '"') {
				appearance.icon_state = p.read_string();
				icon_state_cache.push(appearance.icon_state);
			} else if(p.curr() == 'n') {
				p.idx += 4;
				appearance.icon_state = null;
				icon_state_cache.push(appearance.icon_state);
			} else {
				let num = p.read_number();
				appearance.icon_state = icon_state_cache[num-1];
			}
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') {
			if(p.curr() == '"') {
				appearance.name = p.read_string();
				this.name_cache.push(appearance.name);
			} else if(p.curr() == 'n') {
				p.idx += 4;
				appearance.name = null;
				this.name_cache.push(appearance.name);
			} else {
				appearance.name = this.name_cache[p.read_number() - 1];
			}
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.appearance_flags = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.layer = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') {
			appearance.plane = p.read_number();
			if(appearance.plane == Planes.LIGHTING_PLANE) appearance.blend_mode = 4;
			else appearance.blend_mode = 0;
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.dir = p.read_number();
		if(appearance.dir == 0) appearance.dir_override = false;
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') {
			if(p.curr() == 'w') {
				appearance.color_alpha = appearance.color_alpha | 0xFFFFFF;
				p.idx++;
			} else if(p.curr() == '#') {
				let color_str = p.txt.substring(p.idx+5, p.idx+7) + p.txt.substring(p.idx+3, p.idx+5) + p.txt.substring(p.idx+1, p.idx+3);
				appearance.color_alpha = parseInt(color_str, 16) | (appearance.color_alpha & 0xFF000000);
				p.idx += 7;
			} else {
				let color_matrix = new Float32Array(20);
				let cmi = 0;
				while('-.0123456789'.includes(p.curr())) {
					color_matrix[cmi++] = (p.read_number() / 255);
					if(p.curr() == ',') p.idx++;
				}
				appearance.color_matrix = color_matrix;
			}
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.color_alpha = (appearance.color_alpha & 0xFFFFFF) | (Math.min(255, Math.max(0, p.read_number())) << 24);
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.pixel_x = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.pixel_y = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.blend_mode = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') {
			if(p.curr() == 'i') {
				appearance.transform = ReaderAppearance.base.transform;
				p.idx++;
			} else {
				appearance.transform = [1,0,0,0,1,0];
				let ti = 0;
				while('-.0123456789'.includes(p.curr())) {
					appearance.transform[ti++] = p.read_number();
					if(p.curr() == ',') p.idx++;
				}
			}
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.invisibility = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.pixel_w = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() != ';') appearance.pixel_z = p.read_number();
		if(p.read_next_or_end()) return appearance;
		if(p.curr() == '[') {
			appearance.overlays = [];
			while('[,'.includes(p.curr())) {
				p.idx++;
				if(p.curr() == ']') break;
				let overlay = this.read_appearance(p, appearance, false);
				if(overlay) appearance.overlays.push(this.appearance_id(overlay));
			}
			if(p.curr() == '[' && !appearance.overlays.length) p.idx++;
			if(p.curr() != ']') throw new Error(`Expected ] or , at ${p}, found ${p.curr()} instead`);
			p.idx++;
		}
		if(p.read_next_or_end()) return appearance;
		if(p.curr() == '[') {
			appearance.underlays = [];
			while('[,'.includes(p.curr())) {
				p.idx++;
				if(p.curr() == ']') break;
				let overlay = this.read_appearance(p, appearance, false);
				//if(overlay?.plane == Planes.LIGHTING_PLANE) continue;
				if(overlay) appearance.underlays.push(this.appearance_id(overlay));
			}
			if(p.curr() == '[' && !appearance.underlays.length) p.idx++;
			if(p.curr() != ']') throw new Error(`Expected ] or , at ${p}, found ${p.curr()} instead`);
			p.idx++;
		}
		p.read_expected_char('}');
		return appearance;
	}
}

class TextPointer {
	constructor (
		public txt : string,
		public line : number,
		public offset : number = 0
	) {}
	curr() {
		return this.txt[this.idx];
	}
	idx:number = 0;
	toString(idx = this.idx) {
		return `${this.line}:${idx+this.offset+1}`
	}
	read_number() {
		let start_index = this.idx;
		while("1234567890.-eE".includes(this.curr())) this.idx++;
		return +this.txt.substring(start_index, this.idx);
	}
	read_ref() {
		if(this.curr() != '[') throw new Error(`Expected [ at ${this}, found ${this.curr()} instead.`);
		let start_index = this.idx;
		while('[0x123456789abcdefABCDEF'.includes(this.curr())) {
			this.idx++;
		}
		if(this.curr() != ']') throw new Error(`Expected ] at ${this}, found ${this.curr()} instead.`);
		this.idx++
		let substr = this.txt.substring(start_index+1, this.idx-1);
		if(!substr.startsWith("0x")) return +substr + 0x02000000; // don't ask
		return +substr;
	}
	read_loc(orig : number|[number,number,number]|null) : number|[number,number,number]|null {
		if(this.curr() == '=') {
			this.idx++;
			return orig;
		} else if(this.curr() == '[') {
			return this.read_ref();
		} else if(this.curr() == 'n') {
			this.idx += 4;
			return null;
		} else {
			let x = this.read_number();
			if(this.curr() != ',') throw new Error(`Expected , at ${this}, found ${this.curr()} instead`);
			this.idx++;
			let y = this.read_number();
			if(this.curr() != ',') throw new Error(`Expected , at ${this}, found ${this.curr()} instead`);
			this.idx++;
			let z = this.read_number();
			return [x,y,z];
		}
	}
	read_string() : string {
		let start_index = this.idx;
		if(this.curr() != '"') return "";
		this.idx++;
		while(this.curr() != '"') {
			if(this.curr() == '\\') {
				this.idx++;
			}
			this.idx++;
		}
		this.idx++;
		return JSON.parse(this.txt.substring(start_index, this.idx));
	}
	read_next_or_end() : boolean {
		if(this.curr() == '}') {
			this.idx++;
			return true;
		}
		if(this.curr() != ';') {
			throw new Error(`Expected ; or } at ${this}, got ${this.curr()} instead`);
		}
		this.idx++;
		return false;
	}
	read_expected_char(char : string) : void {
		if(this.curr() != char) {
			let formatted = char;
			if(formatted == ' ') formatted = '" "';
			throw new Error(`Expected ${formatted} at ${this}, found ${this.curr()} instead`);
		}
		this.idx++;
	}
}
