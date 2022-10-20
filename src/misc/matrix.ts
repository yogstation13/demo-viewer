export type Matrix = [number,number,number,number,number,number];
type MatrixLike = Matrix|Float32Array;

export function matrix_multiply<T extends MatrixLike>(m1 : T, m2 : MatrixLike) : T {
	let a1 = m1[0], b1 = m1[3], c1 = m1[1], d1 = m1[4], e1 = m1[2], f1 = m1[5];
	let a2 = m2[0], b2 = m2[3], c2 = m2[1], d2 = m2[4], e2 = m2[2], f2 = m2[5];
	m1[0] = (a1*a2) + (b2*c1);
	m1[3] = (a2*b1) + (b2*d1);
	m1[1] = (a1*c2) + (c1*d2);
	m1[4] = (b1*c2) + (d1*d2);
	m1[2] = e1 + (a1*e2) + (c1*f2);
	m1[5] = (b1*e2) + f1 + (d1*f2);
	return m1;
}

export function matrix_premultiply<T extends MatrixLike>(m1 : T, m2 : MatrixLike) : T {
	let a1 = m2[0], b1 = m2[3], c1 = m2[1], d1 = m2[4], e1 = m2[2], f1 = m2[5];
	let a2 = m1[0], b2 = m1[3], c2 = m1[1], d2 = m1[4], e2 = m1[2], f2 = m1[5];
	m1[0] = (a1*a2) + (b2*c1);
	m1[3] = (a2*b1) + (b2*d1);
	m1[1] = (a1*c2) + (c1*d2);
	m1[4] = (b1*c2) + (d1*d2);
	m1[2] = e1 + (a1*e2) + (c1*f2);
	m1[5] = (b1*e2) + f1 + (d1*f2);
	return m1;
}

export function matrix_translate<T extends MatrixLike>(m : T, dx=0, dy=0) : T {
	m[2] += dx;
	m[5] += dy;
	return m;
}

export function matrix_invert<T extends MatrixLike>(m : T) : T|undefined {
	let a = m[0], b = m[3], c = m[1], d = m[4], e = m[2], f = m[5];
	let det = a*d - b*c;
	if(det == 0) return;
	m[0] = d / det;
	m[3] = b / -det;
	m[1] = c / -det;
	m[4] = a / det;
	m[2] = (d*e - c*f) / -det;
	m[5] = (b*e - a*f) / det;
	return m;
}

export function matrix_is_identity(m : MatrixLike) {
	return m[0] == 1 && m[1] == 0 && m[2] == 0 && m[3] == 0 && m[4] == 1 && m[5] == 0;
}
export function matrix_equals(m1 : MatrixLike, m2 : MatrixLike) {
	return m1[0] == m2[0] && m1[1] == m2[1] && m1[2] == m2[2] && m1[3] == m2[3] && m1[4] == m2[4] && m1[5] == m2[5]
}

function lerp(a=0, b=1, fac=0) {
	return b * fac + a * (1 - fac);
}
function matrix_deconstruct(m : Matrix, out : Matrix) : number|undefined {
	let x_scale_squared = m[0]*m[0] + m[3]*m[3];
	let y_scale_squared = m[1]*m[1] + m[4]*m[4];
	if(y_scale_squared < 1e-6 || x_scale_squared < 1e-6) {
		return;
	}
	let x_scale = Math.sqrt(x_scale_squared);
	let y_scale = Math.sqrt(y_scale_squared);

	let angle_cos = -1; let angle_sin_sign = 0;
	if(m[0] / x_scale > angle_cos) {
		angle_sin_sign = -m[3];
		angle_cos = m[0] / x_scale;
	}
	if(m[4] / y_scale > angle_cos) {
		angle_sin_sign = m[1];
		angle_cos = m[4] / y_scale;
	}

	if(angle_cos >= 0.9999) {
		out[0] = m[0]; out[1] = m[1];
		out[2] = m[2]; out[3] = m[3];
		out[4] = m[4]; out[5] = m[5];
		return 0;
	} else if(angle_cos <= -0.9999) {
		out[0] = -m[0]; out[1] = -m[1];
		out[2] = -m[2]; out[3] = -m[3];
		out[4] = m[4]; out[5] = m[5];
		return Math.PI;
	}
	if(Math.abs(angle_cos) < 0.0001) {
		angle_cos = 0;
	}
	let angle = Math.acos(angle_cos);
	let angle_sin = Math.sqrt(1 - (angle_cos*angle_cos));
	if(angle_sin_sign < 0) {
		angle = -angle;
		angle_sin = -angle_sin;
	}
	out[0] = m[0]; out[1] = m[1];
	out[3] = m[3]; out[4] = m[4];
	matrix_premultiply(out, [angle_cos, -angle_sin, 0, angle_sin, angle_cos, 0]);
	out[2] = m[2]; out[5] = m[5];
	return angle;
}
export function matrix_interpolate(a : Matrix, b : Matrix, fac : number, linear = false) : Matrix {
	if(linear) {
		return [
			lerp(a[0], b[0], fac),
			lerp(a[1], b[1], fac),
			lerp(a[2], b[2], fac),
			lerp(a[3], b[3], fac),
			lerp(a[4], b[4], fac),
			lerp(a[5], b[5], fac)
		];
	}
	let sst1:Matrix = [0,0,0,0,0,0];
	let sst2:Matrix = [0,0,0,0,0,0];
	let angle1 = matrix_deconstruct(a, sst1);
	let angle2 = matrix_deconstruct(b, sst2);
	if(angle1 == undefined || angle2 == undefined) {
		return matrix_interpolate(a, b, fac, true);
	}

	let ang_diff = angle2-angle1;
	ang_diff = (((ang_diff + Math.PI) % (Math.PI*2)) + (Math.PI*2)) % (Math.PI*2) - Math.PI;
	if(Math.abs(ang_diff) >= 0.0001 && Math.abs(ang_diff) < Math.PI-0.0001) {
		let angle = angle1 + fac*ang_diff;
		let out:Matrix = [
			lerp(sst1[0], sst2[0], fac),
			lerp(sst1[1], sst2[1], fac),
			0,
			lerp(sst1[3], sst2[3], fac),
			lerp(sst1[4], sst2[4], fac),
			0
		];
		let angle_cos = Math.cos(angle);
		let angle_sin = Math.sin(angle);
		matrix_premultiply(out, [angle_cos, angle_sin, 0, -angle_sin, angle_cos, 0]);
		out[2] = lerp(sst1[2], sst2[2], fac);
		out[5] = lerp(sst1[5], sst2[5], fac);
		return out;
	} else {
		return matrix_interpolate(a, b, fac, true);
	}
}
