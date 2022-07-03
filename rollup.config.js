import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import nodePolyfills from 'rollup-plugin-polyfill-node';
import rimraf from "rimraf";
import scss from 'rollup-plugin-scss';
import {readFileSync} from 'fs';

rimraf.sync("dist");

function find_chunk(bundle, name) {
	for(let item of Object.values(bundle)) {
		if(item.name.endsWith(name)) return item;
	}
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: {
		main: "index.js"
	},
	output: {
		dir: "dist",
		chunkFileNames: "[name]-[hash].mjs",
		entryFileNames: "[name]-[hash].mjs"
	},
	plugins: [
		nodePolyfills(),
		commonjs(),
		nodeResolve({browser: true}),
		scss({output: 'dist/main.css'}),
		{
			name: 'html-plugin',
			buildStart() {
				this.addWatchFile('index.html');
			},
			async generateBundle(options, bundle) {
				this.emitFile({
					fileName: 'index.html',
					type: 'asset',
					source: readFileSync('index.html', 'utf8').replace('{main.js}', find_chunk(bundle, "main").fileName)
				})
			}
		},
		{
			name: 'CNAME-plugin',
			buildStart() {
				this.addWatchFile('CNAME');
			},
			async generateBundle(options, bundle) {
				this.emitFile({
					fileName: 'CNAME',
					type: 'asset',
					source: readFileSync('CNAME', 'utf8')
				})
			}
		}
	],
};
export default config;

