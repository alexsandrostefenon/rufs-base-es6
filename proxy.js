import fs from "fs";
import Proxy from "redbird";
import {exec} from "child_process";
import {MicroServiceServer} from "./MicroServiceServer.js";

const fsPromises = fs.promises;
// TODO : only until nodejs needs custom-loader.mjs to resolve import(module)
import pg from "pg";
import { runInNewContext } from "vm";

class RufsProxy {

	constructor(config) {
		this.config = config;
		this.proxy = new Proxy({port: config.port, ssl: config.ssl});

		if (config.host == "0.0.0.0") {
			this.proxy.addResolver((host, url, req) => {
//				console.log("host:", host);
//				console.log("url:", url);
				let ret = {};
				
				if (url.length > 0) {
					const sourcePath = url.substring(1);
					const route = config.routes.find(item => sourcePath.startsWith(item.sourcePath+"/"));

					if (route != undefined) {
						ret.url = route.target;
						req.url = req.url.substring(route.sourcePath.length + 1);
					}
				}

				return ret;
			});
		}
	}

	async start(config) {
        console.log(`starting RufsProxy...`);
        
        {
        	const arg = MicroServiceServer.getArg("add-modules", []);
            const list = Array.isArray(arg) ? arg : arg.split(",");

            for (const item of list) {
            	if (typeof item == "string") {
	                config.modules.push({"path": item});
            	} else {
	                config.modules.push(item);
            	}
            }
		}

		let port = config.port;

		for (const entry of config.modules) {
			console.log(`loading module ${entry.path}...`);
			const module = await import(entry.path);
			console.log(`...loaded module ${entry.path}.`);

			for (const name in module) {
				if (name.indexOf("MicroService") >= 0) {
					const microServiceClass = module[name];
					const params = MicroServiceServer.getArgs({port: ++port, webapp: entry.webapp});
					console.log(`loading instance of ${name}...`);
					const instance = new microServiceClass(params);
					await instance.listen();
					console.log(`...loaded instance of ${name}.`);
					config.routes.push({sourcePath: instance.config.appName, target: `http://localhost:${instance.config.port}`});
				}
			}
		}

		for (let cmd of config.cmds) {
			let childProcess = exec(cmd);
			console.log(`executed ${cmd}, PID : ${childProcess.pid}`);
		}

		for (let route of config.routes) {
			this.proxy.register(config.host + "/" + route.sourcePath, route.target+"/");
		}
	}

}

fsPromises.readFile("proxy-conf.json").
then(data => JSON.parse(data)).
catch(err => {
	console.log(err);
	
	const defaultConfig = {
		"host": "0.0.0.0",
		"port": 8080,
		"modules": [
//*
//			{"path": "./AuthenticationMicroService.js"},//, "port": 8081
//			{"path": "./RufsServiceMicroService.js", "webapp": "./rufs-base-es6/webapp"},//, "port": 8082
//*/
		],
		"cmds": [
/*
			"nodejs --experimental-modules --loader ./rufs-base-es6/custom-loader.mjs ./rufs-base-es6/AuthenticationMicroService.js --port=8081",
			"nodejs --experimental-modules --loader ./rufs-base-es6/custom-loader.mjs ./rufs-base-es6/RufsServiceMicroService.js --port=8082 --webapp=./rufs-base-es6/webapp",
//*/
		],
		"routes": [
//			{"sourcePath": "es6", "target": "http://localhost:8081/es6"},
//			{"sourcePath": "css", "target": "http://localhost:8081/css"},
//			{"sourcePath": "lib", "target": "http://localhost:8081/lib"},
//			{"sourcePath": "fonts", "target": "http://localhost:8081/fonts"},
			{"sourcePath": "base", "target": "http://localhost:8081"},
//			{"sourcePath": "rufs_service", "target": "http://localhost:8082"},
		]
	};

	fsPromises.writeFile("proxy-conf.json", JSON.stringify(defaultConfig, null, "\t"));
	return defaultConfig;
}).
then(config => {
	let instance = new RufsProxy(config);
	instance.start(config);
});
