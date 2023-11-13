import { Panel } from "./panel";
import { ProgressSpinner } from "./progress_spinner";
import { DemoPlayerUi } from "./ui";
// @ts-ignore
import classes from "./menu.scss";
import { InspectorPanel } from "./inspector";
import { ChatPanel } from "./chat";
import { SeeInvisibility } from "../misc/constants";

export class Menu extends Panel {
	constructor() {
		super("", true);
		this.panel_div.style.setProperty("--max-height", "calc(90vh)");
		this.panel_div.removeChild(this.header_div);
		this.panel_div.removeChild(this.drag_handle_div);
		this.panel_div.classList.add(classes.no_min_height);
		this.content_div.classList.add(classes.menu_content);
		this.container_div.addEventListener("pointerdown", (e) => {if(e.target == this.container_div) this.close();});
		this.container_div.addEventListener("keydown", (e) => {if(e.code == "Escape") this.close();});
	}

	add_hr() {
		this.content_div.appendChild(document.createElement("hr"));
	}
	add_basic_button(text : string, subtext : string|null, action : (e:MouseEvent) => void) {
		let button = document.createElement("button");
		if(subtext) {
			let text_elem = document.createElement("span");
			text_elem.textContent = text;
			let subtext_elem = document.createElement("span");
			subtext_elem.textContent = subtext;
			subtext_elem.classList.add(classes.subtext);
			button.append(text,document.createElement("br"),subtext_elem);
		} else {
			button.textContent = text;
		}
		button.addEventListener("click", action);
		this.content_div.appendChild(button);
		return button;
	}

	put_to_right(elem : HTMLElement) {
		this.enable_absolute_position();
		let rect = elem.getBoundingClientRect();
		this.panel_div.style.left = (rect.x+rect.width) + "px";
		this.panel_div.style.top = rect.y + "px";
		return this;
	}
	put_below(elem : HTMLElement) {
		this.enable_absolute_position();
		let rect = elem.getBoundingClientRect();
		this.panel_div.style.left = rect.x + "px";
		this.panel_div.style.top = (rect.y+rect.height) + "px";
		return this;
	}
}

export class MainMenu extends Menu {
	constructor(public ui : DemoPlayerUi) {
		super();
		this.add_basic_button("Open Chat", null, () => {
			new ChatPanel(ui, false).open(true);
			this.close();
		});
		this.add_basic_button("Next Z-level", null, () => {
			this.ui.player.adjust_z(1);
		});
		this.add_basic_button("Previous Z-level", null, () => {
			this.ui.player.adjust_z(-1);
		});
		let clients_button = this.add_basic_button("Clients", null, () => {
			new ClientsMenu(this.ui, this).put_to_right(clients_button).open(true);
		});
		this.add_basic_button("Stats for Nerds", null, () => {
			this.ui.nerdy_stats.style.display = (this.ui.nerdy_stats.style.display == "block") ? "none" : "block";
			this.close();
		});
		let vision_button = this.add_basic_button("Set Vision", null, () => {
			new SeeInvisibilityMenu(this.ui).put_to_right(vision_button).open(true);
		});
		this.add_basic_button("Toggle Darkness", null, () => {
			this.ui.player.toggle_darkness();
			this.close();
		});
	}
}

export class ContextMenu extends Menu {
	load_spinner : ProgressSpinner;
	constructor(public ui : DemoPlayerUi, x:number, y:number) {
		super();
		this.load_spinner = new ProgressSpinner();
		this.content_div.appendChild(this.load_spinner.element);
		this.ui.player.get_objects_through_point(x, y).then(objects => {
			this.content_div.removeChild(this.load_spinner.element);
			let fragment = new DocumentFragment();
			for(let obj of objects) {
				let button = document.createElement("button");
				let canvas = document.createElement("canvas");
				let text = document.createElement("span");
				let br = document.createElement("br");
				let subtext = document.createElement("span");

				this.ui.object_canvases.set(canvas, {
					ref: obj.ref,
					remove_when_done: true
				});
				
				button.append(canvas, text, br, subtext);
				text.textContent = obj.name;
				subtext.classList.add(classes.subtext);
				subtext.textContent = `[0x${obj.ref.toString(16)}]`;
				fragment.appendChild(button);
				button.addEventListener("click", () => {
					let submenu = new ContextActionMenu(ui, this, obj.ref, obj.clients);
					submenu.put_to_right(button);
					submenu.open(true);
				});
			}
			this.content_div.appendChild(fragment);
		});
	}
}

class ContextActionMenu extends Menu {
	constructor(public ui : DemoPlayerUi, public parent : Menu, ref : number, clients : string[], include_open_chat = false, extra_close? : ()=>void) {
		super();
		let inspect_button = document.createElement("button");
		inspect_button.textContent = "Inspect";
		inspect_button.addEventListener("click", () => {
			this.close();
			this.parent.close();
			extra_close?.();
			ui.open_inspector(ref);
		})
		this.content_div.appendChild(inspect_button);

		if((ref >> 24) != 1) {
			let follow_button = document.createElement("button");
			follow_button.textContent = "Follow Object";
			follow_button.addEventListener("click", () => {
				this.close();
				this.parent.close();
				extra_close?.();
				ui.viewport.follow(ref);
			})
			this.content_div.appendChild(follow_button);
		}
		for(let client of clients) {
			let client_follow_button = document.createElement("button");
			client_follow_button.addEventListener("click", () => {
				this.close();
				this.parent.close();
				extra_close?.();
				ui.viewport.follow(client);
			})
			let button_label = document.createElement("span");
			button_label.textContent = "Follow Client";
			let br = document.createElement("br");
			let ckey_label = document.createElement("span");
			ckey_label.textContent = client;
			ckey_label.classList.add(classes.subtext);
			client_follow_button.append(button_label, br, ckey_label);
			this.content_div.appendChild(client_follow_button);
			if(include_open_chat) {
				let chat_button = document.createElement("button");
				chat_button.textContent = "Open Chat";
				chat_button.addEventListener("click", () => {
					this.close();
					this.parent.close();
					let chat = new ChatPanel(this.ui, false);
					chat.set_chat_target(client);
					chat.open(true);
				});
				this.content_div.appendChild(chat_button);
			}
		}
		this.addEventListener("close", () => {
			this.parent.panel_div.focus();
		});
	}
}

class ClientsMenu extends Menu {
	load_spinner : ProgressSpinner;
	constructor(public ui : DemoPlayerUi, public parent : Menu) {
		super();
		this.load_spinner = new ProgressSpinner();
		this.content_div.appendChild(this.load_spinner.element);
		this.ui.player.get_clients_mobs().then(clients => {
			this.content_div.removeChild(this.load_spinner.element);
			let fragment = new DocumentFragment();
			for(let obj of clients) {
				let button = document.createElement("button");
				let canvas = document.createElement("canvas");
				let text = document.createElement("span");
				let br = document.createElement("br");
				let subtext = document.createElement("span");

				this.ui.object_canvases.set(canvas, {
					ref: obj.ref,
					remove_when_done: true
				});
				
				button.append(canvas, text, br, subtext);
				text.textContent = obj.name;
				subtext.classList.add(classes.subtext);
				subtext.textContent = obj.ckey;
				fragment.appendChild(button);
				button.addEventListener("click", () => {
					let submenu = new ContextActionMenu(ui, this, obj.ref, [obj.ckey], true, ()=>{this.parent.close();});
					submenu.put_to_right(button);
					submenu.open(true);
				});
			}
			this.content_div.appendChild(fragment);
		});
		this.addEventListener("close", () => {
			this.parent.panel_div.focus();
		});
	}
}


export class ChatOptionsMenu extends Menu {
	constructor(public parent : ChatPanel) {
		super();
		this.add_basic_button(parent.follow_follower ? "Lock Target" : "Unlock Target", null, () => {
			parent.follow_follower = !parent.follow_follower;
			if(parent.follow_follower) {
				let follow_ref = parent.ui.viewport.current_follow?.ref;
				parent.set_chat_target(typeof follow_ref == "string" ? follow_ref : undefined);
			}
			this.close();
		});
		this.add_basic_button("Increase Font Size", null, () => {
			parent.adjust_font_size(1);
		});
		this.add_basic_button("Decrease Font Size", null, () => {
			parent.adjust_font_size(-1);
		});
	}
}

///For setting the see_invisibility value of the demo player
export class SeeInvisibilityMenu extends Menu {
	constructor(public ui : DemoPlayerUi) {
		super();
		this.add_basic_button("Minimum Possible Vision", null, () => {
			ui.player.set_see_invisible(SeeInvisibility.SEE_INVISIBLE_MINIMUM);
		});
		this.add_basic_button("Regular Vision", null, () => {
			ui.player.set_see_invisible(SeeInvisibility.SEE_INVISIBLE_LIVING);
		});
		this.add_basic_button("Ghost vision", null, () => {
			ui.player.set_see_invisible(SeeInvisibility.SEE_INVISIBLE_OBSERVER);
		});
		this.add_basic_button("ALL vision", null, () => {
			ui.player.set_see_invisible(SeeInvisibility.INVISIBILITY_MAXIMUM);
		});
		this.add_basic_button("Debug vision", null, () => {
			ui.player.set_see_invisible(SeeInvisibility.INVISIBILITY_ABSTRACT);
		});
	}
}
