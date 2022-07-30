import { FollowDesc } from "../player/rendering/commands";
import { ContextMenu, Menu } from "./menu";
import { DemoPlayerUi } from "./ui";
// @ts-ignore
import classes from "./viewport.scss";

const MIN_ZOOM = -6;
const MAX_ZOOM = 6;

export class DemoPlayerViewport {
	viewport_div = document.createElement("div");

	viewport_elements : ViewportElement[] = [];

	followview : ViewportElement = {elem: document.createElement("div"), x:0,y:0,width:0,height:0};

	x : number = 128;
	y : number = 128;
	log_zoom : number = 0;
	zoom : number = 1;
	current_follow : FollowDesc|undefined = undefined;

	icon_width : number = 32;
	icon_height : number = 32;

	pointers : {id: number, x:number, y:number, down_time:number, total_move:number}[] = [];

	stop_following_button = document.createElement("button");

	constructor(public ui : DemoPlayerUi) {
		this.viewport_div.classList.add(classes.viewport);
		document.body.appendChild(this.viewport_div);
		this.viewport_div.tabIndex = 0;
		this.viewport_div.addEventListener("mousedown", this.handle_mousedown);
		this.viewport_div.addEventListener("wheel", this.handle_wheel);
		
		this.viewport_div.addEventListener("pointerdown", this.handle_pointerdown);
		this.viewport_div.addEventListener("pointermove", this.handle_pointermove);
		this.viewport_div.addEventListener("pointerup", this.handle_pointerup);
		this.viewport_div.addEventListener("pointercancel", this.handle_pointerup);
		//this.viewport_div.addEventListener("pointerout", this.handle_pointerup);
		this.viewport_div.addEventListener("pointerleave", this.handle_pointerup);
		this.viewport_div.addEventListener("keydown", this.handle_keydown);

		this.viewport_div.addEventListener("focus", this.handle_focus);
		this.viewport_div.addEventListener("blur", this.handle_blur);

		this.viewport_div.addEventListener("contextmenu", this.handle_contextmenu);
		this.viewport_div.addEventListener("dblclick", this.handle_doubleclick);

		this.followview.elem.classList.add(classes.followview);
		this.add_viewport_element(this.followview);

		let stop_following_container = document.createElement("div");
		stop_following_container.classList.add(classes.stop_following_container);
		document.body.appendChild(stop_following_container);
		stop_following_container.appendChild(this.stop_following_button);
		this.stop_following_button.textContent = "Stop Following";
		this.stop_following_button.addEventListener("click", () => {
			this.follow(null);
			this.update_viewport();
		})

		let resize_observer = new ResizeObserver(() => {
			this.update_viewport();
		});
		resize_observer.observe(this.viewport_div);

		this.update_viewport();
	}

	follow(ref?: number|string|null) {
		if((ref == null && this.current_follow == null) || (ref != null && this.current_follow?.ref == ref)) return;
		this.current_follow = ref != null ? {ref, x:undefined, y:undefined} : undefined;
		let chat_target = (typeof ref == "string" ? ref : undefined);
		for(let chat of this.ui.chat_windows) {
			if(chat.follow_follower) {
				chat.set_chat_target(chat_target);
			}
		}
		this.ui.update_hash();
	}

	update_nerdy_stats(text : string) {
		this.ui.nerdy_stats.textContent = text;
	}

	add_viewport_element(element : ViewportElement) {
		this.viewport_elements.push(element);
		this.viewport_div.appendChild(element.elem);
	}

	private update_zoom() {
		this.log_zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.log_zoom));
		let eff_log_zoom = this.log_zoom;
		if(Math.abs(Math.round(eff_log_zoom) - eff_log_zoom) < 0.002) eff_log_zoom = Math.round(eff_log_zoom);
		this.zoom = 2 ** eff_log_zoom;
	}
	update_viewport() {
		this.update_zoom();
		if(this.x > 5000) this.x = 5000;
		if(this.x < -5000) this.x = -5000;
		if(this.y > 5000) this.y = 5000;
		if(this.y < -5000) this.y = -5000;
		let viewport_rect = this.viewport_div.getBoundingClientRect();
		for(let {x,y,width,height,elem} of this.viewport_elements) {
			elem.style.position = "absolute";
			elem.style.left = (viewport_rect.width / 2 + ((x-this.x) * this.icon_width * this.zoom)) + "px";
			elem.style.bottom = (viewport_rect.height / 2 + ((y-this.y) * this.icon_height * this.zoom)) + "px";
			elem.style.width = (this.icon_width * this.zoom * width) + "px";
			elem.style.height = (this.icon_height * this.zoom * height) + "px";
		}
		this.stop_following_button.style.display = this.current_follow ? "unset" : "none";
	}

	handle_keydown = (e : KeyboardEvent) => {
		if(e.defaultPrevented) return;
		if(e.code == "PageDown") {
			this.ui.player.adjust_z(-1);
			e.preventDefault();
		} else if(e.code == "PageUp") {
			this.ui.player.adjust_z(1);
			e.preventDefault();
		} else if(e.code == "Escape") {
			this.follow(null);
		}
	}

	handle_mousedown = (e1 : MouseEvent) => {
		if(e1.button != 0 && e1.button != 1) return;
		let handle_mousemove = (e2 : MouseEvent) => {
			let dx = e2.clientX - e1.clientX;
			let dy = e2.clientY - e1.clientY;
			e1 = e2;
			this.x -= dx / this.zoom / this.icon_width;
			this.y += dy / this.zoom / this.icon_height;
			this.update_viewport();
			e2.preventDefault();
			
		};
		let handle_mouseup = () => {
			document.removeEventListener("mousemove", handle_mousemove);
			document.removeEventListener("mouseup", handle_mouseup);
			this.ui.update_hash();
		};
		document.addEventListener("mousemove", handle_mousemove);
		document.addEventListener("mouseup", handle_mouseup);
		if(document.activeElement != this.viewport_div) {
			(document.activeElement as HTMLElement|null)?.blur?.();
			this.viewport_div.focus();
		}
		e1.preventDefault();
	}

	adjust_zoom(zoom_adj:number, x1:number,y1:number,x2=x1,y2=y1) {
		let viewport_rect = this.viewport_div.getBoundingClientRect();
		let follow_dx = 0, follow_dy = 0;
		if(this.current_follow && this.current_follow.x != null && this.current_follow.y != null) {
			follow_dx = this.current_follow.x - this.x;
			follow_dy = this.current_follow.y - this.y;
			this.x += follow_dx;
			this.y += follow_dy;
		} else {
			this.x += (x1 - (viewport_rect.left+viewport_rect.right)/2) / this.zoom / this.icon_width;
			this.y += -(y1 - (viewport_rect.top+viewport_rect.bottom)/2) / this.zoom / this.icon_height;
		}
		let prev_zoom = this.zoom;
		this.log_zoom += zoom_adj;
		this.update_zoom();

		if(this.current_follow && this.current_follow.x != null && this.current_follow.y != null) {
			this.x -= follow_dx * prev_zoom / this.zoom;
			this.y -= follow_dy * prev_zoom / this.zoom;
		} else {
			this.x -= (x2 - (viewport_rect.left+viewport_rect.right)/2) / this.zoom / this.icon_width;
			this.y -= -(y2 - (viewport_rect.top+viewport_rect.bottom)/2) / this.zoom / this.icon_height;
		}
		this.update_viewport(); 
	}

	handle_wheel = async(e : WheelEvent) => {
		e.preventDefault();
		let delta_y = e.deltaY / 2;
		if(e.deltaMode == WheelEvent.DOM_DELTA_PIXEL) delta_y /= 100;
		if(e.deltaMode == WheelEvent.DOM_DELTA_LINE) delta_y /= 3;
		let zoom_adj = -Math.max(-1, Math.min(1, delta_y));
		let zoom_dir = Math.sign(zoom_adj);
		zoom_adj = Math.abs(zoom_adj);
		if(zoom_adj > 0.25) {
			let a = performance.now();
			let b;
			while(zoom_adj > 1/1024) {
				b = await new Promise(requestAnimationFrame);
				if((zoom_dir > 0 && this.log_zoom >= MAX_ZOOM) || (zoom_dir < 0 && this.log_zoom <= MIN_ZOOM)) break;
				let this_adj = Math.min(zoom_adj, (b - a) * 0.005);
				this.adjust_zoom(this_adj * zoom_dir, e.clientX, e.clientY);
				zoom_adj -= this_adj;

				a = b;
			}
		} else {
			this.adjust_zoom(zoom_adj * zoom_dir, e.clientX, e.clientY);
		}
		this.ui.update_hash();
	};

	get_pointer_index(id : number) {
		for(let i = 0; i < this.pointers.length; i++) {
			if(this.pointers[i].id == id) return i;
		}
		return -1;
	}
	handle_pointerdown = (e : PointerEvent) => {
		if(e.pointerType == "mouse") return;
		let pointer = {id:e.pointerId, x:e.clientX, y:e.clientY, down_time:e.timeStamp,total_move: 0};
		this.viewport_div.setPointerCapture(e.pointerId);
		this.pointers.unshift(pointer);
		e.preventDefault();
		if(document.activeElement != this.viewport_div) {
			(document.activeElement as HTMLElement|null)?.blur?.();
			this.viewport_div.focus();
		}
		setTimeout(() => {
			if(pointer.total_move < 10 && this.pointers.length == 1 && this.pointers[0] == pointer) {
				this.pointers.length = 0;
				this.handle_contextmenu({clientX: pointer.x, clientY: pointer.y});
			}
		}, 600);
	};
	get_pointers_xyd() {
		let x = this.pointers[0].x;
		let y = this.pointers[0].y;
		let dist = 1;
		if(this.pointers.length >= 2) {
			x += this.pointers[1].x;
			x /= 2;
			y += this.pointers[1].y;
			y /= 2;
			dist = Math.sqrt((this.pointers[1].x - this.pointers[0].x)**2 + (this.pointers[1].y - this.pointers[0].y)**2);
		}
		if(dist < 0.1) dist = 0.1;
		return [x,y,dist];
	}
	handle_pointermove = (e : PointerEvent) => {
		let index = this.get_pointer_index(e.pointerId);
		if(index < 0 || this.pointers.length < 1) return;
		e.preventDefault();
		let [x1, y1, dist1] = this.get_pointers_xyd();
		this.pointers[index].total_move += Math.abs(e.clientX-this.pointers[index].x) + Math.abs(e.clientY-this.pointers[index].y);
		this.pointers[index].x = e.clientX;
		this.pointers[index].y = e.clientY;
		let [x2, y2, dist2] = this.get_pointers_xyd();

		if(this.pointers.length == 1) {
			this.x -= (x2-x1) / this.zoom / this.icon_width;
			this.y += (y2-y1) / this.zoom / this.icon_height;
			this.update_viewport();
		} else {
			this.adjust_zoom(Math.max(-1, Math.min(1, Math.log2(dist2 / dist1))), x1, y1, x2, y2);
		}
	};
	last_shorttap : number = -123456;
	last_shorttap_x : number = 0;
	last_shorttap_y : number = 0;
	handle_pointerup = (e : PointerEvent) => {
		let index = this.get_pointer_index(e.pointerId);
		if(index < 0) return;
		let pointer = this.pointers[index];
		this.pointers.splice(index, 1);
		e.preventDefault();
		if((e.timeStamp - pointer.down_time) < 300 && pointer.total_move < 10 && Math.abs(pointer.x - this.last_shorttap_x) < 10 && Math.abs(pointer.y - this.last_shorttap_y)) {
			if(pointer.down_time - this.last_shorttap < 600) {
				this.handle_doubleclick(e);
			} else {
				this.last_shorttap = pointer.down_time;
				this.last_shorttap_x = pointer.x;
				this.last_shorttap_y = pointer.y;
			}
		}
		if(!this.pointers.length) {
			this.ui.update_hash();
		}
	};

	get_turf_window() {
		let viewport_rect = this.viewport_div.getBoundingClientRect();
		return {
			left: this.x - (viewport_rect.width/2/this.zoom/this.icon_width),
			right: this.x + (viewport_rect.width/2/this.zoom/this.icon_width),
			bottom: this.y - (viewport_rect.height/2/this.zoom/this.icon_height),
			top: this.y + (viewport_rect.height/2/this.zoom/this.icon_height),
			pixel_scale: this.zoom * devicePixelRatio,
			follow: this.current_follow
		};
	}


	handle_focus = () => {
		const viewportmeta = document.querySelector('meta[name=viewport]');
		if(viewportmeta) viewportmeta.setAttribute('content', "width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0");
	}
	handle_blur = () => {
		const viewportmeta = document.querySelector('meta[name=viewport]');
		if(viewportmeta) viewportmeta.setAttribute('content', "width=device-width, initial-scale=1.0");
	}

	handle_contextmenu = (e : {clientX:number,clientY:number}) => {
		if(e instanceof Event) e.preventDefault();
		this.pointers.length = 0;
		let viewport_rect = this.viewport_div.getBoundingClientRect();
		let x = this.x + (e.clientX - (viewport_rect.left+viewport_rect.right)/2) / this.zoom / this.icon_width;
		let y = this.y - (e.clientY - (viewport_rect.top+viewport_rect.bottom)/2) / this.zoom / this.icon_height;
		let menu = new ContextMenu(this.ui, x, y);
		menu.enable_absolute_position();
		menu.panel_div.style.left = e.clientX + "px";
		menu.panel_div.style.top = e.clientY + "px";
		menu.open(true);
	}

	handle_doubleclick = async (e : {clientX:number,clientY:number}) => {
		if(e instanceof Event) e.preventDefault();
		this.last_shorttap = -123456;
		let viewport_rect = this.viewport_div.getBoundingClientRect();
		let x = this.x + (e.clientX - (viewport_rect.left+viewport_rect.right)/2) / this.zoom / this.icon_width;
		let y = this.y - (e.clientY - (viewport_rect.top+viewport_rect.bottom)/2) / this.zoom / this.icon_height;

		let ref = await this.ui.player.get_clicked_object_ref(x, y);
		if(ref) {
			this.ui.open_inspector(ref);
		}
	}
}

export interface ViewportElement {
	x: number;
	y: number;
	width: number;
	height: number;
	elem: HTMLElement;
}
