import * as Comlink from 'comlink';
import { inflate } from 'pako';
import { FrameData, Icon, IconState, IconStateDir, IconStateFrame, SpriteHash } from './icon';
import xxhash from 'xxhash-wasm';

let png_loader_promise_resolve:((loader : (blob:Blob) => Promise<Uint8Array>) => void);
const png_loader_promise = new Promise<(blob:Blob) => Promise<Uint8Array>>(resolve => {png_loader_promise_resolve = resolve});
const xxhash_promise = xxhash();

const text_decoder = new TextDecoder()
const extra_num = Math.random() * 123456789;

const blank_data = {width: 0, height: 0, data: new Uint8Array(0)};

const loader = {
	async load_icon(blob : Blob) {
		let data_promise = (await png_loader_promise)(blob);
		
		let array_buffer = await blob.arrayBuffer();
		let dv = new DataView(array_buffer);

		// A quick and dirty PNG decoder
		if(dv.getUint32(0, false) != 0x89504e47 || dv.getUint32(4, false) != 0x0d0a1a0a) throw new Error("Not a valid PNG");
		let desc : string|undefined = undefined;
		let chunk_ptr = 8;
		let image_width = 0;
		let image_height = 0;
		while(chunk_ptr < dv.byteLength) {
			let chunk_length = dv.getUint32(chunk_ptr, false);
			let chunk_type = dv.getUint32(chunk_ptr+4, false);
			if(chunk_type == 0x49484452) {// IHDR
				image_width = dv.getUint32(chunk_ptr+8, false);
				image_height = dv.getUint32(chunk_ptr+12, false);
			} else if(chunk_type == 0x7a545874) {// zTXt
				let label_ptr = chunk_ptr + 8;
				while(label_ptr < dv.byteLength && dv.getUint8(label_ptr)) label_ptr++;
				let label = text_decoder.decode(new Uint8Array(array_buffer, chunk_ptr+8, label_ptr-chunk_ptr-8));
				if(label == "Description") {
					let compression_method = dv.getUint8(label_ptr+1);
					if(compression_method != 0) throw new Error("Invalid compression method " + compression_method);
					let compressed_data = new Uint8Array(array_buffer, label_ptr+2, chunk_ptr+8+chunk_length-label_ptr-2);
					desc = text_decoder.decode(inflate(compressed_data));
					break;
				}
			}
			chunk_ptr += 12 + chunk_length;
		}
		let icon_width = image_width;
		let icon_height = image_height;
		let icon : Icon = {
			width: image_width,
			height: image_height,
			icon_states: new Map()
		};

		if(desc) {
			let split = desc.split('\n');
			let parsing : IconState|undefined = undefined;
			let parsing_name : string;
			let parsing_delays : number[] = [];
			let parsing_frames = 0;
			let is_movement_state = false;
			let total_frames = 0;
			function push_state() {
				if(!parsing) throw new Error("Pushing null state");
				let state_frames = parsing.num_dirs * parsing_frames;
				for(let i = 0; i < parsing.num_dirs; i++) {
					let frames : IconStateFrame[] = [];
					for(let j = 0; j < parsing_frames; j++) {
						frames.push({
							delay: parsing_delays?.[j] ?? 1,
							dmi_index: total_frames + i + j*parsing.num_dirs,
							sprite_hash: 0,
							sprite_data: blank_data,
							atlas_node: undefined
						});
					}
					let total_delay = 0;
					for(let frame of frames) total_delay += frame.delay;
					parsing.dirs.push({
						current_frame: undefined,
						frames,
						total_delay,
						atlas_node: undefined
					});
				}
				total_frames += state_frames;
				
				let existing = icon.icon_states.get(parsing_name);
				if(existing) {
					if(is_movement_state) {
						existing.movement_state = parsing;
					} else {
						parsing.movement_state = existing.movement_state;
						icon.icon_states.set(parsing_name, parsing);
					}
				} else if(is_movement_state) {
					icon.icon_states.set(parsing_name, {
						dirs: [],
						height: parsing.height,
						movement_state: parsing,
						num_dirs: 0,
						requires_sorting: false,
						width: parsing.width,
						atlas: undefined
					});
				} else {
					icon.icon_states.set(parsing_name, parsing);
				}

				parsing = undefined;
			}
			for(let i = 0; i < split.length; i++) {
				let regexResult = /\t?([a-zA-Z0-9]+) ?= ?(.+)/.exec(split[i]);
				if(!regexResult)
					continue;
				let key = regexResult[1];
				let val = regexResult[2];
				if(key == 'width') {
					icon_width = +val;
				} else if(key == 'height') {
					icon_height = +val;
				} else if(key == 'state') {
					if(parsing) {
						push_state();
					}
					is_movement_state = false;
					parsing_name = JSON.parse(val);
					parsing = {
						dirs: [],
						height: icon_height,
						movement_state: parsing,
						num_dirs: 0,
						requires_sorting: false,
						width: icon_width,
						atlas: undefined
					};
					parsing_delays = [];
					parsing_frames = 1;
					is_movement_state = false;
				} else if(key == 'dirs') {
					if(!parsing) throw new Error("No icon state");
					parsing.num_dirs = +val;
				} else if(key == 'frames') {
					parsing_frames = +val;
				} else if(key == 'movement') {
					is_movement_state = !!+val;
				} else if(key == 'delay') {
					parsing_delays = JSON.parse('[' + val + ']');
				}
			}
			if(parsing) {
				push_state();
			}

			if(!icon_width && !icon_height && total_frames) {
				icon_height = image_height;
				icon_width = image_width / total_frames;
			}
		} else {
			let frame : IconStateFrame = {
				delay: 1,
				dmi_index: 0,
				sprite_hash: 0,
				sprite_data: blank_data,
				atlas_node: undefined
			};
			let dir : IconStateDir = {
				current_frame: undefined,
				frames: [frame],
				total_delay: 1,
				atlas_node: undefined
			};
			let icon_state : IconState = {
				dirs: [dir],
				height: image_height,
				width: image_width,
				movement_state: undefined,
				num_dirs: 1,
				requires_sorting: true,
				atlas: undefined
			};
			icon.icon_states.set("", icon_state);
		}
		
		let allframes : IconStateFrame[] = [];
		let frametostate = new Map<IconStateFrame, IconState>();
		let cols = image_width / icon_width;
		icon.width = icon_width;
		icon.height = icon_height;
		for(let bstate of icon.icon_states.values()) {
			for(let state of [bstate, bstate.movement_state]) {
				if(!state) continue;
				state.width = icon.width;
				state.height = icon.height;
				for(let dir of state.dirs) for(let frame of dir.frames) {
					frametostate.set(frame, state);
					allframes.push(frame);
				}
			}
		}
		
		let full_data = new Uint32Array((await data_promise).buffer);
		let image_datas = new Map<SpriteHash, FrameData>();

		await Promise.all(allframes.map(async (frame) => {
			let index = frame.dmi_index;
			let data = {width:icon_width, height:icon_height, data: new Uint8Array(icon_width*icon_height*4)};
			let data_uint = new Uint32Array(data.data.buffer);
			//gl.readPixels((index % cols) * icon_width, Math.floor(index / cols) * icon_height, icon_width, icon_height, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
			let sx = (index % cols) * icon_width, sy =  Math.floor(index / cols) * icon_height;
			for(let y = 0; y < icon_height; y++) {
				for(let x = 0; x < icon_width; x++) {
					let in_idx = (x+sx) + image_width*(y+sy);
					let out_idx = x + icon_width*y;
					data_uint[out_idx] = full_data[in_idx];
				}
			}
			for(let i = 3; i < data.data.length; i += 4) {
				let alpha = data.data[i];
				if(alpha > 0 && alpha < 255) {
					let state = frametostate.get(frame);
					if(state)
						state.requires_sorting = true;
					break;
				}
			}
			let hash_data = new Uint32Array(data_uint.length + 3);
			hash_data[0] = icon_width;
			hash_data[1] = icon_height;
			hash_data[2] = extra_num;
			let hash_data_bytes = new Uint8Array(hash_data.buffer);
			hash_data.set(data_uint, 3);
			//let hash = createHash('sha1').update(icon_width + ", " + icon_height, 'utf8').update(data.data).digest().toString('base64');
			let hash = (await xxhash_promise).h32Raw(hash_data_bytes);
			frame.sprite_hash = hash;
			frame.sprite_data = data;
			image_datas.set(hash, data);
		}));
		let big_buf_length = 0;
		for(let data of image_datas.values()) {
			big_buf_length += data.data.length;
		}
		let big_buf_off = 0;
		let big_buf = new Uint8Array(big_buf_length);
		for(let data of image_datas.values()) {
			let new_buf = big_buf.subarray(big_buf_off, big_buf_off+data.data.length);
			new_buf.set(data.data);
			data.data = new_buf;
			big_buf_off += new_buf.length;
		}
		for(let frame of allframes) {
			frame.sprite_data = image_datas.get(frame.sprite_hash) ?? frame.sprite_data;
		}
		return Comlink.transfer(icon, [big_buf.buffer]);
	},
	set_png_loader(port : MessagePort) {
		png_loader_promise_resolve(Comlink.wrap<(blob:Blob) => Promise<Uint8Array>>(port));
	}
};
export type IconLoader = typeof loader;

Comlink.expose(loader);