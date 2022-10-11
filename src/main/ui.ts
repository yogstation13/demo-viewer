// @ts-ignore
import classes from './ui.scss';
import { DemoPlayer } from "../player/player";
import * as Comlink from "comlink";
import { DemoPlayerTimeControls } from "./time_controls";
import { DemoPlayerViewport } from "./viewport";
import { DemoPlayerGlHolder } from "./rendering/gl_holder";
import { RenderingCmd } from "../player/rendering/commands";
import { Panel } from "./panel";
import { ChatPanel } from "./chat";
import { PlayerOptions } from "./options";
import { InspectorPanel } from "./inspector";
import { MainMenu } from './menu';

export class DemoPlayerUi {
	gl_holder : DemoPlayerGlHolder;
	time_controls : DemoPlayerTimeControls;
	viewport : DemoPlayerViewport;

	inspectors : InspectorPanel[] = [];
	chat_windows : ChatPanel[] = [];

	object_canvases = new Map<HTMLCanvasElement, {
		ref: number,
		remove_when_done?: boolean
	}>();

	corner_container = document.createElement("div");
	menu_button = document.createElement("button");
	menu : MainMenu|undefined;
	nerdy_stats = document.createElement("pre");


	constructor(public player : Comlink.Remote<DemoPlayer>) {
		//@ts-ignore
		window.demo_player_ui = this;
		// @ts-ignore
		player.ui = Comlink.proxy(this);

		this.viewport = new DemoPlayerViewport(this);
		this.gl_holder = new DemoPlayerGlHolder(this);
		this.time_controls = new DemoPlayerTimeControls(this);
		
		document.body.appendChild(this.corner_container);
		this.corner_container.classList.add(classes.corner_container);
		this.corner_container.appendChild(this.menu_button);
		this.menu_button.classList.add(classes.menu_button);
		this.corner_container.appendChild(this.nerdy_stats);
		this.nerdy_stats.classList.add(classes.nerdy_stats);
		this.menu_button.addEventListener("click", () =>{
			if(!this.menu) this.menu = new MainMenu(this);
			this.menu.put_below(this.menu_button);
			this.menu.open();
		})
		
		player.initialize_ui();
		this.frame_loop();
		if(PlayerOptions.get("startup_chat") != "false") new ChatPanel(this).open();

		this.update_from_hash();
		window.addEventListener("hashchange", this.update_from_hash.bind(this));
	}

	private async frame_loop() {
		try {
			let t1 = await new Promise(requestAnimationFrame);
			let t2 = await new Promise(requestAnimationFrame);

			let fps = NaN, worker_frame_time = NaN, gl_frame_time = NaN;

			let last_frame_data : RenderingCmd[]|undefined;
			let last_canvas_list : HTMLCanvasElement[] = [];
			let frame_func = async (dt:number, playback_speed:number, canvas_draw_list: {ref:number,width:number,height:number}[]) => {
				let a = performance.now();
				let frame_data = await this.player.run_frame(dt, playback_speed, this.viewport.get_turf_window(), canvas_draw_list);
				let b = performance.now();
				worker_frame_time = b-a;
				return frame_data;
			}
			while(true) {
				let dt = t2 - t1;
				fps = 1000/dt;
				let playback_speed = this.time_controls.playback_speed_override || this.time_controls.playback_speed;
				if(this.time_controls.dragging) playback_speed = 0;
				
				let canvas_draw_list : {ref:number, width:number, height:number}[] = [];
				let canvas_list : HTMLCanvasElement[] = [];
				for(let [canvas, thing] of this.object_canvases) {
					let rect = canvas.getBoundingClientRect();
					if(!(rect.width == 0 || rect.height == 0)) {
						if(thing.ref == 0) {
							canvas.width = canvas.width;
						} else {
							canvas_draw_list.push({
								width: rect.width * devicePixelRatio, height: rect.height * devicePixelRatio,
								ref: thing.ref
							});
							canvas_list.push(canvas);
						}
					}
					if(thing.remove_when_done) this.object_canvases.delete(canvas);
				}

				let frame_data_promise = frame_func(dt, playback_speed, canvas_draw_list);

				if(last_frame_data) {
					let a = performance.now();
					await this.gl_holder.process_frame_data(last_frame_data, t2, last_canvas_list);
					let b = performance.now();
					gl_frame_time = b-a;
				}
				this.viewport.update_viewport();
				last_frame_data = await frame_data_promise
				last_canvas_list = canvas_list;

				this.viewport.update_nerdy_stats(`FPS: ${fps.toFixed(2)}\nFrame time (worker): ${worker_frame_time.toFixed(2)}ms\nWebGL time: ${gl_frame_time.toFixed(2)}ms\nExtra canvases: ${canvas_list.length}/${this.object_canvases.size}`)

				t1 = t2;
				t2 = await new Promise(requestAnimationFrame);


			}
		} catch(e) {
			this.report_error(e);
		}
	}

	report_error(e : any) {
		if("stack" in e) e = e+","+e.stack;
		else e = e+"";
		this.viewport.update_nerdy_stats(e);
	}

	update_time(time : number) {this.time_controls.update_time(time);}
	update_duration(duration : number) {this.time_controls.update_duration(duration);}

	open_inspector(ref : number) {
		for(let inspector of this.inspectors) {
			if(ref == inspector.ref) {
				inspector.take_focus();
				return;
			}
		}
		new InspectorPanel(this, ref).open(true);
	}

	private hash_z = 2;
	update_hash(new_z? : number) {
		if(new_z != undefined) this.hash_z = new_z;
		let follow_desc = "null";
		if(this.viewport.current_follow) {
			let ref = this.viewport.current_follow.ref;
			if(typeof ref == "string") follow_desc = ref;
			else follow_desc = `[0x${ref.toString(16)}]`;
		}
		// build the hash
		let hash = `#${Math.round(this.time_controls.current_time)};${this.viewport.x.toFixed(2)};${this.viewport.y.toFixed(2)};${this.hash_z};${follow_desc};${this.viewport.log_zoom.toFixed(1)}`;
		if(hash != window.location.hash)
			history.replaceState('', '', hash);
	}

	update_from_hash(e? : HashChangeEvent) {
		let hash = window.location.hash || '';
		if(hash[0] == '#') hash = hash.substring(1);
		if(e && e.newURL.includes("#")) hash = e.newURL.substring(e.newURL.indexOf("#") + 1);
		if(hash.length) {
			let split = hash.split(';');
			if(+split[0] == +split[0]) this.player.advance_time(+split[0]);
			if(+split[1] == +split[1]) {this.viewport.x = +split[1]; this.viewport.update_viewport();}
			if(+split[2] == +split[2]) {this.viewport.y = +split[2]; this.viewport.update_viewport();}
			if(+split[3] == +split[3]) {this.player.z_level = +split[3] as any as Promise<number>;}
			if(+split[5] == +split[5]) {this.viewport.log_zoom = +split[5]; this.viewport.update_viewport();}
			if(split[4] == "null") {
				this.viewport.follow(null);
			} else {
				let desc = split[4];
				let follow_ref : number|string;
				if(desc[0] == '[') {
					follow_ref = +desc.substring(1, desc.length-1);
				} else {
					follow_ref = desc;
				}
				this.viewport.follow(follow_ref);
			}
		}
	}
}