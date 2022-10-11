import { ChatOptionsMenu } from "./menu";
import { Panel } from "./panel";
import { DemoPlayerUi } from "./ui";
import * as Comlink from "comlink";
import { PlayerOptions } from "./options";
import { despam_promise } from "../misc/promise_despammer";

export class ChatPanel extends Panel {
	private remove_frame_callback : undefined|Promise<()=>void>;

	public follow_follower = true;
	chat_target : string|undefined = undefined;

	constructor(public ui : DemoPlayerUi, in_corner = true) {
		super("Chat");
		let follow_ref = this.ui.viewport.current_follow?.ref
		if(typeof follow_ref == "string") this.chat_target = follow_ref;
		this.add_transparent_toggle();
		this.add_menu_button(b => {
			new ChatOptionsMenu(this).put_below(b).open();
		});
		this.set_fixed_size("min(800px, 80vw)", "min(600px, 45vh)");
		if(in_corner) {
			if(PlayerOptions.get("startup_chat_transparent") != "false") this.toggle_transparent();
			this.enable_absolute_position();
			this.panel_div.style.left = "100vw";
			this.panel_div.style.top = "0px";
		}
		this.content_div.classList.add("chat_window");

		this.frame_callback = despam_promise(this.frame_callback);

		this.addEventListener("close", () => {
			this.detach_hooks();
			let index = this.ui.chat_windows.indexOf(this);
			if(index >= 0) this.ui.chat_windows.splice(index, 1);
		});
		this.addEventListener("open", () => {
			this.attach_hooks();
			this.ui.chat_windows.push(this);
		});
		let observer = new ResizeObserver(() => this.update_content_scroll());
		observer.observe(this.content_div);
		observer.observe(this.container_div);
		this.transparent_button?.addEventListener("click", () => this.update_content_scroll());

		this.content_div.addEventListener("scroll", () => {
			this.scrolled_to_bottom = Math.ceil(this.content_div.clientHeight + this.content_div.scrollTop) >= Math.floor(this.content_div.scrollHeight);
		});
	}

	attach_hooks() {
		if(!this.remove_frame_callback) {
			this.remove_frame_callback = (async () => {
				if(!document.getElementById("chat_css")) {
					let chat_css = await this.ui.player.chat_css;
					if(!document.getElementById("chat_css")) {
						chat_css = chat_css.replace(/((?:^|[},])[^\@\{]*?)([a-zA-Z.#\[\]":=\-_][a-zA-Z0-9.# \[\]":=\-_]*)(?=.+\{)/g, "$1.chat_window $2");
						chat_css = chat_css.replace(/height: [^;]+%;/g, "");
						chat_css = chat_css.replace(/ ?html| ?body/g, "");
						let style = document.createElement("style");
						style.textContent = chat_css;
						style.id = "chat_css";
						document.head.appendChild(style);
					}
				}
				return this.ui.player.add_frame_listener(Comlink.proxy(this.frame_callback) as unknown as Comlink.Remote<typeof this.frame_callback>);
			})();
		}
	}

	detach_hooks() {
		if(this.remove_frame_callback) {
			this.remove_frame_callback.then(cb => {
				cb();
				(cb as Comlink.Remote<typeof cb>)[Comlink.releaseProxy]();
			});
			this.remove_frame_callback = undefined;
		}
	}

	set_chat_target(ckey : string|undefined) {
		if(ckey == this.chat_target) {
			return;
		}
		this.title_span.textContent = ckey ? `Chat (${ckey})` : "Chat";
		this.detach_hooks();
		this.last_frame_index = -1;
		this.content_div.innerHTML = "";
		this.chat_target = ckey;
		if(this.is_open) this.attach_hooks();
	}

	scrolled_to_bottom = true;

	last_frame_index = -1;
	frame_callback = async (new_frame_index : number = this.last_frame_index) => {
		let curr_lfi = this.last_frame_index;
		if(new_frame_index > this.last_frame_index) {
			let messages = await this.ui.player.get_chat_messages(this.chat_target, this.last_frame_index+1, new_frame_index+1);
			if(curr_lfi != this.last_frame_index) return;
			if(messages.length) {
				let fragment = new DocumentFragment();
				for(let msg of messages) {
					let div = document.createElement("div");
					div.style.wordBreak = "break-word";
					div.style.whiteSpace = "pre-wrap";
					div.dataset.msgTime = ""+msg.time;
					div.dataset.msgFrame = ""+msg.frame_index;
					let prop : "innerHTML"|"textContent" = "innerHTML";
					let text = "";
					if(typeof msg.message == "string") {
						text = msg.message;
					} else if(msg.message.html) {
						text = msg.message.html;
					} else if(msg.message.text) {
						text = msg.message.text;
					}
					div[prop] = text;

					for(let a of div.querySelectorAll("a")) {
						a.target = "_blank";
					}
					
					fragment.appendChild(div);
				}
				this.content_div.appendChild(fragment);
				this.update_content_scroll();
			}
		} else if(new_frame_index < this.last_frame_index) {
			for(let i = this.content_div.children.length-1; i >= 0; i--) {
				let div = this.content_div.children[i];
				if(!(div instanceof HTMLElement)) continue;
				let div_frame = div.dataset.msgFrame;
				if(div_frame != null && +div_frame >= new_frame_index) {
					this.content_div.removeChild(div);
				}
			}
		}
		this.last_frame_index = new_frame_index;
	}

	update_content_scroll() {
		if(!this.scrolled_to_bottom) return;
		this.content_div.scrollTop = Math.ceil(this.content_div.scrollHeight);
		this.scrolled_to_bottom = true;
	}

	adjust_font_size(adj : number) {
		let font_size = 17;
		let comp = window.getComputedStyle(this.content_div).fontSize;
		if(comp.endsWith("px")) font_size = +(comp.substring(0, comp.length-2)) || font_size;
		font_size += adj;
		font_size = Math.max(Math.min(font_size, 30), 1);
		this.content_div.style.fontSize = font_size + "px";
		this.update_content_scroll();
	}
}
