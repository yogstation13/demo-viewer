export interface BaseRenderingCmd {
	cmd: string;
	transferables? : Transferable[];
}

export interface CmdViewport extends BaseRenderingCmd {
	cmd: "viewport";
	x:number;
	y:number;
	width:number;
	height:number;
	world_location: {x: number, y: number, width: number, height: number};
}
export interface CmdCopyToViewport extends BaseRenderingCmd {
	cmd: "copytoviewport";
	follow_data?: FollowDesc;
	followview_window?: {x:number,y:number,width:number,height:number};
}
export interface CmdCopyToCanvas extends BaseRenderingCmd {
	cmd: "copytocanvas";
	canvas_index: number;
}
export interface CmdFlush extends BaseRenderingCmd {
	cmd: "flush";
}
export interface ResizeAtlas extends BaseRenderingCmd {
	cmd: "resizeatlas";
	index:number;
	width:number;
	height:number;
}
export interface AtlasTexData extends BaseRenderingCmd {
	cmd: "atlastexdata";
	index:number;
	parts: {
		x: number;
		y: number;
		width: number;
		height: number;
		data: Uint8Array;
	}[];
}
export interface AtlasTexMaptext extends BaseRenderingCmd {
	cmd: "atlastexmaptext";
	index:number;
	parts: {
		x:number;
		y: number;
		width: number;
		height: number;
		maptext: string;
	}[];
}
export interface AtlasTexCopyWithin extends BaseRenderingCmd {
	cmd: "atlastexcopywithin";
	index:number;
	parts: {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		width: number;
		height: number;
	}[];
}
export interface CmdBatchDraw extends BaseRenderingCmd {
	cmd: "batchdraw";
	atlas_index: number;
	blend_mode: number;
	plane: number;
	use_color_matrix : boolean;
	data: Float32Array;
	num_elements: number;
}

export interface FollowDesc {
	ref: number|string;
	x: number|undefined;
	y: number|undefined;
}

export type RenderingCmd = CmdViewport|ResizeAtlas|AtlasTexData|AtlasTexMaptext|AtlasTexCopyWithin|CmdBatchDraw|CmdCopyToViewport|CmdCopyToCanvas|CmdFlush;