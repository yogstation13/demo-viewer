declare module "omt:*" {
	const url : string;
	export default url;
};

declare module "**/*.scss" {
	const map : {[key : string]: string};
	export default map;
}

