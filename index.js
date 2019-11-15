'use strict';
const load_demo = require('./lib/loader.js');
const read_icon = require('./lib/icon_reader.js');
const DemoPlayer = require('./lib/player.js');
document.addEventListener("DOMContentLoaded", async function() {
	let url = null;
	let querystring = new URLSearchParams(window.location.search);
	if(querystring.has("demo_url")) {
		url = querystring.get("demo_url");
	} else if(querystring.has("roundid")) {
		url = window.demo_url_template.replace(/\{roundid}/g, querystring.get("roundid"));
	}
	if(url) {
		let response = await fetch(url, {credentials: +querystring.get('send_credentials') ? 'include' : 'same-origin'});
		let data = await response.arrayBuffer();
		run_demo(data);
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
				run_demo(buf);
			};
			reader.readAsArrayBuffer(fileselect.files[0]);
		});
		document.body.appendChild(fileselect);
		document.body.appendChild(button);
	}
});

async function run_demo(buf) {
	let demo = await load_demo(buf);
	console.log(demo);

	let turfs = new Map();
	let icons = new Map();
	let icon_promises = [];
	for(let icon of demo.icons_used) {
		icon_promises.push((async () => {
			let url = "https://cdn.jsdelivr.net/gh/" + window.repository + "@" + demo.commit + "/" + icon;
			console.log(url);
			try {
				let icon_obj = await read_icon(url);
				icons.set(icon, icon_obj);
			} catch(e) {
				console.error(e);
			}
		})());
	}
	await Promise.all(icon_promises);
	console.log(icons);
	window.demo_player = new DemoPlayer(demo, icons);
}
