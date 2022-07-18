import { not_null } from "../../misc/gl_util";

function build_texture_switch(s:number, l:number) : string { // fancy ass recursive binary tree thingy for SANIC SPEED... I hope
	if(l == 0)
		return "";
	else if(l == 1)
		return `color *= texture2D(u_texture[${s}], v_uv);`;
	else {
		let split_point = Math.ceil(l/2);
		return `if(v_tex_index < ${split_point+s}.0){${build_texture_switch(s, split_point)}}else{${build_texture_switch(s+split_point, l-split_point)}}`;
	}
}

function flag_check(expression : string, flag : number) {
	return `(mod(${expression}, ${flag*2}) > ${flag - 0.5})`;
}

export interface ShaderHolder {
	shader: WebGLProgram;
	all_attrib_arrays : GLint[];
	vao : WebGLVertexArrayObjectOES|WebGLVertexArrayObject|null;
}

export interface IconShader extends ShaderHolder {
	a_position : GLint;
	a_transform_x : GLint;
	a_transform_y : GLint;
	a_color : GLint[];
	a_uv : GLint;
	a_layer : GLint;
	u_texture : WebGLUniformLocation;
	u_texture_size : WebGLUniformLocation;
	u_viewport_size : WebGLUniformLocation;
	u_viewport_center : WebGLUniformLocation;
	u_zoom : WebGLUniformLocation;
}

export interface CopyShader extends ShaderHolder {
	a_position : GLint;
	a_size : GLint;
	a_from : GLint;
	a_to : GLint;
	u_texture : WebGLUniformLocation;
	u_texture_size : WebGLUniformLocation;
}

export function get_icon_shader(gl : WebGLRenderingContext, attribute_color_matrix : boolean) : IconShader {
	let program = compile_shader_program(gl, `
	#ifdef GL_FRAGMENT_PRECISION_HIGH
		precision highp float;
	#else
		precision mediump float;
	#endif
	attribute vec4 ${attribute_color_matrix ? "a_color_r, a_color_g, a_color_b, a_color_a, a_color_c" : "a_color"};
	attribute vec4 a_uv;
	attribute vec3 a_transform_x;
	attribute float a_layer;
	attribute vec3 a_transform_y;
	attribute vec2 a_position;
	varying vec4 ${attribute_color_matrix ? "v_color_r, v_color_g, v_color_b, v_color_a, v_color_c" : "v_color"};
	varying vec2 v_uv;
	uniform vec2 u_viewport_size;
	uniform vec2 u_texture_size;
	uniform vec2 u_viewport_center;
	uniform float u_zoom;
	void main() {
		${attribute_color_matrix ? `v_color_r = a_color_r;
		v_color_g = a_color_g;
		v_color_b = a_color_b;
		v_color_a = a_color_a;
		v_color_c = a_color_c;` : "v_color = a_color;"}
		vec2 sprite_size = a_uv.zw-a_uv.xy;
		v_uv = mix(a_uv.xy, a_uv.zw, a_position) / u_texture_size;
		vec3 scaled_position = vec3(sprite_size*(a_position-vec2(0.5,0.5)), 1);
		gl_Position = vec4((vec2(dot(a_transform_x, scaled_position)+sprite_size.x*0.5, dot(a_transform_y, scaled_position)+sprite_size.y*0.5) - u_viewport_center) * u_zoom / u_viewport_size * 2.0, a_layer, 1.0);
	}
	`,`
	#ifdef GL_FRAGMENT_PRECISION_HIGH
		precision highp float;
	#else
		precision mediump float;
	#endif
	uniform sampler2D u_texture;
	varying vec4 ${attribute_color_matrix ? "v_color_r, v_color_g, v_color_b, v_color_a, v_color_c" : "v_color"};
	varying vec2 v_uv;
	void main() {
		vec4 out_color = texture2D(u_texture, v_uv)${attribute_color_matrix ? "" : " * v_color"};
		${attribute_color_matrix ? `out_color = v_color_c
		+ v_color_r * out_color.x
		+ v_color_g * out_color.y
		+ v_color_b * out_color.z
		+ v_color_a * out_color.w;` : ""}
		out_color.xyz *= out_color.w;
		float z = gl_FragCoord.z;
		gl_FragColor = out_color;
		if(gl_FragColor.a < 0.001961)
			discard;
	}`);
	let color_thingy : GLint[] = [];
	if(attribute_color_matrix) {
		color_thingy.push(gl.getAttribLocation(program, 'a_color_r'));
		color_thingy.push(gl.getAttribLocation(program, 'a_color_g'));
		color_thingy.push(gl.getAttribLocation(program, 'a_color_b'));
		color_thingy.push(gl.getAttribLocation(program, 'a_color_a'));
		color_thingy.push(gl.getAttribLocation(program, 'a_color_c'));
	} else {
		color_thingy.push(gl.getAttribLocation(program, 'a_color'));
	}
	let out:IconShader = {
		shader: program,
		a_position: gl.getAttribLocation(program, "a_position"),
		a_transform_x: gl.getAttribLocation(program, "a_transform_x"),
		a_transform_y: gl.getAttribLocation(program, "a_transform_y"),
		a_color: color_thingy,
		a_uv: gl.getAttribLocation(program, "a_uv"),
		a_layer: gl.getAttribLocation(program, "a_layer"),
		u_texture: not_null(gl.getUniformLocation(program, `u_texture`)),
		u_texture_size: not_null(gl.getUniformLocation(program, 'u_texture_size')),
		u_viewport_size: not_null(gl.getUniformLocation(program, "u_viewport_size")),
		u_viewport_center: not_null(gl.getUniformLocation(program, "u_viewport_center")),
		u_zoom: not_null(gl.getUniformLocation(program, "u_zoom")),
		vao: null,
		all_attrib_arrays: []
	};
	out.all_attrib_arrays.push(out.a_position, out.a_transform_x, out.a_transform_y, ...out.a_color, out.a_uv, out.a_layer);
	out.vao = create_vao(gl, out.all_attrib_arrays);
	return out;
}

function create_vao(gl : WebGLRenderingContext, attrib_arrays : number[]) {
	let vao_ext = gl.getExtension("OES_vertex_array_object");
	if(vao_ext) {
		let vao;
		vao = vao_ext.createVertexArrayOES();
		vao_ext.bindVertexArrayOES(vao);

		for(let arr of attrib_arrays) {
			gl.enableVertexAttribArray(arr);
		}

		vao_ext.bindVertexArrayOES(null);
		return vao;
	} else if(gl instanceof window.WebGL2RenderingContext) {
		let vao;
		vao = gl.createVertexArray();
		gl.bindVertexArray(vao);

		for(let arr of attrib_arrays) {
			gl.enableVertexAttribArray(arr);
		}

		gl.bindVertexArray(null);
		return vao;
	} else {
		return null;
	}
}

export function get_copy_shader(gl : WebGLRenderingContext) : CopyShader {
	let program = compile_shader_program(gl, `
	precision mediump float;
	attribute vec2 a_position;
	attribute vec2 a_size;
	attribute vec2 a_from;
	attribute vec2 a_to;
	uniform vec2 u_texture_size;
	varying vec2 v_uv;
	void main() {
		v_uv = (a_size * a_position + a_from) / u_texture_size;
		gl_Position = vec4((mix(vec2(0,0), a_size, a_position) + a_to) / u_texture_size * 2.0 - vec2(1,1), 0, 1.0);
	}
	`,`
	precision mediump float;
	uniform sampler2D u_texture;
	varying vec2 v_uv;
	uniform vec2 u_texture_size;
	void main() {
		gl_FragColor = texture2D(u_texture, v_uv);
	}`);
	let out:CopyShader = {
		shader: program,
		a_position: gl.getAttribLocation(program, "a_position"),
		a_from: gl.getAttribLocation(program, "a_from"),
		a_to: gl.getAttribLocation(program, "a_to"),
		a_size: gl.getAttribLocation(program, "a_size"),
		u_texture: not_null(gl.getUniformLocation(program, `u_texture`)),
		u_texture_size: not_null(gl.getUniformLocation(program, 'u_texture_size')),
		vao: null,
		all_attrib_arrays: []
	};
	out.all_attrib_arrays.push(out.a_position,out.a_from,out.a_to,out.a_size);
	out.vao = create_vao(gl, out.all_attrib_arrays);
	return out;
}


function compile_shader(gl : WebGLRenderingContext, code:string, type:number) : WebGLShader {
	let shader = not_null(gl.createShader(type));
	gl.shaderSource(shader, code);
	gl.compileShader(shader);
	if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error((type == gl.VERTEX_SHADER ? "VERTEX SHADER " : "FRAGMENT SHADER ") + gl.getShaderInfoLog(shader));
	}
	return shader;
}

function compile_shader_program(gl : WebGLRenderingContext, vertex_code:string, fragment_code:string) : WebGLProgram {
	let program = not_null(gl.createProgram());
	gl.attachShader(program, compile_shader(gl, vertex_code, gl.VERTEX_SHADER));
	gl.attachShader(program, compile_shader(gl, fragment_code, gl.FRAGMENT_SHADER));
	gl.linkProgram(program);
	if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(program) ?? "unknown shader error");
	}
	return program;
}