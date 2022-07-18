import rimraf from "rimraf";
import typescript from '@rollup/plugin-typescript';
import htmlPlugin from "./lib/html";
import moduleUrlPlugin from "./lib/moduleurl";
import nodeResolve from "rollup-plugin-node-resolve";
import postcss from 'rollup-plugin-postcss';
import { terser } from "rollup-plugin-terser";
import OMT from "@surma/rollup-plugin-off-main-thread";

rimraf.sync("dist");

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input:
	{
		main: "src/main/index.ts"
	},
	output: {
		dir: "dist",
		chunkFileNames: "[name]-[hash].js",
		entryFileNames: "[name]-[hash].js",
		format: "amd"
	},
	plugins: [
		typescript(),
		nodeResolve(),
		moduleUrlPlugin(),
		postcss({
			modules: true,
			use: ['sass'],
			extensions: ['.scss']
		}),
		OMT(),
		htmlPlugin(),
		//terser()
	]
};
export default config;

