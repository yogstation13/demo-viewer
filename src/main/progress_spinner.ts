// @ts-ignore
import classes from "./progress_spinner.scss";

export class ProgressSpinner {
	element = document.createElement("div");
	private segments = [document.createElement("div"), document.createElement("div"), document.createElement("div"), document.createElement("div")];
	private _progress : number|undefined;
	private label = document.createElement("span");
	constructor() {
		this.element.classList.add(classes.spinner);
		for(let i = 0; i < 4; i++) {
			this.segments[i].classList.add(classes.segment);
			this.element.appendChild(this.segments[i]);
		}
		this.element.appendChild(this.label);
	}

	get progress() {
		return this._progress;
	}
	set progress(val : number|undefined) {
		if(val !== undefined) {
			val = Math.min(Math.max(val, 0), 1);
			this.label.textContent = Math.round(val * 100) + "%";
			this.element.classList.add(classes.definite);
			for(let i = 0; i < 4; i++) {
				let rot = -90 + (i*90);
				let skew = Math.PI/2 * (1 - Math.min(Math.max(val*4-i, 0), 1));
				let skew_c = Math.cos(skew);
				let skew_s = Math.sin(skew);
				this.segments[i].style.transform = `rotate(${rot}deg) matrix(1, 0, ${skew_s}, ${skew_c}, 0, 0)`;
			}
		} else {
			this.element.classList.remove(classes.definite);
		}
		this._progress = val;
	}

	get full_page() {
		return this.element.classList.contains(classes.full_page);
	}
	set full_page(val : boolean) {
		if(val) this.element.classList.add(classes.full_page);
		else this.element.classList.remove(classes.full_page);
	}

	fade_out() {
		this.element.classList.add(classes.fading_out);
		setTimeout(() => {
			this.element.parentElement?.removeChild(this.element);
		}, 1000);
	}
}
