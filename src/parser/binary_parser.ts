import { ReaderAppearance } from "../misc/appearance";
import { Matrix } from "../misc/matrix";
import { DemoParser } from "./base_parser";

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
			this.set_rev_data(commit_info);

			this.load_end = this.read_buffer[commit_hash_end+1] + (this.read_buffer[commit_hash_end+2]<<8) + (this.read_buffer[commit_hash_end+3]<<16) + (this.read_buffer[commit_hash_end+4]<<24);

			this.has_read_header = true;
			chunk_start = commit_hash_end+5;
			this.file_index = chunk_start;
		}

		while(chunk_start < this.read_buffer_end) {
			let chunk_type = this.read_buffer[chunk_start];
			let chunk_data_start = 1;
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

	handle_chunk(data : Uint8Array, type : number) : boolean {
		let p = new DataPointer(data, this.file_index, type);

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
				this.handle_atom_data(p, type);
				if(this.load_end) return true;
				break;
			case 0xA:
				this.resource_loads.push({
					id: p.read_uint32(),
					blob: new Blob([p.data.subarray(p.i)])
				});
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
				if(update_flags & 0xC0) {
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
				/*appearance.screen_loc = */this.parse_string(p);
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
				let cmf = p.read_uint8();
				let cm = new Float32Array(20);
				appearance.color_matrix = cm;
				let next_num = (cmf & 1) ? (p : DataPointer) => {
					return p.read_float();
				} : (p : DataPointer) => {
					return p.read_uint8() / 255;
				};
				cm[0] = next_num(p);
				if(cmf & 0x80) {
					cm[1] = next_num(p);
					cm[2] = next_num(p);
				} else {cm[2] = cm[1] = cm[0];}
				if(cmf & 0x40) cm[3] = next_num(p);
				cm[4] = next_num(p);
				if(cmf & 0x80) {
					cm[5] = next_num(p);
					cm[6] = next_num(p);
				} else {cm[6] = cm[5] = cm[4];}
				if(cmf & 0x40) cm[7] = next_num(p);
				cm[8] = next_num(p);
				if(cmf & 0x80) {
					cm[9] = next_num(p);
					cm[10] = next_num(p);
				} else {cm[10] = cm[9] = cm[8];}
				if(cmf & 0x40) cm[11] = next_num(p);
				if(cmf & 0x10) {
					cm[12] = next_num(p);
					if(cmf & 0x80) {
						cm[13] = next_num(p);
						cm[14] = next_num(p);
					} else {cm[14] = cm[13] = cm[12];}
				}
				if(cmf & 0x20) cm[15] = next_num(p);
				if(cmf & 0x02) {
					cm[16] = next_num(p);
					cm[17] = next_num(p);
					cm[18] = next_num(p);
				}
				if(cmf & 0x04) {
					cm[19] = next_num(p);
				} else if(cmf & 0x08) {
					cm[19] = 1;
				}
			}
			appearance.animate_movement = (daf >>> 22) & 0x3;
			appearance.blend_mode = (daf >>> 24) & 0x7;
			appearance.mouse_opacity = (daf >>> 27) & 0x3;

			if(appearance.plane == 15) appearance.blend_mode = 4;
			return this.appearance_refs[appearance_ref] = this.appearance_id(appearance);
		} else {
			if(appearance_ref == 0xFFFF) return null;
			let to_ret = this.appearance_refs[appearance_ref];
			if(to_ret == null) throw new Error(`Reference to undefined appearance 0x${appearance_ref.toString(16)}`);
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

	read_vlq() : number  {
		let number = 0;
		while(this.i < this.data.length) {
			number <<= 7;
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

	toString() {
		return `(0x${this.start_abs_offset.toString(16)}:0x${this.i.toString(16)} (0x${(this.start_abs_offset+this.i).toString(16)}), chunk ${this.chunk_id})`;
	}
}
