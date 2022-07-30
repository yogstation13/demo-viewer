import { create_exposed_promise } from "../misc/exposed_promise";
import { DemoParser, ReaderDemoBatchData } from "./base_parser";
import { DemoParserBinary } from "./binary_parser";
import { DemoParserText } from "./text_parser";

export class DemoParserInterface {
	private _parser : DemoParser|undefined;
	private _frame_callbacks : Array<() => void> = [];
	public async handle_data(data : Uint8Array) {
		if(!this._parser) {
			if(data[0] == 0xCB) {
				this._parser = new DemoParserBinary(this._frame_callbacks, this.rev_data.resolve);
			} else {
				this._parser = new DemoParserText(this._frame_callbacks, this.rev_data.resolve);
			}
			if(this._progress_callback) this._parser.progress_callback = this._progress_callback;
		}
		await this._parser.handle_data(data);
	}

	private async wait_for_frames(frames_known : number) {
		while(!(this._parser && this._parser.frames.length > frames_known)) {
			await new Promise<void>(resolve => this._frame_callbacks.push(resolve));
		}
		return this._parser.frames.length;
	}

	public rev_data = create_exposed_promise<string>();
	public chat_css = this.rev_data.then(async commit => {
		let css_paths : (string|string[])[] = [
			"tgui/packages/tgui-panel/styles/goon/chat-dark.scss",
			"code/modules/goonchat/browserassets/css/browserOutput.css",
		];
		let chat_css = "";
		outer_loop: for(let path_list of css_paths) {
			try {
				chat_css = "";
				if(!(path_list instanceof Array)) path_list = [path_list];
				for(let path of path_list) {
					let res = await fetch("https://cdn.jsdelivr.net/gh/Yogstation13/yogstation@" + commit + "/" + path);
					if(res.ok) {
						chat_css += await res.text();
					} else {
						continue outer_loop;
					}
				}
				break;
			} catch(e) {
				console.error(e);
			}
		}
		
		return chat_css;
	});

	private _consuming_data = false;
	public async consume_data(cb : (data : ReaderDemoBatchData) => Promise<void>) {
		if(this._consuming_data) throw new Error("Data already being consumed");

		let appearances_known = 0;
		while(true) {
			await this.wait_for_frames(0);
			if(!this._parser) continue;
			let data : ReaderDemoBatchData = {
				frames: this._parser.frames.slice(0),
				appearances: this._parser.appearance_cache.slice(appearances_known),
				resource_loads: this._parser.resource_loads.slice(0)
			};
			this._parser.frames.length = 0;
			this._parser.resource_loads.length = 0;
			appearances_known = this._parser.appearance_cache.length;

			await cb(data);
		}
	}

	private _progress_callback : ((progress:number, done:boolean) => Promise<void>)|undefined;
	public async set_progress_callback(cb : ((progress:number, done:boolean) => Promise<void>)) {
		if(this._parser)
			this._parser.progress_callback = cb;
		this._progress_callback = cb;
	}
}


