const svgns = "http://www.w3.org/2000/svg";
function maptext_to_svg(maptext:string, width:number, height:number) {
	maptext = `<style>.center { text-align: center; } .maptext { font-family: 'Small Fonts'; font-size: 7px; -dm-text-outline: 1px black; color: white; line-height: 1.1; } .command_headset { font-weight: bold;\tfont-size: 8px; } .small { font-size: 6px; } .big { font-size: 8px; } .reallybig { font-size: 8px; } .extremelybig { font-size: 8px; } .greentext { color: #00FF00; font-size: 7px; } .redtext { color: #FF0000; font-size: 7px; } .clown { color: #FF69Bf; font-size: 7px;  font-weight: bold; } .his_grace { color: #15D512; } .hypnophrase { color: #0d0d0d; font-weight: bold; } .yell { font-weight: bold; } .italics { font-size: 6px; }</style>` + maptext;

	let parsed = new DOMParser().parseFromString(maptext, "text/html");

	// Do some fixup
	function css_fixup(css : string) : string {
		css = css.replace(/-dm-text-outline: ([0-9\.]+)([a-z%]+) ([^ ;]+)*(?: (sharp|square))?;/g, (_, size_num, size_unit, color, style) => {
			let size = +size_num;
			let shadows : string[] = [];
			for(let i = 0; i < 8; i++) {
				let angle = (i/8)*Math.PI*2;
				let c = +Math.cos(angle).toFixed(2);
				let s = +Math.sin(angle).toFixed(2);
				if(style == "square") {
					c = Math.sign(c);
					s = Math.sign(s);
				}
				shadows.push(`${size*c}${size_unit} ${size*s}${size_unit} 0px ${color}`)
			}
			return `text-shadow: ${shadows.join(",")};`
		});
		css = css.replace(/font-size: *([0-9]+)px;/g, (_, size) => {
			return `font-size: ${size}pt;`;
		});
		css = css.replace(/font-size: *([0-9]+)pt;/g, (_, size) => {
			return `font-size: ${Math.ceil(size*4/3)}px;`;
		});
		css = css.replace(/font(?:-family)?: *['"]Small Fonts['"];/g, `font-family:"Small Fonts", "ＭＳ Ｐゴシック", "MS Sans Serif", sans-serif;`);
		css = css.replace(/(text-align: [^;]+);/g, "$1; display: block;")
		return css;
	}
	for(let style of parsed.querySelectorAll("style")) {
		if(style.textContent) style.textContent = css_fixup(style.textContent);
	}
	for(let elem of parsed.querySelectorAll("[style]")) {
		let style = elem.getAttribute("style");
		if(style) {
			elem.setAttribute("style", css_fixup(style));
		}
	}
	let style = parsed.createElement("style")
	let bottomer = `position:absolute;left:0px;bottom:0px;width:100%;overflow:hidden;vertical-align:baseline;`;
	if(parsed.querySelector("[valign=top]")) bottomer = '';
	style.textContent = `body{margin:0px;}html{color:white;font-family:"MS Sans Serif", sans-serif;font-size:9px;${bottomer}}`
	parsed.head.insertBefore(style, parsed.head.firstChild);

	let svg_root = parsed.createElementNS(svgns, "svg");
	svg_root.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
	svg_root.setAttributeNS(null, "width", `${width}`);
	svg_root.setAttributeNS(null, "height", `${height}`);
	let foreignObject = parsed.createElementNS(svgns, "foreignObject");
	foreignObject.setAttributeNS(null, "x", "0");
	foreignObject.setAttributeNS(null, "y", "0");
	foreignObject.setAttributeNS(null, "width", `${width}`);
	foreignObject.setAttributeNS(null, "height", `${height}`);

	svg_root.appendChild(foreignObject);
	foreignObject.appendChild(parsed.documentElement);
	
	return new XMLSerializer().serializeToString(svg_root);
}

export async function render_maptext(maptext:string, width:number, height:number) {
	let svg_source = maptext_to_svg(maptext, width, height);
	//let svg_blob = new Blob([svg_source], {type: "image/svg+xml"});
	let image = new Image();
	let url = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg_source)))}`;
	//console.log(svg_source);
	//console.log(url);
	await new Promise(async (resolve, reject) => {
		image.onload = resolve;
		image.onerror = reject;
		image.src = url;
	});
	return image;
	//return await createImageBitmap(svg_blob);
}