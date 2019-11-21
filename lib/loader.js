'use strict';
const Appearance = require('./appearance.js');

module.exports = async function load_demo(data) {
	let lines = new TextDecoder().decode(data).split(/\r\n|\r|\n/);
	lines.length--;
	if(!lines.length || !lines[0].startsWith("demo version "))
		return;
	let version = +lines[0].split(" ")[2];
	if(!(version <= 1))
		return;
	console.log("version " + version);
	let obj = {version, init_turfs: [], init_objs: [], timeframes: []};
	let timeframe = null;

	let icon_cache = [];
	let icon_state_caches = [];
	let name_cache = [];
	obj.icons_used = icon_cache;
	obj.icon_state_caches = icon_state_caches;

	let running_objs = new Map();
	let running_turfs = new Map();
	let running_client_mobs = new Map();
	let last_chat = null;
	let appearance_cache = new Map();

	for(let i = 1; i < lines.length; i++) {
		let line = lines[i];
		if(line.length == 0) continue;
		let command = /^([a-z]+) /i.exec(line)[1];
		let content = line.substring(command.length + 1);
		if(command == "commit")
			obj.commit = content;
		else if(command == "init") {
			let worldsize_arr = content.split(" ");
			obj.maxx = +worldsize_arr[0];
			obj.maxy = +worldsize_arr[1];
			obj.maxz = +worldsize_arr[2];

			for(let z = 1; z <= obj.maxz; z++) {
				let zline = lines[++i];
				let p = {txt: zline, idx: 0, line: i};
				let zlevel = [];
				let last_appearance = null;
				while(p.idx < p.txt.length) {
					if('0123456789'.includes(p.txt[p.idx])) {
						let amount = read_number(p);
						for(let j = 1; j < amount; j++) {
							running_turfs.set(`${(zlevel.length % obj.maxx) + 1},${Math.floor(zlevel.length / obj.maxx) + 1},${z}`, {appearance: last_appearance});
							zlevel.push(last_appearance);
						}
					} else {
						last_appearance = read_appearance(p, last_appearance, true, (zlevel.length % obj.maxx) + 1, Math.floor(zlevel.length / obj.maxx) + 1, z);
						running_turfs.set(`${(zlevel.length % obj.maxx) + 1},${Math.floor(zlevel.length / obj.maxx) + 1},${z}`, {appearance: last_appearance});
						zlevel.push(last_appearance);
					}
					if(zlevel.length > obj.maxx*obj.maxy) throw new Error(`Exceeded z-level size at ${p.line+1}:${p.idx+1}`);
					if(p.txt[p.idx] == ',') {
						p.idx++;
					}
				}
				if(zlevel.length != obj.maxx*obj.maxy) {
					throw new Error(`Z-level of size ${obj.maxx}x${obj.maxy} should have ${obj.maxx*obj.maxy} turfs, has ${zlevel.length} turfs instead`);
				}
				obj.init_turfs.push(zlevel);
			}
			for(let z = 1; z <= obj.maxz; z++) {
				let zline = lines[++i];
				let p = {txt: zline, idx: 0, line: i};
				let index = 0;
				while(p.idx < p.txt.length) {
					if('0123456789'.includes(p.txt[p.idx])) {
						index += read_number(p);
					} else {
						read_init_obj(p, `${index % obj.maxx + 1},${Math.floor(index / obj.maxx) + 1},${z}`);
					}
					if(index > obj.maxx*obj.maxy) throw new Error(`Exceeded z-level size at ${p.line+1}:${p.idx+1}`);
					if(p.txt[p.idx] == ',') {
						p.idx++;
					}
				}
			}
			{
				let zline = lines[++i];
				let p = {txt: zline, idx: 0, line: i};
				while(p.idx < p.txt.length) {
					read_init_obj(p, null);
					if(p.txt[p.idx] == ',') {
						p.idx++;
					} else {
						break;
					}
				}
			}
		} else if(command == "time") {
			timeframe = {
				time: +content,
				forward: {
					turf_changes: [],
					add_atoms: [], change_atoms: [], del_atoms: [],
					login: [], logout: [], setmob: []
				},
				backward:
				{
					turf_changes: [],
					add_atoms: [], change_atoms: [], del_atoms: [],
					login: [], logout: [], setmob: []
				},
				chat: []
			};
			obj.timeframes.push(timeframe);
		} else if(command == "new") {
			let p = {txt: content, idx: 0, line: i};
			while(p.idx < p.txt.length) {
				let ref = read_ref(p);
				let old_running_obj = running_objs.get(ref);
				if(old_running_obj) { // if the object already exists, delete the original
					//console.warn(`Created new object with already-used ref at ${p.line+1}:${p.idx+1}`);
					timeframe.backward.add_atoms.push(Object.assign({ref}, old_running_obj));
					timeframe.forward.del_atoms.push(ref);
				}
				if(p.txt[p.idx] != ' ') throw new Error(`Expected " " at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let loc = read_loc(p);
				if(p.txt[p.idx] != ' ') throw new Error(`Expected " " at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let appearance = read_appearance(p);

				let running_obj = {loc, appearance, last_loc: loc, last_move: timeframe.time};
				running_objs.set(ref, running_obj)
				timeframe.forward.add_atoms.push(Object.assign({ref}, running_obj));
				timeframe.backward.del_atoms.push(ref);
				if(p.txt[p.idx] == ',') p.idx++;
			}
		} else if(command == "del") {
			let p = {txt: content, idx: 0, line: i};
			while(p.idx < p.txt.length) {
				let ref = read_ref(p);
				let old_running_obj = running_objs.get(ref);
				if(old_running_obj) { // if the object already exists, delete the original
					timeframe.backward.add_atoms.push(Object.assign({ref}, old_running_obj));
					timeframe.forward.del_atoms.push(ref);
					running_objs.delete(ref);
				} else {
					//console.warn(`Deleting non-existent object at ${p.line+1}:${p.idx+1}`);
				}
				if(p.txt[p.idx] == ',') p.idx++;
			}
		} else if(command == "update") {
			let p = {txt: content, idx: 0, line: i};
			while(p.idx < p.txt.length) {
				let ref = read_ref(p);
				let running_obj = running_objs.get(ref);
				if(p.txt[p.idx] != ' ') throw new Error(`Expected " " at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let loc = read_loc(p, running_obj ? running_obj.loc : undefined);
				if(p.txt[p.idx] != ' ') throw new Error(`Expected " " at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let appearance = read_appearance(p, running_obj ? running_obj.appearance : undefined);
				if(running_obj) {
					timeframe.backward.change_atoms.push(Object.assign({ref}, running_obj));
					running_obj.appearance = appearance;
					if(loc != running_obj.loc) {
						running_obj.last_loc = running_obj.loc;
						running_obj.loc = loc;
						running_obj.last_move = timeframe.time;
					}
					timeframe.forward.change_atoms.push(Object.assign({ref}, running_obj));
					if(p.txt[p.idx] == ',') p.idx++;
				} else {
					//console.warn(`Updating non-existent atom ${ref} - creating new instead.`);
					running_obj = {loc, appearance, last_loc: loc, last_move: timeframe.time};
					running_objs.set(ref, running_obj)
					timeframe.forward.add_atoms.push(Object.assign({ref}, running_obj));
					timeframe.backward.del_atoms.push(ref);
					if(p.txt[p.idx] == ',') p.idx++;
				}
			}
		} else if(command == "turf") {
			let p = {txt: content, idx: 0, line: i};
			while(p.idx < p.txt.length) {
				if(p.txt[p.idx] != '(') throw new Error(`Expected ( at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let loc = read_loc(p);
				if(p.txt[p.idx] != ')') throw new Error(`Expected ) at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				if(p.txt[p.idx] != '=') throw new Error(`Expected = at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
				p.idx++;
				let running_turf = running_turfs.get(loc);
				if(!running_turf) {
					running_turf = {appearance: null};
					running_turfs.set(running_turf);
				}
				let appearance = read_appearance(p, running_turf ? running_turf.appearance : undefined);

				timeframe.backward.turf_changes.push(Object.assign({loc}, running_turf));
				running_turf.appearance = appearance;
				timeframe.forward.turf_changes.push(Object.assign({loc}, running_turf));
				if(p.txt[p.idx] == ',') p.idx++;
			}
		} else if(command == "login") {
			timeframe.forward.login.push(content);
			timeframe.backward.logout.push(content);
		} else if(command == "logout") {
			timeframe.forward.logout.push(content);
			timeframe.backward.login.push(content);
		} else if(command == "setmob") {
			let [ckey, ref] = content.split(" ");
			let old_mob = running_client_mobs.get(ckey);
			timeframe.backward.setmob.splice(0, 0, {ckey, ref: old_mob});
			running_client_mobs.set(ckey, ref);
			timeframe.forward.setmob.push({ckey, ref});
		} else if(command == "chat") {
			let result = /^([^ ]+) (.+)$/.exec(content);
			let clients = result[1].split(",");
			let message = result[2];
			if(message == "=") {
				message = last_chat;
			} else {
				message = JSON.parse(message);
				last_chat = message;
			}
			timeframe.chat.push({
				clients,
				message
			});
		}
	}

	obj.duration = timeframe.time;

	function read_number(p) {
		let start_index = p.idx;
		while("01234567890.-eE".includes(p.txt[p.idx])) {
			p.idx++;
		}
		return +p.txt.substring(start_index, p.idx);
	}
	function read_ref(p) {
		if(p.txt[p.idx] != '[') throw new Error(`Expected [ at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
		let start_index = p.idx;
		while('[0x123456789abcdefABCDEF'.includes(p.txt[p.idx])) {
			p.idx++;
		}
		if(p.txt[p.idx] != ']') throw new Error(`Expected ] at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
		p.idx++
		return p.txt.substring(start_index, p.idx);
	}
	function read_loc(p, orig) {
		if(p.txt[p.idx] == '=') {
			p.idx++;
			return orig;
		} else if(p.txt[p.idx] == '[') {
			return read_ref(p);
		} else if(p.txt[p.idx] == 'n') {
			p.idx += 4;
			return null;
		} else {
			let x = read_number(p);
			if(p.txt[p.idx] != ',') throw new Error(`Expected , at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
			p.idx++;
			let y = read_number(p);
			if(p.txt[p.idx] != ',') throw new Error(`Expected , at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
			p.idx++;
			let z = read_number(p);
			return `${x},${y},${z}`;
		}
	}
	function read_string(p) {
		let start_index = p.idx;
		if(p.txt[p.idx] != '"') return "";
		p.idx++;
		while(p.txt[p.idx] != '"') {
			if(p.txt[p.idx] == '\\') {
				p.idx++;
			}
			p.idx++;
		}
		p.idx++;
		return JSON.parse(p.txt.substring(start_index, p.idx));
	}

	function read_appearance(p, comparison, inherit_overlays = true, x=0, y=0, z=0) {
		if(p.txt[p.idx] == 'n') {
			p.idx++;
			return null;
		}
		if(p.txt[p.idx] == '=') {
			p.idx++;
			return comparison
		}
		if(p.txt[p.idx] == 's' || p.txt[p.idx] == 't') {
			let appearance = new Appearance({
				icon: 'icons/turf/space.dmi',
				icon_state: "?",
				name: "space",
				layer: 1.8,
				plane: -95
			});
			if(p.txt[p.idx] == 't') {
				p.idx++;
				appearance.dir = +p.txt[p.idx];
				switch(p.txt[p.idx]) {
					case "1":
						appearance.transform = [-1,0,0,0,-1,0];
						break;
					case "4":
						appearance.transform = [0,-1,0,1,0,0];
						break;
					case "8":
						appearance.transform = [0,1,0,-1,0,0];
						break;
				}
				appearance.icon_state = `speedspace_ns_?`;
			}
			p.idx++;
			return appearance;
		}
		let appearance = null;
		if(p.txt[p.idx] == '~') {
			p.idx++;
			if(!comparison) {
				console.log(`Comparison to null at ${p.line+1}:${p.idx+1}`)
			}
			appearance = new Appearance(comparison);
			if(!inherit_overlays) {
				appearance.overlays = [];
				appearance.underlays = [];
			}

		} else {
			appearance = new Appearance();
		}
		if(p.txt[p.idx] != '{') {
			throw new Error(`Expected { at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead.`);
		}
		p.idx++;
		let icon_state_cache;
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') {
			if(p.txt[p.idx] == '"') {
				appearance.icon = read_string(p);
				icon_cache.push(appearance.icon);
				icon_state_cache = [];
				icon_state_caches.push(icon_state_cache);
			} else if(p.txt[p.idx] == 'n') {
				p.idx += 4;
				appearance.icon = null;
				icon_cache.push(appearance.icon);
				icon_state_cache = [];
				icon_state_caches.push([]);
			} else {
				let num = read_number(p);
				appearance.icon = icon_cache[num-1];
				icon_state_cache = icon_state_caches[num-1];
			}
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			if(!icon_state_cache) {
				console.log(icon_cache);
				console.log(icon_state_cache);
				throw new Error(`Unknown icon at ${p.line+1}:${p.idx+1}`);
			}
			if(p.txt[p.idx] == '"') {
				appearance.icon_state = read_string(p);
				icon_state_cache.push(appearance.icon_state);
			} else if(p.txt[p.idx] == 'n') {
				p.idx += 4;
				appearance.icon_state = null;
				icon_state_cache.push(appearance.icon_state);
			} else {
				let num = read_number(p);

				appearance.icon_state = icon_state_cache ? icon_state_cache[num-1] : "";
			}
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			if(p.txt[p.idx] == '"') {
				appearance.name = read_string(p);
				name_cache.push(appearance.name);
			} else if(p.txt[p.idx] == 'n') {
				p.idx += 4;
				appearance.name = null;
				name_cache.push(appearance.name);
			} else {
				let num = read_number(p);
				appearance.name = name_cache[num-1];
			}
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.appearance_flags = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.layer = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.plane = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.dir = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			if(p.txt[p.idx] == 'w') {
				appearance.color = '#ffffff';
				p.idx++;
			} else if(p.txt[p.idx] == '#') {
				appearance.color = p.txt.substring(p.idx, p.idx + 7);
				p.idx += 7;
			} else {
				appearance.color = [];
				while('-.0123456789'.includes(p.txt[p.idx])) {
					appearance.color.push(read_number(p) / 255);
					if(p.txt[p.idx] == ',')  p.idx++;
				}
			}
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.alpha = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') { throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);}
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.pixel_x = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.pixel_y = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.blend_mode = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			if(p.txt[p.idx] == 'i') {
				appearance.transform = [1,0,0,0,1,0];
				p.idx++;
			} else {
				appearance.transform = [];
				while('-.0123456789'.includes(p.txt[p.idx])) {
					appearance.transform.push(read_number(p));
					if(p.txt[p.idx] == ',')  p.idx++;
				}
			}
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.invisibility = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.pixel_w = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] != ';') {
			appearance.pixel_z = read_number(p);
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] == '[') {
			appearance.overlays = [];
			while('[,'.includes(p.txt[p.idx])) {
				p.idx++;
				if(p.txt[p.idx] == ']') break;
				appearance.overlays.push(read_appearance(p, appearance, false, x, y, z));
			}
			if(p.txt[p.idx] == '[' && !appearance.overlays.length) p.idx++;
			if(p.txt[p.idx] != ']') throw new Error(`Expected ] or , at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
			p.idx++;
		}
		if(p.txt[p.idx] == '}') { p.idx++; return appearance; }
		if(p.txt[p.idx] != ';') throw new Error(`Expected ; at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		if(p.txt[p.idx] == '[') {
			appearance.underlays = [];
			while('[,'.includes(p.txt[p.idx])) {
				p.idx++;
				if(p.txt[p.idx] == ']') break;
				appearance.underlays.push(read_appearance(p, appearance, false, x, y, z));
			}
			if(p.txt[p.idx] == '[' && !appearance.underlays.length) p.idx++;
			if(p.txt[p.idx] != ']') throw new Error(`Expected ] or , at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
			p.idx++;
		}
		if(p.txt[p.idx] != '}') throw new Error(`Expected } at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		return appearance;
	}
	function read_init_obj(p, loc) {
		let desc = {loc};
		desc.ref = read_ref(p);
		obj.init_objs.push(desc);
		if(p.txt[p.idx] != '=') throw new Error(`Expected = at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
		p.idx++;
		desc.appearance = read_appearance(p);
		if(p.txt[p.idx] == '(') {
			p.idx++;
			while(p.txt[p.idx] != ')') {
				read_init_obj(p, desc.ref);
				if(!'),'.includes(p.txt[p.idx])) throw new Error(`Expected ) or , at ${p.line+1}:${p.idx+1}, found ${p.txt[p.idx]} instead`);
				if(p.txt[p.idx] == ',')
					p.idx++;
			}
			p.idx++;
		}
		running_objs.set(desc.ref, {appearance: desc.appearance, loc, last_loc: loc, last_move: 0});
	}
	return obj;
}
