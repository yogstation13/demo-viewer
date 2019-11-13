'use strict';
const load_demo = require('./lib/loader.js');
const read_icon = require('./lib/icon_reader.js');
const DemoPlayer = require('./lib/player.js');
document.addEventListener("DOMContentLoaded", async function() {
	let url = null;
	let querystring = new URLSearchParams(window.location.search);
	if(querystring.has("demo_url")) {
		url = querystring.get("demo_url");
	} else {
		url = window.demo_url_template.replace(/\{roundid}/g, querystring.get("roundid"));
	}
	if(!url) return;
	let demo = await load_demo(url);
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
});
