const svgns = "http://www.w3.org/2000/svg";
function maptext_to_svg(maptext:string, width:number, height:number) {
	let parsed = new DOMParser().parseFromString(maptext, "text/html");
	// Do some fixup

	let svg_root = document.createElementNS(svgns, "svg");
	svg_root.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
	let foreignObject = document.createElementNS(svgns, "foreignObject");
	foreignObject.setAttributeNS(null, "x", "0");
	foreignObject.setAttributeNS(null, "y", "0");
	foreignObject.setAttributeNS(null, "width", `${width}`);
	foreignObject.setAttributeNS(null, "height", `${height}`);

	svg_root.appendChild(foreignObject);
	foreignObject.appendChild(parsed.documentElement);
	
	return new XMLSerializer().serializeToString(svg_root);
}

export function render_maptext(maptext:string, width:number, height:number) {
	let svg_blob = new Blob([maptext_to_svg(maptext, width, height)], {type: "image/svg+xml"});
	return createImageBitmap(svg_blob);
}