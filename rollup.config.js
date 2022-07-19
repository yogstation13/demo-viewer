import rimraf from "rimraf";
import typescript from '@rollup/plugin-typescript';
import htmlPlugin from "./lib/html";
import nodeResolve from "rollup-plugin-node-resolve";
import postcss from 'rollup-plugin-postcss';
import { terser } from "rollup-plugin-terser";
import OMT from "@surma/rollup-plugin-off-main-thread";
import {readFileSync} from "fs";

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
		postcss({
			modules: true,
			use: ['sass'],
			extensions: ['.scss']
		}),
		OMT(),
		htmlPlugin(),
		terser(),
		{
			name: 'files-plugin',
			buildStart() {
				this.addWatchFile('CNAME');
			},
			async generateBundle(options, bundle) {
				this.emitFile({
					fileName: 'CNAME',
					type: 'asset',
					source: readFileSync('CNAME', 'utf8')
				});
				this.emitFile({
					fileName: 'favicon.ico',
					type: 'asset',
					source: readFileSync('favicon.ico', 'utf8')
				});
			}
		}
	]
};
export default config;

