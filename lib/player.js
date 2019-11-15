'use strict';

const dir_progressions = [
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 0 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 1 dir
	[3,3,3,3,12,3,3,3,12,3,3,3,12,3,3,3], // 2 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 3 dirs
	[2,1,2,2,4,4,2,4,8,8,8,4,1,2,2,2], // 4 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 5 dirs
	[3,3,3,3,12,5,6,12,12,9,10,12,12,3,3,3], // 6 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 7 dirs
	[2,1,2,2,4,5,6,4,8,9,10,8,4,1,2,2], // 8 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 9 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 10 dirs
	[3,3,3,3,12,5,6,7,12,9,10,11,12,13,14,15], // 11 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 12 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 13 dirs
	[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], // 14 dirs
	[2,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], // 15 dirs
	[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] // 16 dirs
];

const color_canvas = document.createElement("canvas");

class RenderInstance {
	constructor(appearance, x, y, atom) {
		this.appearance = appearance;
		this.x = x;
		this.y = y;
		this.atom = atom;
	}
}

class Turf {
	constructor(loc, appearance) {
		this.appearance = appearance;
		let split = loc.split(",");
		this.x = +split[0];
		this.y = +split[1];
		this.z = +split[2];
	}
}

class Obj {
	constructor(loc, appearance, time) {
		this.appearance = appearance;
		this.loc = loc;
		this.last_loc = loc;
		this.last_move = time;
	}
}

class DemoPlayer {
	constructor(demo, icons) {
		console.log(demo);
		this.demo = demo;
		this.icons = icons;
		document.body.innerHTML = ``;

		this.main_panel = document.createElement("div");
		document.body.appendChild(this.main_panel);
		this.main_panel.classList.add("main_panel");

		this.canvas = document.createElement("canvas");
		this.main_panel.appendChild(this.canvas);
		this.canvas.classList.add("fill_canvas");
		this.canvas.tabIndex = 0;
		this.canvas.addEventListener("mousedown", this.canvas_mousedown.bind(this));
		this.canvas.addEventListener("wheel", this.canvas_wheel.bind(this));
		document.addEventListener("keydown", this.keydown.bind(this));
		document.addEventListener("click", this.click.bind(this));

		this.right_panel = document.createElement("div");
		document.body.appendChild(this.right_panel);
		this.right_panel.classList.add("right_panel");

		this.scrub_slider = document.createElement("input");
		this.scrub_slider.type = "range";
		this.scrub_slider.min = 0;
		this.scrub_slider.step = 0;
		this.scrub_slider.max = this.demo.duration;
		this.scrub_slider.classList.add("scrub_slider");
		this.right_panel.appendChild(this.scrub_slider);
		this.scrub_slider.addEventListener("input", this.scrub.bind(this));

		this.time_display = document.createElement("div");
		this.right_panel.appendChild(this.time_display);

		this.rewind_button = document.createElement("input");
		this.rewind_button.type = "button";
		this.rewind_button.value = "Rewind";
		this.rewind_button.addEventListener("click", () => {this.playback_speed = -3;});
		this.right_panel.appendChild(this.rewind_button);

		this.play_button = document.createElement("input");
		this.play_button.type = "button";
		this.play_button.value = "Pause/Play";
		this.play_button.addEventListener("click", () => {this.playback_speed = (this.playback_speed == 0) ? 1 : 0;});
		this.right_panel.appendChild(this.play_button);

		this.fastfoward_button = document.createElement("input");
		this.fastfoward_button.type = "button";
		this.fastfoward_button.value = "Fast-foward";
		this.fastfoward_button.addEventListener("click", () => {this.playback_speed = 5;});
		this.right_panel.appendChild(this.fastfoward_button);

		let inspect_table = document.createElement("div");
		inspect_table.classList.add("inspect_table");
		this.right_panel.appendChild(inspect_table);
		this.client_list_elem = document.createElement("div");
		this.inspect_elem = document.createElement("div");
		inspect_table.appendChild(this.client_list_elem);
		inspect_table.appendChild(this.inspect_elem);


		this.last_timestamp = null;

		this.turf_grid = [];
		this.object_ref_list = [];

		this.clients = new Set();
		this.client_mobs = new Map();

		for(let init_obj of demo.init_objs) {
			this.set_object(init_obj.ref, new Obj(init_obj.loc, init_obj.appearance, 0));
		}
		for(let z = 1; z <= demo.maxz; z++) {
			for(let i = 0; i < this.demo.init_turfs[z-1].length; i++) {
				let loc_string = `${(i % this.demo.maxx) + 1},${(Math.floor(i / this.demo.maxy) + 1)},${z}`;
				this.set_object(loc_string, new Turf(loc_string, this.demo.init_turfs[z-1][i]));
			}
		}

		this.playhead = -1;
		this.timeframe_index = -1;

		this.playback_speed = 1;

		this.follow_desc = null;
		this.see_invisible = 60; // this is the default
		this.mapwindow_x = demo.maxx / 2;
		this.mapwindow_y = demo.maxy / 2;
		this.mapwindow_z = 2;
		this.mapwindow_zoom = 1;
		this.mapwindow_log_zoom = 0;

		this.advance_playhead(0);

		this.update_from_hash();
		window.addEventListener("hashchange", this.update_from_hash.bind(this));
		window.requestAnimationFrame(this.animation_frame_callback.bind(this));
	}

	advance_playhead(target) {
		if(target < 0) {
			target = 0;
			if(this.playback_speed < 0) this.playback_speed = 0;
		} else if(target > this.demo.duration) {
			target = this.demo.duration;
			if(this.playback_speed > 0) this.playback_speed = 0;
		}
		if(target > this.playhead) {
			while(this.demo.timeframes[this.timeframe_index+1] && this.demo.timeframes[this.timeframe_index+1].time <= target) {
				this.timeframe_index++;
				let timeframe = this.demo.timeframes[this.timeframe_index];
				this.apply_timeframe(timeframe, timeframe.forward);
			}
		} else if(target < this.playhead) {
			while(this.demo.timeframes[this.timeframe_index-1] && this.demo.timeframes[this.timeframe_index-1].time > target) {
				let timeframe = this.demo.timeframes[this.timeframe_index];
				this.apply_timeframe(timeframe, timeframe.backward);
				this.timeframe_index--;
			}
		}
		this.playhead = target;
		this.scrub_slider.value = this.playhead;
		this.time_display.textContent = format_duration(Math.round(this.playhead / 10)) + " / " + format_duration(Math.round(this.demo.duration / 10));
		for(let [ckey, ref] of this.client_mobs) {
			let span = this.client_list_elem.querySelector(`[data-ckey=${JSON.stringify(ckey)}] .mob_span`);
			if(span) {
				let mob = this.get_object(ref);
				if(mob && mob.appearance) {
					span.textContent = mob.appearance.name;
				} else {
					span.textContent = "?";
				}
			}
		}
	}
	apply_timeframe(timeframe, subtimeframe) {
		for(let del of subtimeframe.del_atoms) {
			this.set_object(del, undefined);
		}
		for(let update of subtimeframe.change_atoms) {
			let obj = this.get_object(update.ref);
			if(obj) {
				obj.appearance = update.appearance;
				obj.loc = update.loc;
				obj.last_loc = update.last_loc;
				obj.last_move = update.last_move;
			}
		}
		for(let add of subtimeframe.add_atoms) {
			let obj = new Obj(add.loc, add.appearance);
			obj.last_loc = add.last_loc;
			obj.last_move = add.last_move;
			this.set_object(add.ref, obj);
		}
		for(let turf_change of subtimeframe.turf_changes) {
			let turf = this.get_object(turf_change.loc);
			if(turf instanceof Turf) {
				turf.appearance = turf_change.appearance;
			}
		}
		for(let login of subtimeframe.login) {
			this.clients.add(login);
			let elem = this.client_list_elem.querySelector(`[data-ckey=${JSON.stringify(login)}]`);
			if(!elem) {
				elem = document.createElement("div");
				elem.dataset.ckey = login;
				let follow_button = document.createElement("input");
				follow_button.dataset.follow = login;
				follow_button.type = "button";
				follow_button.value = "FLW";
				elem.appendChild(follow_button);
				let ckey_span = document.createElement("span");
				ckey_span.classList.add("ckey_span");
				ckey_span.textContent = login;
				elem.appendChild(ckey_span);
				elem.appendChild(document.createTextNode("("));
				let mob_span = document.createElement("span");
				mob_span.classList.add("mob_span");
				let mobref = this.client_mobs.get(login);
				mob_span.textContent = "?";
				if(mobref){
					let mob = this.get_object(mobref);
					if(mob && mob.appearance) {
						mob_span.textContent = mob.appearance.name;
					}
				}
				elem.appendChild(mob_span);
				elem.appendChild(document.createTextNode(")"));
				this.client_list_elem.appendChild(elem);
			}
		}
		for(let logout of subtimeframe.logout) {
			this.clients.delete(logout);
			let elem = this.client_list_elem.querySelector(`[data-ckey=${JSON.stringify(logout)}]`);
			if(elem) {
				this.client_list_elem.removeChild(elem);
			}
		}
		for(let setmob of subtimeframe.setmob) {
			this.client_mobs.set(setmob.ckey, setmob.ref);
		}
	}

	click(e) {
		let target = e.target;
		if(target.dataset.follow) {
			this.follow_desc = target.dataset.follow;
		}
	}

	scrub() {
		this.advance_playhead(+this.scrub_slider.value);
	}

	update_from_hash(e) {
		let hash = window.location.hash || '';
		if(hash[0] == '#') hash = hash.substring(1);
		if(e && e.newURL.includes("#")) hash = e.newURL.substring(e.newURL.indexOf("#") + 1);
		if(hash.length) {
			let split = hash.split(';');
			if(split[0] == +split[0]) this.advance_playhead(+split[0]);
			if(split[1] == +split[1]) this.mapwindow_x = +split[1];
			if(split[2] == +split[2]) this.mapwindow_y = +split[2];
			if(split[3] == +split[3]) this.mapwindow_z = Math.round(+split[3]);
			if(split[4] == "null") this.follow_desc = null;
			else if(split[4]) this.follow_desc = split[4];
		}
	}

	frame(timestamp) {
		let dt = this.last_timestamp ? timestamp - this.last_timestamp : 0;
		this.last_timestamp = timestamp;
		if(this.playback_speed != 0) {
			this.advance_playhead(this.playhead + (dt * this.playback_speed / 100));
		}

		let rect = this.canvas.getBoundingClientRect();
		if(this.canvas.width != rect.width) this.canvas.width = rect.width;
		if(this.canvas.height != rect.height) this.canvas.height = rect.height;

		let ctx = this.canvas.getContext('2d');

		let follow_obj = null;
		let follow_turf = null;
		if(this.follow_desc) {
			follow_obj = this.get_object(this.follow_desc);
			if(!follow_obj && this.clients.has(this.follow_desc)) {
				follow_obj = this.get_object(this.client_mobs.get(this.follow_desc));
			} else if(!follow_obj) {
				this.follow_desc = null;
			}
			if(follow_obj) {
				while(follow_obj && follow_obj.loc && follow_obj.loc[0] == "[") {
					follow_obj = this.get_object(follow_obj.loc);
				}
				if(follow_obj instanceof Obj && follow_obj.loc == null) {
					ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
					return;
				}
				if(follow_obj instanceof Turf) {
					follow_turf = follow_obj;
				} else {
					follow_turf = this.get_object(follow_obj.loc);
				}
			}
		}
		if(follow_turf) {
			this.mapwindow_z = follow_turf.z || 2;
			this.mapwindow_x = follow_turf.x || 128;
			this.mapwindow_y = follow_turf.y || 128;
		}

		let render_instances = [];
		/*for(let i = 0; i < this.demo.init_turfs[this.mapwindow_z-1].length; i++) {
			//ctx.save();
			//ctx.translate((i % this.demo.maxx + 1) * 32, -(Math.floor(i / this.demo.maxy) + 1) * 32);
			render_instances.push(new RenderInstance(this.demo.init_turfs[this.mapwindow_z-1][i], (i % this.demo.maxx + 1), (Math.floor(i / this.demo.maxy) + 1)))
			//ctx.translate(-(i % this.demo.maxx + 1) * 32, (Math.floor(i / this.demo.maxy) + 1) * 32);
			//ctx.restore();
		}*/
		if(this.turf_grid[this.mapwindow_z-1]) {
			for(let y_array of this.turf_grid[this.mapwindow_z-1]) {
				if(!y_array) continue;
				for(let turf of y_array) {
					if(!turf) continue;
					render_instances.push(new RenderInstance(turf.appearance, turf.x, turf.y, turf))
				}
			}
		}
		for(let type_array of this.object_ref_list) {
			if(!type_array) continue;
			for(let obj of type_array) {
				if(!obj) continue;
				let turf;
				let x_offset = 0; // for gliding
				let y_offset = 0;
				let loc = this.get_object(obj.loc);
				if(loc instanceof Turf) {
					turf = loc;
				} else {
					continue;
				}
				let glide_size = 8; // almost nothing uses anything else so just hardcoding it.
				let glide_time = 32 / glide_size;
				if((this.playhead - obj.last_move) < glide_time) {
					let last_loc = this.get_object(obj.last_loc);
					if(last_loc instanceof Turf && last_loc.z == loc.z) {
						let dx = loc.x - last_loc.x;
						let dy = loc.y - last_loc.y;
						let percent = (this.playhead - obj.last_move) / glide_time;
						if(Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
							x_offset -= Math.round(dx * 32 * (1-percent)) / 32;
							y_offset -= Math.round(dy * 32 * (1-percent)) / 32;
						}
					}
				}
				if(turf && turf.z == this.mapwindow_z) {
					if(follow_obj == obj) {
						this.mapwindow_x = turf.x + x_offset;
						this.mapwindow_y = turf.y + y_offset;
					}
					render_instances.push(new RenderInstance(obj.appearance, turf.x + x_offset, turf.y + y_offset, obj));
				}
			}
		}
		render_instances = render_instances.filter((instance) => {
			if(
				instance.x > (this.mapwindow_x + (this.canvas.width / 32 / 2 / this.mapwindow_zoom)) + 2 ||
				instance.y > (this.mapwindow_y + (this.canvas.height / 32 / 2 / this.mapwindow_zoom)) + 2 ||
				instance.x < (this.mapwindow_x - (this.canvas.width / 32 / 2 / this.mapwindow_zoom)) - 2 ||
				instance.y < (this.mapwindow_y - (this.canvas.height / 32 / 2 / this.mapwindow_zoom)) - 2
			) {
				return false;
			}
			return true;
		});
		render_instances.sort((a,b) => {
			if(a.appearance.plane != b.appearance.plane) {
				return a.appearance.plane - b.appearance.plane;
			}
			if(a.appearance.layer != b.appearance.layer) {
				return a.appearance.layer - b.appearance.layer;
			}
			if(a.y != b.y) {
				return a.y - b.y;
			}
			return 0;
		});

		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.save();
		ctx.translate(Math.round(this.canvas.width/2),Math.round(this.canvas.height/2));
		ctx.scale(this.mapwindow_zoom, this.mapwindow_zoom);
		ctx.translate(-Math.round(this.mapwindow_x*32*this.mapwindow_zoom)/this.mapwindow_zoom, Math.round(this.mapwindow_y*32*this.mapwindow_zoom)/this.mapwindow_zoom);
		ctx.imageSmoothingEnabled = false;
		for(let instance of render_instances) {
			ctx.translate(instance.x * 32, -instance.y * 32);
			this.draw_appearance(ctx, instance.appearance, null, instance.atom);
			ctx.translate(-instance.x * 32, instance.y * 32);
		}

		ctx.restore();

		// build the hash
		let hash = `#${Math.round(this.playhead)};${this.mapwindow_x.toFixed(2)};${this.mapwindow_y.toFixed(2)};${Math.round(this.mapwindow_z)};${this.follow_desc}`;
		if(hash != window.location.hash)
			history.replaceState('', '', hash);

	}

	canvas_mousedown(e) {
		if(e.button != 2) {
			let lastE = e;
			let mouseup = () => {
				document.removeEventListener("mouseup", mouseup);
				document.removeEventListener("mousemove", mousemove);
			}
			let mousemove = (e) => {
				this.mapwindow_x -= (e.screenX - lastE.screenX) / 32 / this.mapwindow_zoom * devicePixelRatio;
				this.mapwindow_y += (e.screenY - lastE.screenY) / 32 / this.mapwindow_zoom * devicePixelRatio;
				if(this.mapwindow_x < 1) this.mapwindow_x = 1;
				if(this.mapwindow_y < 1) this.mapwindow_y = 1;
				if(this.mapwindow_x > this.demo.maxx) this.mapwindow_x = this.demo.maxx;
				if(this.mapwindow_y > this.demo.maxy) this.mapwindow_y = this.demo.maxy;
				lastE = e;
				this.follow_desc = null;
			}
			document.addEventListener("mouseup", mouseup);
			document.addEventListener("mousemove", mousemove);
			e.preventDefault();
		}
	}
	keydown(e) {
		this.canvas.focus();
		if(e.code == "PageDown") {
			this.mapwindow_z = Math.max(this.mapwindow_z - 1, 1);
		} else if(e.code == "PageUp") {
			this.mapwindow_z = Math.min(this.mapwindow_z + 1, this.demo.maxz);
		} else if(e.code == "Space") {
			if(e.shiftKey) {
				this.playback_speed = (this.playback_speed != 5) ? 5 : 1;
			} else if(e.ctrlKey) {
				this.playback_speed = (this.playback_speed != -3) ? -3 : 1;
			} else {
				this.playback_speed = (this.playback_speed == 0) ? 1 : 0;
			}
			e.preventDefault();
		} else if(e.code == "ArrowLeft") {
			this.advance_playhead(this.playhead - 50);
		} else if(e.code == "ArrowRight") {
			this.advance_playhead(this.playhead + 50);
		}
	}

	canvas_wheel(e) {
		this.mapwindow_log_zoom -= Math.max(-1, Math.min(1, e.deltaY / 100));
		this.mapwindow_log_zoom = Math.max(-5, Math.min(5, this.mapwindow_log_zoom));
		this.mapwindow_zoom = 2 ** Math.round(this.mapwindow_log_zoom);
		e.preventDefault();
	}

	animation_frame_callback(timestamp) {
		try {
			this.frame(timestamp);
		} catch(e) {
			console.error(e);
		}
		window.requestAnimationFrame(this.animation_frame_callback.bind(this));
	}

	draw_appearance(ctx, obj, parent_properties = null, atom) {
		if(obj.plane == 15) return; // remove lighting
		if(obj.invisibility > this.see_invisible) return; // nah
		//let effective_dir = ((obj.dir == 0) && parent_dir != null) ? parent_dir : obj.dir;
		let inh = {
			color: obj.color,
			dir: obj.dir,
			alpha: obj.alpha,
			pixel_x: obj.pixel_x,
			pixel_y: obj.pixel_y
		}
		if(parent_properties) {
			if(inh.dir == 0) inh.dir = parent_properties.dir;
			if(!(obj.appearance_flags & 4)) {
				inh.alpha *= (parent_properties.alpha / 255);
			}
			if(!(obj.appearance_flags & 2)) {
				if(!inh.color || inh.color.toLowerCase() == "#ffffff") inh.color = parent_properties.color;
			}
			if(!(obj.appearance_flags & 8)) {
				inh.pixel_x += parent_properties.pixel_x;
				inh.pixel_y += parent_properties.pixel_y;
			}
		}
		// slight hack:
		// I am not separating the overlays out to be sorted, because fuck that.
		for(let underlay of obj.underlays) {
			this.draw_appearance(ctx, underlay, inh, atom);
		}
		let icon_meta = this.icons.get(obj.icon);
		if(icon_meta) {
			let icon_state = obj.icon_state;
			if(icon_state == "?" && obj.icon == "icons/turf/space.dmi") {
				icon_state = `${(((atom.x + atom.y) ^ ~(atom.x * atom.y) + atom.z) % 25 + 25) % 25}`;
			}
			let icon_state_meta = icon_meta.icon_states.get(icon_state) || icon_meta.icon_states.get(" ") || icon_meta.icon_states.get("");
			if(icon_state_meta) {
				let dir_meta = null;
				let progression = dir_progressions[icon_state_meta.dir_count] || dir_progressions[1];
				dir_meta = icon_state_meta.dirs.get(progression[inh.dir]) || icon_state_meta.dirs.get(2);
				if(dir_meta) {
					let icon_time = this.playhead % dir_meta.total_delay;
					let icon_frame = 0;
					let accum_delay = 0;
					for(let i = 0; i < dir_meta.frames.length; i++) {
						accum_delay += dir_meta.frames[i].delay;
						if(accum_delay > icon_time) {
							icon_frame = i;
							break;
						}
					}
					let frame_meta = dir_meta.frames[icon_frame >= 0 && icon_frame < dir_meta.frames.length ? icon_frame : 0];

					let image = icon_meta.image;

					if(inh.color && typeof inh.color == "string" && inh.color.toLowerCase() != "#ffffff") {
						color_canvas.width = Math.max(color_canvas.width, icon_state_meta.width);
						color_canvas.height = Math.max(color_canvas.height, icon_state_meta.height);
						let cctx = color_canvas.getContext('2d');
						cctx.clearRect(0, 0, icon_state_meta.width + 1, icon_state_meta.height + 1);
						cctx.fillStyle = inh.color;
						cctx.globalCompositeOperation = "source-over";
						cctx.drawImage(image, frame_meta.x, frame_meta.y, icon_state_meta.width, icon_state_meta.height, 0, 0, icon_state_meta.width, icon_state_meta.height);
						cctx.globalCompositeOperation = "multiply";
						cctx.fillRect(0, 0, icon_state_meta.width, icon_state_meta.height);
						cctx.globalCompositeOperation = "destination-in";
						cctx.drawImage(image, frame_meta.x, frame_meta.y, icon_state_meta.width, icon_state_meta.height, 0, 0, icon_state_meta.width, icon_state_meta.height);
						cctx.globalCompositeOperation = "source-over";
						image = color_canvas;
						frame_meta = {x:0, y:0};
					}

					ctx.globalAlpha = inh.alpha / 255;
					// handle blend modes
					if(obj.blend_mode == 2) {
						ctx.globalCompositeOperation = "lighter";
					} else if(obj.blend_mode == 4) {
						ctx.globalCompositeOperation = "multiply";
					} else {
						ctx.globalCompositeOperation = "source-over";
					}

					ctx.drawImage(image, frame_meta.x, frame_meta.y, icon_state_meta.width, icon_state_meta.height, inh.pixel_x+obj.pixel_w, 32-icon_state_meta.height-inh.pixel_y-obj.pixel_z, icon_state_meta.width, icon_state_meta.height);
				}
			}
		}
		if(!obj.sorted_overlays) {
			obj.sorted_overlays = [...obj.overlays].sort((a,b) => {
				let a_layer = a.layer < 0 ? obj.layer : a.layer;
				let b_layer = b.layer < 0 ? obj.layer : b.layer;
				if(a_layer < b_layer)
					return a_layer - b_layer;
				let a_float_layer = a.layer < 0 ? a.layer : -1;
				let b_float_layer = b.layer < 0 ? b.layer : -1;
				if(a_float_layer < b_float_layer)
					return a_float_layer - b_float_layer;
				return 0;
			});
		}
		for(let overlay of obj.sorted_overlays) {
			this.draw_appearance(ctx, overlay, inh, atom);
		}
	}

	get_object(ref) {
		if(ref == null) return;
		if(ref[0] == '[') {
			let number = parseInt(ref.substring(1)); // parseInt ignores trailing characters, so no need to worry about the ] at the end. Also it handles the 0x at the front
			let ref_type = number >> 24;
			let ref_id = number & 0xFFFFFF;
			let type_array = this.object_ref_list[ref_type];
			if(type_array) {
				return type_array[ref_id];
			}
		} else {
			let split = ref.split(",");
			let x = +split[0];
			let y = +split[1];
			let z = +split[2];
			let z_array = this.turf_grid[z-1];
			if(z_array) {
				let y_array = z_array[y-1];
				if(y_array) {
					return y_array[x-1];
				}
			}
		}
	}
	set_object(ref, obj) {
		if(ref == null) return;
		if(ref[0] == '[') {
			let number = parseInt(ref.substring(1)); // parseInt ignores trailing characters, so no need to worry about the ] at the end. Also it handles the 0x at the front
			let ref_type = number >> 24;
			let ref_id = number & 0xFFFFFF;
			let type_array = this.object_ref_list[ref_type];
			if(!type_array) {
				this.object_ref_list[ref_type] = type_array = [];
			}
			type_array[ref_id] = obj;
		} else {
			let split = ref.split(",");
			let x = +split[0];
			let y = +split[1];
			let z = +split[2];
			let z_array = this.turf_grid[z-1];
			if(!z_array) {
				this.turf_grid[z-1] = z_array = [];
			}
			let y_array = z_array[y-1];
			if(!y_array) {
				z_array[y-1] = y_array = [];
			}
			y_array[x-1] = obj;
		}
	}
}

function format_duration(total_seconds) {
	let hours = Math.floor(total_seconds / 3600);
	let minutes = Math.floor((total_seconds - (hours * 3600)) / 60);
	let seconds = total_seconds - (hours * 3600) - (minutes * 60);

	return `${hours}`.padStart(2, 0) + ":" + `${minutes}`.padStart(2, 0) + ":" + `${seconds}`.padStart(2, 0)
}

module.exports = DemoPlayer;
