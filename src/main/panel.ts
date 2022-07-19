// @ts-ignore
import classes from "./panel.scss";

export class Panel extends EventTarget {
	protected container_div = document.createElement("div");
	panel_div = document.createElement("div");
	protected header_div = document.createElement("div");
	protected content_div = document.createElement("div");

	protected close_button = document.createElement("button");
	protected collapse_button = document.createElement("button");
	protected transparent_button? : HTMLButtonElement;
	protected title_span = document.createElement("span");
	protected drag_handle_div = document.createElement("div");

	constructor(title = "Title", modal = false) {
		super();
		this.container_div.classList.add(classes.panel_container);
		if(modal) this.container_div.classList.add(classes.modal);
		
		this.panel_div.tabIndex = 0;
		this.panel_div.classList.add(classes.panel);
		this.container_div.appendChild(this.panel_div);

		this.header_div.classList.add(classes.panel_header);
		this.header_div.addEventListener("pointerdown", this.header_pointerdown);
		this.panel_div.appendChild(this.header_div);

		this.collapse_button.classList.add(classes.collapse_button);
		this.collapse_button.addEventListener("click", this.toggle_collapse);
		this.header_div.appendChild(this.collapse_button);

		this.close_button.classList.add(classes.close_button);
		this.close_button.addEventListener("click", this.close.bind(this));
		this.header_div.appendChild(this.close_button);

		this.header_div.appendChild(this.title_span);
		this.title_span.textContent = title;

		this.content_div.classList.add(classes.panel_content);
		this.panel_div.appendChild(this.content_div);

		this.drag_handle_div.classList.add(classes.drag_handle);
		this.drag_handle_div.addEventListener("pointerdown", this.resize_pointerdown);
		this.panel_div.appendChild(this.drag_handle_div);

		this.panel_div.addEventListener("focusin", async () => {
			let max_z_index = 10;
			for(let container of document.body.querySelectorAll("." + classes.panel_container)) {
				if(container == this.container_div) continue;
				max_z_index = Math.max(max_z_index, +((<HTMLDivElement>container).style.zIndex || 10));
			}
			this.container_div.style.zIndex = ""+(max_z_index+1);
		});
	}

	set_fixed_size(width? : number|string, height? : number|string) {
		if(width == undefined || height == undefined) {
			let rect = this.panel_div.getBoundingClientRect();
			if(width == undefined) width = rect.width;
			if(height == undefined) height = rect.height;
		}
		if(typeof width == "number") width = width + "px";
		if(typeof height == "number") height = height + "px";
		this.panel_div.style.setProperty("--min-width", width);
		this.panel_div.style.setProperty("--min-height", height);
		this.panel_div.style.setProperty("--max-width", width);
		this.panel_div.style.setProperty("--max-height", height);
	}

	enable_absolute_position() {
		this.container_div.classList.add(classes.positioned);
	}

	header_pointerdown = (e1:PointerEvent) => {
		if((e1.target as HTMLElement|null)?.closest?.("button")) return;
		this.take_focus();
		e1.preventDefault();
		let pointermove = (e2:PointerEvent) => {
			if(e2.pointerId != e1.pointerId) return;
			e2.preventDefault();
			let rect = this.panel_div.getBoundingClientRect();
			let dx = e2.clientX - e1.clientX;
			let dy = e2.clientY - e1.clientY;
			e1 = e2;
			this.container_div.classList.add(classes.positioned);
			this.panel_div.style.left = Math.max(0, rect.left + dx) + "px";
			this.panel_div.style.top = Math.max(0, rect.top + dy) + "px";
		}
		let pointerup = (e2:PointerEvent) => {
			if(e2.pointerId != e1.pointerId) return;
			document.removeEventListener("pointermove", pointermove);
			document.removeEventListener("pointerup", pointerup);
			document.removeEventListener("pointercancel", pointerup);
		}
		document.addEventListener("pointermove", pointermove);
		document.addEventListener("pointerup", pointerup);
		document.addEventListener("pointercancel", pointerup);
	}

	resize_pointerdown = (e1:PointerEvent) => {
		if((e1.target as HTMLElement|null)?.closest?.("button")) return;
		this.take_focus();
		e1.preventDefault();
		let pointermove = (e2:PointerEvent) => {
			if(e2.pointerId != e1.pointerId) return;
			e2.preventDefault();
			let rect = this.panel_div.getBoundingClientRect();
			let dx = e2.clientX - e1.clientX;
			let dy = e2.clientY - e1.clientY;
			e1 = e2;
			this.set_fixed_size(rect.width + dx, rect.height + dy);
			this.container_div.classList.add(classes.positioned);
			this.panel_div.style.left = Math.max(0, rect.left) + "px";
			this.panel_div.style.top = Math.max(0, rect.top) + "px";
		}
		let pointerup = (e2:PointerEvent) => {
			if(e2.pointerId != e1.pointerId) return;
			document.removeEventListener("pointermove", pointermove);
			document.removeEventListener("pointerup", pointerup);
			document.removeEventListener("pointercancel", pointerup);
		}
		document.addEventListener("pointermove", pointermove);
		document.addEventListener("pointerup", pointerup);
		document.addEventListener("pointercancel", pointerup);
	}

	add_transparent_toggle() {
		if(this.transparent_button) return;
		let button = document.createElement("button");
		button.classList.add(classes.transparent_button);
		button.addEventListener("click", this.toggle_transparent);
		this.header_div.appendChild(button);
		this.transparent_button = button;
	}

	toggle_transparent = () => {
		if(this.container_div.classList.contains(classes.docked)) return;
		this.panel_div.classList.toggle(classes.transparent);
	}
	toggle_collapse = () => {
		this.panel_div.classList.toggle(classes.collapsed);
	}
	get is_open() {
		return document.body.contains(this.container_div);
	}

	take_focus() {
		if(document.activeElement && this.panel_div.contains(document.activeElement)) return;
		(document.activeElement as HTMLElement)?.blur()
		this.panel_div.focus();
	}

	close() {
		if(!document.body.contains(this.container_div)) return;
		document.body.removeChild(this.container_div);
		this.dispatchEvent(new Event('close'));
	}
	open(take_focus = false) {
		if(document.body.contains(this.container_div)) return;
		document.body.appendChild(this.container_div);
		if(take_focus) this.take_focus();
		this.dispatchEvent(new Event('open'));
	}
}