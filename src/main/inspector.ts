import { InspectData } from "../player/player";
// @ts-ignore
import classes from "./inspector.scss";
import { Panel } from "./panel";
import { ProgressSpinner } from "./progress_spinner";
import { DemoPlayerUi } from "./ui";
import * as Comlink from "comlink";

export class InspectorPanel extends Panel {
	canvases : Map<HTMLCanvasElement, number> = new Map();

	main_canvas : HTMLCanvasElement;
	main_name : HTMLElement = document.createElement("h3");
	main_ref : HTMLElement = document.createElement("div");

	spinner : ProgressSpinner = new ProgressSpinner();

	clients_label = document.createElement("h3");
	clients_elem = document.createElement("div");

	location_label = document.createElement("h3");
	location_elem = document.createElement("div");

	contents_label = document.createElement("h3");
	contents_elem = document.createElement("div");

	follow_button = document.createElement("button");

	constructor(public ui : DemoPlayerUi, public ref : number) {
		super("Inspector");

		this.panel_div.style.setProperty("--min-width", "300px");
		this.panel_div.style.setProperty("--max-width", "600px");
		this.panel_div.style.setProperty("--max-height", "750px");

		this.main_canvas = document.createElement("canvas");
		this.main_canvas.classList.add(classes.main_canvas);
		this.content_div.appendChild(this.main_canvas);
		this.add_canvas(this.main_canvas, ref);

		this.main_name.classList.add(classes.name);
		this.content_div.appendChild(this.main_name);
		this.main_ref.textContent = `[0x${ref.toString(16)}]`;
		this.main_ref.classList.add(classes.ref)
		this.content_div.appendChild(this.main_ref);

		//let follow_clear = document.createElement("div");
		//follow_clear.classList.add(classes.clear);
		//this.content_div.appendChild(follow_clear);

		this.follow_button.textContent = "Follow Object";
		this.follow_button.style.display = ((this.ref >> 24) != 1) ? "inline-block" : "none";
		this.follow_button.classList.add(classes.follow_button);
		this.follow_button.addEventListener("click", () => {ui.viewport.follow(this.ref)});
		this.content_div.append(this.follow_button);

		this.content_div.appendChild(this.clients_elem);

		let hr = document.createElement("hr");
		hr.classList.add(classes.clear);
		this.content_div.appendChild(hr);
		this.content_div.appendChild(this.spinner.element);

		this.location_label.style.display = "none";
		this.location_label.textContent = "Location";
		this.contents_label.style.display = "none";
		this.contents_label.textContent = "Contents";
		this.content_div.append(this.location_label, this.location_elem, this.contents_label, this.contents_elem);

		this.content_div.addEventListener("click", this.handle_global_click);

		this.addEventListener("close", () => {
			this.detach_hooks();
			let index = this.ui.inspectors.indexOf(this);
			if(index >= 0) this.ui.inspectors.splice(index, 1);
		});
		this.addEventListener("open", () => {
			this.attach_hooks();
			this.ui.inspectors.push(this);
		});
	}

	private remove_inspector_callback : undefined|Promise<()=>void>;
	attach_hooks() {
		for(let [canvas,ref] of this.canvases) this.ui.object_canvases.set(canvas, {ref});
		if(!this.remove_inspector_callback) {
			this.remove_inspector_callback = this.ui.player.add_inspect_listener(this.ref, Comlink.proxy(this.update_contents_callback) as unknown as Comlink.Remote<typeof this.update_contents_callback>);
		}
	}
	detach_hooks() {
		for(let canvas of this.canvases.keys()) this.ui.object_canvases.delete(canvas);
		if(this.remove_inspector_callback) {
			this.remove_inspector_callback.then(cb => {
				cb();
				(cb as Comlink.Remote<typeof cb>)[Comlink.releaseProxy]();
			});
			this.remove_inspector_callback = undefined;
		}
	}

	add_canvas(canvas : HTMLCanvasElement, ref: number) {
		if(this.canvases.get(canvas) == ref) return;
		this.canvases.set(canvas, ref);
		if(this.is_open) this.ui.object_canvases.set(canvas, {ref});
	}
	remove_canvas(canvas? : HTMLCanvasElement|null) {
		if(!canvas) return;
		this.canvases.delete(canvas);
		this.ui.object_canvases.delete(canvas);
	}

	change_to_ref(new_ref : number) {
		if(new_ref == this.ref) return;
		if(!this.is_open) {
			this.ref = new_ref;
			return;
		}
		this.detach_hooks();
		this.ref = new_ref;
		this.attach_hooks();
	}

	handle_global_click = (e : MouseEvent) => {
		if(!(e.target instanceof HTMLElement)) return;
		let inspect_button = e.target.closest("." + classes.inspect_button);
		if(inspect_button) {
			let ref = inspect_button.parentElement?.dataset.ref;
			if(ref) {
				if(e.ctrlKey) {
					this.ui.open_inspector(+ref);
				} else {
					this.change_to_ref(+ref);
				}
			}
		}
	}

	create_object_element(obj : {name:string,ref:number}|null, elem?:HTMLElement|null) {
		if(!elem) {
			elem = document.createElement("div");
		}
		elem.classList.add(classes.subobject);
		if(obj) {
			elem.style.display = "block";
			elem.dataset.ref = ""+obj.ref;

			let inspect_button = elem.querySelector("." + classes.inspect_button);
			if(!inspect_button) {
				inspect_button = document.createElement("button");
				inspect_button.classList.add(classes.inspect_button);
				elem.appendChild(inspect_button);
			}
			
			let canvas = elem.querySelector("canvas");
			if(!canvas) {
				canvas = document.createElement("canvas");
				canvas.classList.add(classes.other_canvas);
				inspect_button.appendChild(canvas);
			}
			this.add_canvas(canvas, obj.ref);

			let name_elem = elem.querySelector("." + classes.name);
			if(!name_elem) {
				name_elem = document.createElement("b");
				name_elem.classList.add(classes.name);
				inspect_button.appendChild(name_elem);
			}
			name_elem.textContent = obj.name;

			let ref_elem = elem.querySelector("." + classes.ref);
			if(!ref_elem) {
				ref_elem = document.createElement("span");
				ref_elem.classList.add(classes.ref);
				inspect_button.appendChild(ref_elem);
			}
			ref_elem.textContent = `[0x${obj.ref.toString(16)}]`;
			if(!elem.querySelector("." + classes.clear)) {
				let div = document.createElement("div");
				div.classList.add(classes.clear);
				inspect_button.appendChild(div);
			}
		} else {
			elem.style.display = "none";
			elem.dataset.ref = "";
			this.remove_canvas(elem.querySelector("canvas"));
		}
		return elem;
	}

	update_contents_callback = (data : InspectData) => {
		if(data.ref != this.ref) {
			console.warn(`Received non-matching ref on inspecter, [0x${data.ref.toString(16)}] != [0x${this.ref.toString(16)}]`);
			return;
		}
		let had_focus = !!document.activeElement && this.panel_div.contains(document.activeElement);
		
		this.follow_button.style.display = ((data.ref >> 24) != 1) ? "inline-block" : "none";
		
		this.spinner.element.style.display = "none";
		
		this.main_name.textContent = data.name;
		this.main_ref.textContent = `[0x${data.ref.toString(16)}]`;
		if(this.canvases.get(this.main_canvas) != data.ref) {
			this.add_canvas(this.main_canvas, data.ref);
		}
		
		let loc_obj = data.loc;
		if((data.ref >> 24) != 1 && !loc_obj) loc_obj = {name: "null", ref: 0};
		this.create_object_element(loc_obj, this.location_elem);
		this.location_label.style.display = loc_obj ? "block" : "none";

		let contents_elems : HTMLElement[] = [];
		for(let item of data.contents) {
			let elem = this.create_object_element(item, <HTMLElement|null>this.contents_elem.querySelector(`div[data-ref="${item.ref}"]`));
			contents_elems.push(elem);
		}
		for(let i = 0; i < data.contents.length; i++) {
			if(this.contents_elem.children[i] != contents_elems[i]) {
				this.contents_elem.insertBefore(contents_elems[i], this.contents_elem.children[i] ?? null);
			}
		}
		while(this.contents_elem.children.length > data.contents.length) {
			this.remove_canvas(this.contents_elem.lastElementChild?.querySelector("canvas"));
			this.contents_elem.removeChild(this.contents_elem.lastElementChild as Element);
		}

		let clients_elems : HTMLElement[] = [];
		for(let client of data.clients) {
			let elem = <HTMLElement|null>this.contents_elem.querySelector(`div[data-client="${client}"]`);
			if(!elem) {
				elem = document.createElement("button");
				let label = document.createElement("span");
				label.textContent = "Follow Client";
				let ckey = document.createElement("span");
				ckey.classList.add(classes.ref);
				ckey.textContent = client;
				elem.dataset.client = client;
				elem.append(label, ckey);
				elem.style.display = ((this.ref >> 24) != 1) ? "inline-block" : "none";
				elem.classList.add(classes.follow_button);
				elem.addEventListener("click", this.ui.viewport.follow.bind(this.ui.viewport, client));
			}
			clients_elems.push(elem);
		}
		for(let i = 0; i < data.clients.length; i++) {
			if(this.clients_elem.children[i] != clients_elems[i]) {
				this.clients_elem.insertBefore(clients_elems[i], this.clients_elem.children[i] ?? null);
			}
		}
		while(this.clients_elem.children.length > data.clients.length) {
			this.clients_elem.removeChild(this.clients_elem.lastElementChild as Element);
		}

		this.contents_label.style.display = data.contents.length ? "block" : "none";
		if(had_focus) this.panel_div.focus();
	}
}