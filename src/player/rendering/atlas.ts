import { AtlasTexCopyWithin, AtlasTexData, RenderingCmd, ResizeAtlas } from "./commands";
import { FrameData, get_dir_anim_frame, IconState, IconStateDir, SpriteHash } from "./icon";

// Uses a quad-tree. Quad-trees work very well if allocating sprites of a power of two, which most sprites in SS13 are with the exception of 480x480 fullscreen ones. I guess those will have wasted pixels.
export class Atlas {
	size_index : number; // 2**size is the size.
	root : AtlasNode|undefined;
	constructor(size_index : number) {
		this.root = new AtlasNode(this, undefined, 0, 0, size_index);
		this.size_index = size_index;
	}
	get size() : number {
		return 1 << this.size_index;
	}
	alloc(width:number, height:number) : AtlasNode|undefined {
		let root = this.root;
		if(!root) return undefined;
		return root.alloc(width, height);
	}
	expand() : void {
		console.log("Resizing atlas to ", 1, this.size << 1);
		this.size_index++;
		let oldroot = this.root;
		let newroot = new AtlasNode(this, undefined, 0, 0, this.size_index);
		if(oldroot && (oldroot.reserved || oldroot.children != null)) {
			newroot.make_children(oldroot);
		}
		this.root = newroot;
	}
}

export class DmiAtlas extends Atlas {
	hash_to_node : Map<SpriteHash, AtlasNode> = new Map<SpriteHash, AtlasNode>();
	tex_index : number;
	size_limit : number;
	anim_dirs : IconStateDir[] = [];
	static_copy_dirty : boolean = false;

	expand_command : ResizeAtlas|undefined;
	copy_within_command : AtlasTexCopyWithin|undefined;
	tex_data_command : AtlasTexData|undefined;

	constructor(size_index : number, size_limit : number, tex_index : number) {
		super(size_index);
		this.size_limit = size_limit;
		this.tex_index = tex_index;
		
		let size = this.size;
		this.expand_command = {
			cmd: "resizeatlas",
			index: this.tex_index,
			width: size,
			height: size
		};
	}

	alloc(width:number, height:number) : AtlasNode|undefined {
		if(width < 1 || height < 1) return undefined;
		let node = super.alloc(width, height);
		if(!node) {
			while(!node && this.size_index < this.size_limit) {
				this.expand();
				node = super.alloc(width, height);
			}
		}
		return node;
	}

	expand() :void {
		super.expand();
		let size = this.size;
		this.expand_command = {
			cmd: "resizeatlas",
			index: this.tex_index,
			width: size,
			height: size
		};
	}

	add_anim_dir(dir : IconStateDir) : void {
		this.anim_dirs.push(dir);
	}

	update_anim_dirs(time : number, use_index: number) : void {
		for(let dir of this.anim_dirs) {
			if(dir.atlas_node?.use_index != use_index) continue;
			let frame = get_dir_anim_frame(dir, time);
			if(frame == dir.current_frame) continue;
			let from_node = frame.atlas_node;
			let to_node = dir.atlas_node;
			if(!from_node || !to_node) continue;
			if(!this.copy_within_command) {
				this.copy_within_command = {
					cmd: "atlestexcopywithin",
					index: this.tex_index,
					parts: []
				};
			}
			dir.current_frame = frame;
			this.copy_within_command.parts.push({
				x1: from_node.x,
				y1: from_node.y,
				x2: to_node.x,
				y2: to_node.y,
				width: from_node.width,
				height: from_node.height
			});	
		}
	}

	allocate_icon_state(icon_state : IconState) : boolean {
		let frame_hashes = new Map<SpriteHash,FrameData>();
		let animated_dir_count = 0;
		for(let dir of icon_state.dirs) {
			if(dir.frames.length > 1) animated_dir_count++;
			for(let frame of dir.frames) {
				if(!this.hash_to_node.has(frame.sprite_hash))
					frame_hashes.set(frame.sprite_hash, frame.sprite_data);
			}
		}
		let total_nodes_to_make = frame_hashes.size + animated_dir_count;
		let nodes : AtlasNode[] = [];
		for(let i = 0; i < total_nodes_to_make; i++) {
			let new_node = this.alloc(icon_state.width, icon_state.height);
			if(!new_node) break;
			nodes.push(new_node);
		}
		if(total_nodes_to_make != nodes.length) {
			for(let node of nodes) {
				node.free();
			}
			return false;
		}
		let unused_nodes = nodes.slice();
		
		if(!this.tex_data_command) {
			this.tex_data_command = {
				cmd: "atlastexdata",
				index: this.tex_index,
				parts: []
			};
		}

		for(let [frame_hash, frame_data] of frame_hashes) {
			let node = unused_nodes.pop();
			if(!node) break;
			this.hash_to_node.set(frame_hash, node);
			this.tex_data_command.parts.push({
				x: node.x,
				y: node.y,
				...frame_data
			});
		}

		for(let dir of icon_state.dirs) {
			for(let frame of dir.frames) {
				let node = this.hash_to_node.get(frame.sprite_hash);
				frame.atlas_node = node;
				if(dir.frames.length == 1) {
					dir.atlas_node = node;
					dir.current_frame = frame;
				}
			}
			if(dir.frames.length > 1) {
				this.add_anim_dir(dir);
				dir.atlas_node = unused_nodes.pop();
			}
		}
		icon_state.atlas = this;
		return true;
	}

	add_icon_commands(icon_commands: RenderingCmd[]) : void {
		if(this.expand_command) {
			icon_commands.push(this.expand_command);
			this.expand_command = undefined;
		}
		if(this.tex_data_command) {
			let total_length = 0;
			for(let part of this.tex_data_command.parts) {
				total_length += part.data.length;
			}
			let combined = new Uint8Array(total_length);
			let combined_ptr = 0;
			for(let part of this.tex_data_command.parts) {
				let new_buf = combined.subarray(combined_ptr, combined_ptr + part.data.length);
				new_buf.set(part.data);
				part.data = new_buf;
				combined_ptr += part.data.length;
			}
			this.tex_data_command.transferables = [combined.buffer];
			icon_commands.push(this.tex_data_command);
			this.tex_data_command = undefined;
		}
		if(this.copy_within_command) {
			icon_commands.push(this.copy_within_command);
			this.copy_within_command = undefined;
		}
	}
}

export class AtlasNode {
	constructor(atlas : Atlas, parent:AtlasNode|undefined, x:number, y:number, size_index : number) {
		this.atlas = atlas;
		this.parent = parent;
		this.x = x;
		this.y = y;
		this.size_index = size_index;
		this.largest_avail = size_index;
	}
	atlas : Atlas;
	parent : AtlasNode|undefined;
	children : Array<AtlasNode>|undefined;
	size_index : number;
	largest_avail : number;
	x : number;
	y : number;
	width : number = 0;
	height : number = 0;
	reserved : boolean = false;
	use_index = 0;
	get full_size() : number {return 1 << this.size_index;}
	make_children(first : AtlasNode|undefined) : void {
		if(this.reserved) throw new Error("Trying to put children on a reserved node");
		if(this.children) return;
		let half = this.full_size >> 1;
		this.children = [
			first ? first : new AtlasNode(this.atlas, this, this.x, this.y, this.size_index-1),
			new AtlasNode(this.atlas, this, this.x+half, this.y, this.size_index-1),
			new AtlasNode(this.atlas, this, this.x, this.y+half, this.size_index-1),
			new AtlasNode(this.atlas, this, this.x+half, this.y+half, this.size_index-1)
		];
		this.update_largest_avail();
	}
	alloc(width:number, height:number) : AtlasNode|undefined {
		if(this.reserved) return undefined;
		if(this.largest_avail < 0) return undefined;
		let avail = 1 << this.largest_avail;
		let half = this.full_size >> 1;
		if(width > avail || height > avail) return undefined;
		if(width > half || height > half) {
			if(this.children) return undefined;
			this.reserved = true;
			this.width = width;
			this.height = height;
			this.update_largest_avail();
			return this;''
		}
		this.make_children(undefined);
		let children = this.children;
		if(!children) return undefined;
		for(let i = 0; i < children.length; i++) {
			let child = children[i];
			if(child.largest_avail < 0) continue;
			let child_avail = 1 << child.largest_avail;
			if(width <= child_avail && height <= child_avail) {
				let ret = child.alloc(width, height);
				if(ret) {
					this.update_largest_avail();
					return ret;
				}
			}
		}
		return undefined;
	}
	free() : void {
		if(!this.reserved) throw new Error("Freeing a non-reserved atlas node");
		this.reserved = false;
		this.unwind();
	}
	private unwind() : void {
		if(this.reserved) return;
		let parent = this.parent;
		if(parent) {
			let children = parent.children;
			if(children) {
				let can_unwind = true;
				for(let i = 0; i < children.length; i++) {
					let child = children[i];
					if(child.reserved || child.children) {
						can_unwind = false;
						break;
					}
				}
				if(can_unwind) {
					this.children = undefined;
					this.update_largest_avail();
					parent.unwind();
				}
			}
		}
	}

	update_largest_avail() : void {
		let children = this.children;
		if(children) {
			this.largest_avail = -1;
			for(let i = 0; i < children.length; i++) {
				let child = children[i];
				if(child.largest_avail > this.largest_avail) this.largest_avail = child.largest_avail;
			}
		} else if(this.reserved) {
			this.largest_avail = -1;
		} else {
			this.largest_avail = this.size_index;
		}
	}
}