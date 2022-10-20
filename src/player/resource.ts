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
			for(let item of this.icon_load_callbacks) item();
		}
	}

	async blob_promise() : Promise<Blob> {
		if(this.data) return Promise.resolve(this.data);
		if(this.is_loading) {
			return await new Promise((resolve, reject) => {
				let cb = () => {
					let index = this.icon_load_callbacks.indexOf(cb);
					if(index >= 0) this.icon_load_callbacks.splice(index, 1);
					if(this.data) resolve(this.data);
					else reject();
				};
				this.icon_load_callbacks.push(cb);
			})
		} else {
			await this.load();
			if (this.data) {
				return this.data;
			} else {
				return Promise.reject();
			}
		}
	}

	is_loading = false;
	async load() {
		if(this.is_loading) return;
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