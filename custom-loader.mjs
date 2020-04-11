import url from 'url';
import path from 'path';
import process from 'process';
import Module from 'module';

const builtins = Module.builtinModules;
const JS_EXTENSIONS = new Set(['.js', '.mjs']);

const historyMap = {};

export function resolve(specifier, parentModuleURL, defaultResolve) {
//	console.log("----------------------------------------------------------------");
///	console.log("__dirname:", __dirname);
///	console.log("__filename:", __filename);
	let ret;

	if (builtins.includes(specifier)) {
//		console.log(`try builtin to ${parentModuleURL} : ${specifier}...`);
		ret = {url: specifier, format: 'builtin'};
	} else if (/^\.{0,2}[/]/.test(specifier) !== true && !specifier.startsWith('file:')) {
//		console.log(`try default to ${parentModuleURL} : ${specifier}...`);
		try {
			ret = defaultResolve(specifier, parentModuleURL);

			if (historyMap[specifier] == undefined) {
				historyMap[specifier] = ret;
			}
		} catch (err) {
			if (historyMap[specifier] != undefined) {
				ret = historyMap[specifier];
			} else {
				throw err;
			}
		}
	} else {
//		console.log(`try esm to ${parentModuleURL} : ${specifier}...`);

		if (parentModuleURL == undefined) {
		  parentModuleURL = "file://";  
		}

		const resolved = new url.URL(specifier, parentModuleURL);
		const ext = path.extname(resolved.pathname);

		if (!JS_EXTENSIONS.has(ext)) {
			throw new Error(`Cannot load file with non-JavaScript file extension ${ext}.`);
		}

		ret = {url: resolved.href, format: 'esm'};
	}

//	console.log(`${parentModuleURL} : ${specifier} :`, JSON.stringify(ret));
	return ret;
}
