'use strict';
const load_demo = require('./lib/loader.js');
const read_icon = require('./lib/icon_reader.js');
const DemoPlayer = require('./lib/player.js');
document.addEventListener("DOMContentLoaded", async function() {
	let url = null;
	let querystring = new URLSearchParams(window.location.search);
	let status_holder = document.createElement("h1");
	if(querystring.has("demo_url")) {
		url = querystring.get("demo_url");
	} else if(querystring.has("roundid")) {
		url = window.demo_url_template.replace(/\{roundid}/g, querystring.get("roundid"));
	}
	if(url) {
		document.body.appendChild(status_holder);
		status_holder.textContent = "Fetching demo file...";
		try {
			let response = await fetch(url, {credentials: +querystring.get('send_credentials') ? 'include' : 'same-origin'});
			let data = await response.arrayBuffer();
			run_demo(data, status_holder);
		} catch(e) {
			status_holder.textContent = `${e}`;
		}
	} else {
		let running = false;
		let fileselect = document.createElement("input");
		fileselect.type = "file";
		let button = document.createElement("input");
		button.type = "button";
		button.value = "Open demo from file";
		button.addEventListener("click", () => {
			if(!fileselect.files[0]) return;
			if(running) return;
			let reader = new FileReader();
			reader.onload = () => {
				if(running) return;
				let buf = reader.result;
				running = true;
				document.body.innerHTML = "";
				document.body.appendChild(status_holder);
				run_demo(buf, status_holder);
			};
			reader.readAsArrayBuffer(fileselect.files[0]);
		});
		document.body.appendChild(fileselect);
		document.body.appendChild(button);
	}
});

async function run_demo(buf, status_holder) {
	status_holder.textContent = "Parsing demo file...";
	let demo = await load_demo(buf);
	console.log(demo);

	status_holder.textContent = "Downloading icons...";
	let turfs = new Map();
	let icons = new Map();
	let icon_promises = [];
	let completed = 0;
	for(let icon of demo.icons_used) {
		icon_promises.push((async () => {
			let url = "https://cdn.jsdelivr.net/gh/" + window.repository + "@" + demo.commit + "/" + icon;
			console.log(url);
			try {
				let icon_obj = await read_icon(url);
				icons.set(icon, icon_obj);
			} catch(e) {
				console.error(e);
			} finally {
				completed++;
				status_holder.textContent = "Downloading icons..." + (completed * 100 / demo.icons_used.length).toFixed(1) + "%";
			}
		})());
	}
	await Promise.all(icon_promises);
	let chat_css = await (await fetch("https://cdn.jsdelivr.net/gh/" + window.repository + "@" + demo.commit + "/code/modules/goonchat/browserassets/css/browserOutput.css")).text();
	chat_css = chat_css.replace(/((?:^|[},])[^\@\{]*?)([a-zA-Z.#\[\]":=\-_][a-zA-Z0-9.# \[\]":=\-_]*)(?=.+\{)/g, "$1.chat_window $2");
	chat_css = chat_css.replace(/height: [^;]+%;/g, "");
	chat_css = chat_css.replace(/ ?html| ?body/g, "");
	let style = document.createElement("style");
	style.innerHTML = chat_css;
	document.head.appendChild(style);
	console.log(icons);
	window.demo_player = new DemoPlayer(demo, icons);
}
