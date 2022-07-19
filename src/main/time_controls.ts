import { DemoPlayerUi } from "./ui";
// @ts-ignore
import classes from "./time_controls.scss";
import { despam_promise } from "../misc/promise_despammer";

export class DemoPlayerTimeControls {
	container = document.createElement("div");
	scrubber = document.createElement("input");
	time_span = document.createElement("span");
	duration_span = document.createElement("span");

	play_button = document.createElement("button");

	constructor(public ui : DemoPlayerUi) {
		this.set_time = despam_promise(this.ui.player.advance_time);

		this.container.classList.add(classes.container);
		document.body.appendChild(this.container);

		this.play_button.classList.add(classes.play_button);
		this.play_button.addEventListener("click", this.play_clicked);
		this.container.appendChild(this.play_button);
		this.update_play_button();

		this.scrubber.type = "range"
		this.scrubber.step = "0";
		this.scrubber.addEventListener("input", this.handle_input);
		this.scrubber.addEventListener("change", this.handle_change);
		this.scrubber.classList.add(classes.scrubber);
		this.container.appendChild(this.time_span);
		this.container.appendChild(document.createTextNode(" / "));
		this.container.appendChild(this.duration_span);
		this.container.appendChild(this.scrubber);

		document.addEventListener("keydown", this.handle_keydown);
		document.addEventListener("keyup", this.handle_keyup);
	}

	private set_time;

	playback_speed = 0;
	playback_speed_override = 0;
	dragging = false;
	private handle_input = (e : Event) => {
		this.dragging = true;
		this.set_time(+this.scrubber.value);
		this.time_span.textContent = format_duration(+this.scrubber.value/10);
		this.update_play_button();
	}
	private handle_change = (e : Event) => {
		this.dragging = false;
		this.set_time(+this.scrubber.value);
		this.update_play_button();
		this.current_time = +this.scrubber.value;
		this.ui.update_hash();
	}

	update_play_button() {
		if(this.playback_speed && !this.dragging) {
			this.play_button.classList.add(classes.playing);
		} else {
			this.play_button.classList.remove(classes.playing)
		}
	}

	play_clicked = () => {
		this.playback_speed = this.playback_speed ? 0 : 1;
		this.ui.update_hash();
		this.update_play_button();
	}

	current_time : number = 0;
	update_time(time : number) {
		if(this.dragging) return;
		this.scrubber.value = ""+time;
		this.time_span.textContent = format_duration(time/10);
		this.current_time = time;
	}
	update_duration(duration : number) {
		this.scrubber.max = ""+duration;
		this.duration_span.textContent = format_duration(duration/10);
	}

	holding_left = false;
	holding_right = false;
	holding_shift = false;
	holding_ctrl = false;

	handle_keydown = (e : KeyboardEvent) => {
		this.holding_shift = e.shiftKey;
		this.holding_ctrl = e.ctrlKey;
		this.update_keyboard_scrubbing();
		if(e.defaultPrevented || !(e.target instanceof Element)) return;
		if(!(e.target == document.body || this.container.contains(e.target) || this.ui.viewport.viewport_div.contains(e.target))) return;
		if(e.code == "Space") {
			if(e.shiftKey) {
				this.playback_speed = (this.playback_speed != 5) ? 5 : 1;
			} else if(e.ctrlKey) {
				this.playback_speed = (this.playback_speed != -3) ? -3 : 1;
			} else {
				this.playback_speed = (this.playback_speed == 0) ? 1 : 0;
			}
			this.update_play_button();
			e.preventDefault();
			this.ui.update_hash();
		} else if(e.code == "ArrowLeft") {
			this.holding_left = true;
			this.update_keyboard_scrubbing();
			e.preventDefault();
		} else if(e.code == "ArrowRight") {
			this.holding_right = true;
			this.update_keyboard_scrubbing();
			e.preventDefault();
		}
	}
	handle_keyup = (e : KeyboardEvent) => {
		this.holding_shift = e.shiftKey;
		this.holding_ctrl = e.ctrlKey;
		this.update_keyboard_scrubbing();
		if(e.code == "ArrowLeft" && this.holding_left) {
			this.holding_left = false;
			this.update_keyboard_scrubbing();
			this.ui.update_hash();
		} else if(e.code == "ArrowRight" && this.holding_right) {
			this.holding_right = false;
			this.update_keyboard_scrubbing();
			this.ui.update_hash();
		}
	}

	update_keyboard_scrubbing() {
		let dir = 0;
		if(this.holding_left) dir--;
		if(this.holding_right) dir++;
		if(this.holding_ctrl && this.holding_shift) this.playback_speed_override = dir * 25;
		else if(this.holding_shift) this.playback_speed_override = dir * 5;
		else if(this.holding_ctrl) this.playback_speed_override = dir * 0.5;
		else this.playback_speed_override = dir;
	}
}

function format_duration(total_seconds : number) {
	let hours = Math.floor(total_seconds / 3600);
	let minutes = Math.floor((total_seconds - (hours * 3600)) / 60);
	let seconds = total_seconds - (hours * 3600) - (minutes * 60);

	return `${hours}`.padStart(2, '0') + ":" + `${minutes}`.padStart(2, '0') + ":" + `${seconds.toFixed(1)}`.padStart(4, '0')
}