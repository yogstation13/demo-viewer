import { Icon } from "./rendering/icon";
import { IconLoader } from "./rendering/icon_loader";

export class Resource {
	constructor(public id : number) {

	}

	path : string|undefined;
	data : Blob|undefined;
	load_url : string|undefined;

	_load_abort : AbortController|undefined;
	update() {
		if(this.data && this._load_abort) {
			this._load_abort.abort("Data found elsewhere");
		}
	}

	is_loading = false;
	load() {
		if(this.is_loading) return;
		(async () => {
			if(this.data || !this.load_url) {
				return;
			}
			let url = this.load_url;
			this.load_url = undefined;
			let abort = this._load_abort = new AbortController();
			try {
				this.is_loading = true;
				let res = await fetch(url, {signal: abort.signal});
				if(!res.ok) throw new Error("Fetch returned (" + res.status + ") " + res.statusText);
				let blob = await res.blob();
				if(abort == this._load_abort) this._load_abort = undefined;
				if(!this.data) {
					this.data = blob;
					for(let cb of this.icon_load_callbacks) cb();
				}
			} finally {
				if(abort) {
					abort.abort("An error occured");
					if(abort == this._load_abort) this._load_abort = undefined;
				}
				this.is_loading = false;
			}
		})();
	}

	icon_load_callbacks : (()=>void)[] = [];
	icon : Icon|null|undefined;
	loading_icon : Blob|undefined;
	load_icon(loader : IconLoader) {
		if(this.loading_icon || this.icon !== undefined || !this.data) return;
		let blob = this.data;
		this.loading_icon = blob;
		(async () => {
			try {
				let icon = await loader.load_icon(blob);
				if(blob == this.data) {
					this.icon = icon;
					for(let cb of this.icon_load_callbacks) cb();
				}
			} finally {
				if(this.loading_icon == blob) this.loading_icon = undefined;
				if(!this.icon) this.icon = null;
			}
		})();
	}
}