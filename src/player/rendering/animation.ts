import { Appearance } from "../../misc/appearance";
import { Matrix, matrix_equals, matrix_interpolate, matrix_invert, matrix_is_identity, matrix_multiply, matrix_premultiply } from "../../misc/matrix";
import { DemoAnimation } from "../../parser/base_parser";

export function animate_appearance(animation : DemoAnimation, orig : Appearance, time : number) {
	let out : Appearance&{animate_time: number} = {
		...orig,
		derived_from: orig,
		animate_time: time
	};
	if(out.sorted_appearances) out.sorted_appearances = undefined;
	if(out.floating_appearances) out.floating_appearances = undefined;
	apply_animation(animation, out, time);
	if(out.icon_state_dir && (orig.dir !== out.dir || orig.icon != out.icon || orig.icon_state != orig.icon_state)) out.icon_state_dir = undefined;
	return out;
}

function apply_animation(animation : DemoAnimation, target : Appearance, time : number) {
	if(animation.chain_parent && animation.parallel) apply_animation(animation.chain_parent, target, time);
	else if(animation.chain_parent && !animation.end_now) {
		animation.base_appearance = animate_appearance(animation.chain_parent, animation.base_appearance, animation.start_time);
		animation.end_now = true;
	}
	let anim_time = time - animation.start_time;
	if(anim_time < 0 || anim_time > animation.end_time) return;
	let loops_done = Math.floor(anim_time / animation.duration);
	if(animation.loop > 0 && loops_done >= animation.loop) return;
	anim_time -= loops_done * animation.duration;
	let prev = loops_done >= 1 ? animation.end_appearance : animation.base_appearance;
	let final = animation.end_appearance;
	for(let frame of animation.frames) {
		if(anim_time < frame.time) {
			let next = frame.appearance
			let fac = anim_time / frame.time;

			if(final.dir != next.dir) target.dir = next.dir;
			if(final.icon != next.icon) target.icon = next.icon;
			if(final.icon_state != next.icon_state) target.icon_state = next.icon_state;
			if(final.invisibility != next.invisibility) target.invisibility = next.invisibility;
			if(final.maptext && !next.maptext) target.maptext = null;
			else if(!final.maptext && next.maptext) target.maptext = next.maptext;
			if(next.maptext && prev.maptext && final.maptext && target.maptext && JSON.stringify(next.maptext) != JSON.stringify(prev.maptext)) {
				target.maptext = {
					maptext: next.maptext.maptext,
					x: lerp_apply(prev.maptext.x, next.maptext.x, final.maptext.x, target.maptext.x, fac),
					y: lerp_apply(prev.maptext.y, next.maptext.y, final.maptext.y, target.maptext.y, fac),
					width: lerp_apply(prev.maptext.width, next.maptext.width, final.maptext.width, target.maptext.width, fac),
					height: lerp_apply(prev.maptext.height, next.maptext.height, final.maptext.height, target.maptext.height, fac),
				}
			}
			target.pixel_x = lerp_apply(prev.pixel_x, next.pixel_x, final.pixel_x, target.pixel_x, fac);
			target.pixel_y = lerp_apply(prev.pixel_y, next.pixel_y, final.pixel_y, target.pixel_y, fac);
			target.pixel_z = lerp_apply(prev.pixel_z, next.pixel_z, final.pixel_z, target.pixel_z, fac);
			target.pixel_w = lerp_apply(prev.pixel_w, next.pixel_w, final.pixel_w, target.pixel_w, fac);
			target.layer = lerp_apply(prev.layer, next.layer, final.layer, target.layer, fac);
			if(final.color_alpha != next.color_alpha || final.color_alpha != prev.color_alpha) {
				let orig_color = target.color_alpha;
				target.color_alpha = 0;
				for(let i = 0; i < 32; i += 8) {
					let component = lerp_apply(
						prev.color_alpha >> i & 0xFF,
						next.color_alpha >> i & 0xFF,
						final.color_alpha >> i & 0xFF,
						orig_color >> i & 0xFF,
						fac
					);
					target.color_alpha |= (Math.round(Math.max(0, Math.min(255, component))) & 0xFF) << i;
				}
			}
			if(!matrix_equals(final.transform, next.transform) || !matrix_equals(final.transform, prev.transform)) {
				let final_invert = matrix_invert([...final.transform]);
				if(final_invert) {
					let orig_transform:Matrix = [...target.transform];
					matrix_premultiply(orig_transform, final_invert)
					target.transform = matrix_interpolate(prev.transform, next.transform, fac, frame.linear_transform);
					matrix_multiply(target.transform, orig_transform)
				} else {
					target.transform = matrix_interpolate(prev.transform, next.transform, fac, frame.linear_transform);
				}
			}

			break;
		}
		prev = frame.appearance;
		anim_time -= frame.time;
	}
}

function lerp_apply(a:number, b:number, final:number, target:number, fac:number) {
	return (a*(1-fac) + b*fac) + target-final;
}

export function appearance_interpolate(a1 : Appearance, a2 : Appearance, fac : number, linear = false) : Appearance {
	fac = Math.min(1, Math.max(0, fac));
	if(a1 == a2) return a1;
	if(fac == 0) return a1;
	if(fac == 1) return a2;
	let inv_fac = 1 - fac;

	let out : Appearance = {
		...a2,
		derived_from: a2
	};
	if(out.sorted_appearances) out.sorted_appearances = undefined;
	if(out.floating_appearances) out.floating_appearances = undefined;
	if(!matrix_is_identity(a1.transform) || !matrix_is_identity(a2.transform)) {
		out.transform = matrix_interpolate(a1.transform, a2.transform, fac, linear);
	}
	if(a1.color_alpha != a2.color_alpha) {
		out.color_alpha = 0;
		for(let i = 0; i < 32; i += 8) {
			out.color_alpha |= (Math.round((a1.color_alpha >> i & 0xFF) * inv_fac + (a2.color_alpha >> i & 0xFF) * fac)&0xFF) << i;
		}
	}
	out.pixel_x = Math.round(a1.pixel_x * inv_fac + a2.pixel_x * fac);
	out.pixel_y = Math.round(a1.pixel_y * inv_fac + a2.pixel_y * fac);
	out.pixel_z = Math.round(a1.pixel_z * inv_fac + a2.pixel_z * fac);
	out.pixel_w = Math.round(a1.pixel_w * inv_fac + a2.pixel_w * fac);
	out.layer = Math.round(a1.layer * inv_fac + a2.layer * fac);
	if(a1.maptext && a2.maptext) {
		out.maptext = {...a2.maptext};
		out.maptext.x = Math.round(a1.maptext.x * inv_fac + a2.maptext.x * fac);
		out.maptext.y = Math.round(a1.maptext.y * inv_fac + a2.maptext.y * fac);
		out.maptext.width = Math.round(a1.maptext.width * inv_fac + a2.maptext.width * fac);
		out.maptext.height = Math.round(a1.maptext.height * inv_fac + a2.maptext.height * fac);
	}
	return out;
}