'use strict';
const {inflate} = require('zlib');
//const StreamPng = require('streampng');
const {Buffer} = require('buffer')

const dirOrder = [2, 1, 4, 8, 6, 10, 5, 9];

module.exports = async function read_icon(url) {
	let response = await fetch(url);
	let data = await response.arrayBuffer();
	let dv = new DataView(data);
	let blob = new Blob([data], {type:'image/png'});
	let image = document.createElement("img");
	image.src = URL.createObjectURL(blob);

	const obj = {image, icon_states: new Map(), icon_states_movement: new Map()};

	let IHDR, zTXt;
	if(!(
		dv.getUint8(0) == 137 && 
		dv.getUint8(1) == 80 && 
		dv.getUint8(2) == 78 && 
		dv.getUint8(3) == 71 && 
		dv.getUint8(4) == 13 && 
		dv.getUint8(5) == 10 && 
		dv.getUint8(6) == 26 && 
		dv.getUint8(7) == 10
	)) throw new Error("Not a PNG file!");
	let png_ptr = 8;
	while(png_ptr < data.byteLength) {
		let length = dv.getUint32(png_ptr, false);
		let chunk_type = '';
		png_ptr += 4;
		for(let i = 0; i < 4; i++) chunk_type += String.fromCharCode(dv.getUint8(png_ptr++));
		let data_ptr = png_ptr;
		png_ptr += length;
		if(chunk_type == 'IEND') break;
		if(chunk_type == 'IHDR') {
			IHDR = {
				width: dv.getUint32(data_ptr+0, false),
				height: dv.getUint32(data_ptr+4, false)
			};
		} else if(chunk_type == 'zTXt') {
			let z_ptr = data_ptr;
			while(dv.getUint8(z_ptr) != 0) z_ptr++;
			z_ptr += 2;
			zTXt = {
				compressedText: Buffer.from(new Uint8Array(data, z_ptr, length - (z_ptr - data_ptr)))
			};
		}
		png_ptr += 4;
		if(zTXt && IHDR) break;
	}
	let inflated = await new Promise((resolve, reject) => {
		inflate(zTXt.compressedText, (err, data) => {
			if(err) reject(err);
			resolve(data);
		});
	});
	let desc = inflated.toString('ascii');
	let split = desc.split('\n');
	let iconWidth = 0;
	let iconHeight = 0;
	let parsedItems = [];
	let parsing = null;
	let totalFrames = 0;
	for(let i = 0; i < split.length; i++) {
		let regexResult = /\t?([a-zA-Z0-9]+) ?= ?"?([^\r\n"]+)/.exec(split[i]);
		if(!regexResult)
			continue;
		let key = regexResult[1];
		let val = regexResult[2];
		if(key == 'width') {
			iconWidth = +val;
		} else if(key == 'height') {
			iconHeight = +val;
		} else if(key == 'state') {
			if(parsing) {
				parsedItems.push(parsing);
			}
			parsing = {'state':val};
		} else if(key == 'dirs' || key == 'frames' || key == 'movement') {
			parsing[key] = +val;
		} else if(key == 'delay') {
			parsing.delay = JSON.parse('[' + val + ']');
		}
	}
	if(parsing) {
		parsedItems.push(parsing);
	}
	for(let i = 0; i < parsedItems.length; i++) {
		let item = parsedItems[i];
		totalFrames += item.frames * item.dirs;
		if(!item.delay) {
			item.delay = [1];
		}
		if(!item.frames) {
			item.frames = 1;
		}
		if(!item.dirs) {
			item.dirs = 1;
		}
	}
	if(!iconWidth && !iconHeight && totalFrames) {
		iconHeight = IHDR.height;
		iconWidth = IHDR.width / totalFrames;
	}
	let cols = IHDR.width / iconWidth;
	let iconIndex = 0;
	for(let i = 0; i < parsedItems.length; i++) {
		let item = parsedItems[i];
		let outItem = {};
		let name = item.state;
		outItem.dir_count = item.dirs;
		outItem.width = iconWidth;
		outItem.height = iconHeight;
		let dirs = new Map();
		for(let j = 0; j < item.dirs; j++) {
			let dir = {};
			let frames = [];
			dir.frames = frames;
			let total_delay = 0;
			for(let k = 0; k < item.frames; k++) {
				let thisIconIndex = iconIndex + (k * item.dirs) + j;
				frames.push({x:(thisIconIndex%cols)*iconWidth, y:Math.floor(thisIconIndex/cols)*iconHeight, delay: item.delay[k]});
				total_delay += item.delay[k];
			}
			dir.total_delay = total_delay;
			dirs.set(dirOrder[j], dir);
		}
		outItem.dirs = dirs;
		outItem.tile_size = 32;
		if(item.movement) {
			obj.icon_states_movement.set(name, outItem);
		} else {
			obj.icon_states.set(name, outItem);
		}
		iconIndex += item.dirs * item.frames;
	}
	return obj;
}
