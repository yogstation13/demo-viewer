const PREFIX = 'module-url:';

export default function moduleUrlPlugin() {
	return {
		name: 'module-url-plugin',
		load(id) {
			console.log(id);
			if(id.startsWith(PREFIX)) {
				return `export default import.meta.ROLLUP_FILE_URL_${this.emitFile({
					type: 'chunk',
					id: id.slice(PREFIX.length)
				})}`;
			}
		},
		resolveId(source, importer) {
			console.log(source + ", " + importer);
			if(source.startsWith(PREFIX)) {
				return this.resolve(source.slice(PREFIX.length), importer).then(
					resolvedId => PREFIX + resolvedId.id
				);
			}
			return null;
		}
	}
}