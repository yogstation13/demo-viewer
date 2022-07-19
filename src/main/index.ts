import parser_url from "omt:../parser/parser_worker";
import player_url from "omt:../player/player_worker";
import icon_loader_url from "omt:../player/rendering/icon_loader";
import * as Comlink from "comlink";
import { DemoParserInterface } from "../parser/interface";
import { DemoPlayer } from "../player/player";
import { XzReadableStream } from "../streams/xzwasm";
import { DemoPlayerUi } from "./ui";
import { ProgressSpinner } from "./progress_spinner";
import { load_image } from "./rendering/image_loader";
import { IconLoader } from "../player/rendering/icon_loader";
import { OptionalXzReadableStream } from "../streams/optional_xz_stream";
import { StreamQueue } from "../streams/multi_stream";

let parser = Comlink.wrap<DemoParserInterface>(new Worker(parser_url));

function start_demo_player() {
	return parser[Comlink.createEndpoint]().then(async parser_for_player => {
		let image_loader = new MessageChannel();
		Comlink.expose(load_image, image_loader.port1);
		
		let icon_loader = Comlink.wrap<IconLoader>(new Worker(icon_loader_url));
		await icon_loader.set_png_loader(Comlink.transfer(image_loader.port2, [image_loader.port2]));
		let loader_endpoint = await icon_loader[Comlink.createEndpoint]();
		icon_loader[Comlink.releaseProxy]();
		
		let player = await new (Comlink.wrap<typeof DemoPlayer>(new Worker(player_url)))(Comlink.transfer(parser_for_player, [parser_for_player]), Comlink.transfer(loader_endpoint, [loader_endpoint]));
		let ui = new DemoPlayerUi(player);
	})
}

let spinner : ProgressSpinner = new ProgressSpinner();
spinner.full_page = true;

async function stream_to_interface(parser_interface : Comlink.Remote<DemoParserInterface>, stream : ReadableStream<Uint8Array>) {
	await parser_interface.set_progress_callback(Comlink.proxy(async (progress, done) => {
		spinner.progress = progress;
		if(done) {
			spinner.fade_out();
		}
	}));
	let reader = stream.getReader();
	let chunk;
	let bytes = 0;
	while((chunk = await reader.read()), !chunk.done) {
		bytes += chunk.value.length;
		await parser_interface.handle_data(Comlink.transfer(chunk.value, [chunk.value.buffer]));
	}
}

let _url : string|null = null;
let querystring = new URLSearchParams(window.location.search);
if(querystring.has("demo_url")) {
	_url = querystring.get("demo_url");
} else if(querystring.has("roundid")) {
	_url = `https://yogstation.net/rounds/${querystring.get("roundid")}/replay`;
}
const url = _url;

function is_streamable_replay(response : Response) {
	return response.headers.get("accept-ranges") == "bytes" ||
		response.headers.get("x-allow-ss13-replay-streaming") == "true" // Why the snowflakey HTTP header? because the FUCKING CLOUDFLARE BLOCKS THE ACCEPT-RANGES HEADER. FUCK YOU FOR THAT CLOUD FLARE BY THE WAY.
}

function stream_replay(response : Response, url:string) {
	let stream_queue = new StreamQueue<Uint8Array>();
	if(!response.body) {
		throw new Error("No stream!");
	}
	stream_queue.add(response.body);
	console.log(response);
	stream_queue.wait_empty().then(async () => {
		let last_succeeded = false;
		while(is_streamable_replay(response)) {
			await new Promise(resolve => setTimeout(resolve, last_succeeded ? 1000 : 10000));
			response = await fetch(url, {
				credentials: +(querystring.get('send_credentials') ?? 0) ? 'include' : 'same-origin',
				headers: {'Range': 'bytes=' + stream_queue.bytes_read + '-'}
			});
			if(!response.body) {
				throw new Error("No stream!");
			}
			if(response.status == 206) {
				let prev_size = stream_queue.bytes_read;
				stream_queue.add(response.body);
				await stream_queue.wait_empty();
				if(stream_queue.bytes_read > prev_size) {
					last_succeeded = true;
				}
			} else if(response.status == 416) {
				last_succeeded = false;
			} else {
				break;
			}
		}
		stream_queue.end();
	});
	return stream_queue.readable;
}

if(url) {
	document.body.appendChild(spinner.element);
	fetch(url, {credentials: +(querystring.get('send_credentials') ?? 0) ? 'include' : 'same-origin'}).then(async res => {
		if(!res.ok) {
			document.body.textContent = `Server responded with ${res.status} ${res.statusText}`;
			document.body.style.fontSize = "40px";
			return;
		}
		if(!res.body) {
			throw new Error("No stream!");
			return;
		}
		let stream = res.body;
		
		if(is_streamable_replay(res)) {
			stream = stream_replay(res, url);
		}
		
		let start = start_demo_player();
		stream_to_interface(parser, new OptionalXzReadableStream(stream));
		return start;
	}).catch(e => {
		document.body.textContent = `${("stack" in e) ? (e+", " + e.stack) : e}`;
		document.body.style.fontSize = "40px";
	});
} else {
	let fileselect = document.createElement("input");
	fileselect.type = "file";
	let button = document.createElement("input");
	button.type = "button";
	button.value = "Open demo from file";
	button.addEventListener("click", () => {
		if(!fileselect.files?.[0]) return;
		document.body.appendChild(spinner.element);
		start_demo_player().catch(e => {
			document.body.textContent = `${("stack" in e) ? (e+", " + e.stack) : e}`;
			document.body.style.fontSize = "40px";
		});;
		stream_to_interface(parser, new OptionalXzReadableStream(fileselect.files[0].stream() as unknown as ReadableStream));
	});
	document.body.appendChild(fileselect);
	document.body.appendChild(button);
}
