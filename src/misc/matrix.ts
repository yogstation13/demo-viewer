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