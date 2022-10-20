import { DemoPlayer, Turf } from "./player";

const VIEW_OPACITY = 1;
const VIEW_LUMINOSITY = 2;

// Algorithm is based off of this forum post:
// http://www.byond.com/forum/post/2130277
// But with my own improvements I guess

const adj_dx_arr = [-1, 0, 1, -1, 1, -1, 0, 1];
const adj_dy_arr = [-1, -1, -1, 0, 0, 1, 1, 1];
const cadj_dx_arr = [0, -1, 1, 0];
const cadj_dy_arr = [-1, 0, 0, 1];

export function view_turfs(player : DemoPlayer, origin : Turf, minx : number, miny : number, maxx : number, maxy : number, include_origin = true, see_in_dark = 1e30) : Turf[] & {obscured: Turf[]} {
	let z = origin.z;
	let ox = origin.x;
	let oy = origin.y;
	minx = Math.floor(minx); miny = Math.floor(miny);
	maxx = Math.ceil(maxx); maxy = Math.ceil(maxy);

	let pminx = Math.min(minx, origin.x);
	let pminy = Math.min(miny, origin.y);
	let pmaxx = Math.max(maxx, origin.x);
	let pmaxy = Math.max(maxy, origin.y);
	let pdx = pmaxx - pminx + 1;
	let pdy = pmaxy - pminy + 1;

	function xy_i(x:number, y:number) : number {
		if(x < pminx || x > pmaxx || y < pminy || y > pmaxy) return -1;
		return (y - pminy) * pdx + (x - pminx);
	}
	
	let square_rings : Array<Turf[]|undefined> = [];
	let diamond_rings : Array<Turf[]|undefined> = [];
	let diagonal_vis_arr = new Uint16Array(pdx * pdy);
	let cardinal_vis_arr = new Uint16Array(pdx * pdy);
	let flags_arr = new Uint8Array(pdx*pdy);
	
	for(let x = pminx; x <= pmaxx; x++) {
		for(let y = pminy; y <= pmaxy; y++) {
			let abs_dx = Math.abs(x - ox);
			let abs_dy = Math.abs(y - oy);
			let turf = player.get_turf(x, y, z);
			let turf_i = xy_i(x, y);
			if(!turf) {
				flags_arr[turf_i] = VIEW_OPACITY;
				continue;
			}
			if(turf.appearance?.opacity) flags_arr[turf_i] |= VIEW_OPACITY;
			//if(turf.appearance?.luminosity) flags_arr[turf_i] |= VIEW_LUMINOSITY;
			flags_arr[turf_i] |= VIEW_LUMINOSITY;
			for(let item of turf.contents) {
				if(item.appearance?.opacity) {
					flags_arr[turf_i] |= VIEW_OPACITY;
				}
				/*if(item.luminosity) {
					flags_arr[turf_i] |= VIEW_LUMINOSITY;
				}*/
			}
			
			let square_dist = Math.max(abs_dx, abs_dy);
			let diamond_dist = abs_dx + abs_dy;
			let square_ring = square_rings[square_dist];
			if(square_ring == null) square_rings[square_dist] = [turf];
			else square_ring.push(turf);

			let diamond_ring = diamond_rings[diamond_dist];
			if(diamond_ring == null) diamond_rings[diamond_dist] = [turf];
			else diamond_ring.push(turf);
		}
	}

	for(let i = 0; i < square_rings.length-1; i++) {
		let square_ring = square_rings[i+1];
		if(!square_ring) break; // Break instead of continue because tiles past this won't be visible anyways
		for(let turf of square_ring) {
			let turf_i = xy_i(turf.x, turf.y);
			let is_visible = false;
			for(let j = 0; j < 8; j++) {
				let adj_i = xy_i(adj_dx_arr[j]+turf.x, adj_dy_arr[j]+turf.y);
				if(adj_i >= 0 && diagonal_vis_arr[adj_i] == i) {
					is_visible = true;
					break;
				}
			}
			if(is_visible) {
				if((flags_arr[turf_i] & VIEW_OPACITY)) {
					diagonal_vis_arr[turf_i] = 65535;
				} else {
					diagonal_vis_arr[turf_i] = i+1;
				}
			}
		}
	}

	for(let i = 0; i < diamond_rings.length-1; i++) {
		let diamond_ring = diamond_rings[i+1];
		if(!diamond_ring) break;
		for(let turf of diamond_ring) {
			let turf_i = xy_i(turf.x, turf.y);
			let is_visible = false;
			for(let j = 0; j < 4; j++) {
				let adj_i = xy_i(cadj_dx_arr[j]+turf.x, cadj_dy_arr[j]+turf.y);
				if(adj_i >= 0 && cardinal_vis_arr[adj_i] == i) {
					is_visible = true;
					break;
				}
			}
			if(is_visible && diagonal_vis_arr[turf_i]) {
				if((flags_arr[turf_i] & VIEW_OPACITY)) {
					cardinal_vis_arr[turf_i] = 65535;
				} else {
					cardinal_vis_arr[turf_i] = i+1;
				}
			}
		}
	}
	let center_ring = diamond_rings[0];
	if(include_origin && center_ring) for(let turf of center_ring) {
		let turf_i = xy_i(turf.x, turf.y);
		if(turf_i >= 0) {
			cardinal_vis_arr[turf_i] = 65535;
		}
	}

	let output : Turf[] & {obscured : Turf[]} = Object.assign([], {obscured: []});
	for(let i = 0; i < square_rings.length; i++) {
		let ring = square_rings[i];
		if(ring == null) continue;
		for(let turf of ring) {
			let x = turf.x, y = turf.y;
			let turf_i = xy_i(x, y);
			if(x < minx || y < miny || x > maxx || y > maxy) continue;
			if(i <= see_in_dark || (flags_arr[turf_i] & VIEW_LUMINOSITY)) {
				if(cardinal_vis_arr[turf_i]) {
					output.push(turf);
				} else if(flags_arr[turf_i] & VIEW_OPACITY) {
					let to_dx = Math.sign(origin.x - x);
					let to_dy = Math.sign(origin.y - y);
					if(to_dx && to_dy) {
						let dadj_i = xy_i(turf.x + to_dx, turf.y + to_dy);
						let dxadj_i = xy_i(turf.x + to_dx, turf.y);
						let dyadj_i = xy_i(turf.x, turf.y + to_dy);
						if(!(flags_arr[dadj_i] & VIEW_OPACITY) && (flags_arr[dxadj_i] & VIEW_OPACITY) && (flags_arr[dyadj_i] & VIEW_OPACITY)
							&& cardinal_vis_arr[dadj_i] && cardinal_vis_arr[dxadj_i] && cardinal_vis_arr[dyadj_i])
						{
							output.push(turf);
							continue;
						}
					}
					let n_i = xy_i(turf.x, turf.y + 1);
					let s_i = xy_i(turf.x, turf.y - 1);
					let e_i = xy_i(turf.x + 1, turf.y);
					let w_i = xy_i(turf.x - 1, turf.y);
					if(cardinal_vis_arr[n_i] && cardinal_vis_arr[s_i]) output.push(turf);
					else if(cardinal_vis_arr[w_i] && cardinal_vis_arr[e_i]) output.push(turf);
					else output.obscured.push(turf);
				} else output.obscured.push(turf);
			} else output.obscured.push(turf);
		}
	}
	return output;
}