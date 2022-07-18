export function normalize_ref(ref : [number,number,number]|number|null, maxx:number, maxy:number) : number {
	if(typeof ref == "number") {
		if((ref & 0xFFFFFF) == 0xFFFF) return 0;
		return ref;
	}
	if(ref == null) return 0;
	return 0x01000000 | ((ref[0]-1) + maxx*((ref[1]-1) + maxy*(ref[2]-1)))
}
export function denormalize_ref(ref : number, maxx:number, maxy:number) : [number,number,number]|number|null {
	if(ref == 0) return null;
	if((ref & 0xFFFFFF) == 0xFFFF) return null;
	if((ref >>> 24) == 1) {
		ref = ref & 0xFFFFFF;
		let x = (ref % maxx) + 1;
		ref = Math.floor(ref / maxx);
		let y = (ref % maxy) + 1;
		ref = Math.floor(ref / maxy);
		let z = ref + 1;
		return [x,y,z];
	}
	return ref;
}