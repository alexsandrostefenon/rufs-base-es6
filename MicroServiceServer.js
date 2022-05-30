import fs from "fs";
import https from "https";
import http from "http";
import bodyParser from "body-parser";
import express from "express";
import jwt from "jsonwebtoken";
import websocket from "websocket";
import url from "url";
import path from "path";
import Qs from "qs";

import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {HttpRestRequest} from "./webapp/es6/ServerConnection.js";
import {Response} from "./server-utils.js";

const fsPromises = fs.promises;
const WebSocketServer = websocket.server;

class MicroServiceServer {

	static getArg(name, defaultValue) {
		let value = defaultValue;
		let base = "--" + name;
		let baseAndValue = base + "=";

		for (let i = 0; i < process.argv.length; i++) {
			const arg = process.argv[i];

			if (arg == base) {
				value = [];
				for (let j = i+1; j < process.argv.length && process.argv[j].startsWith("-") == false; j++) value.push(process.argv[j]);

				if (value.length == 0) {
					if (Array.isArray(defaultValue) == true) {
						value = defaultValue;
					} else {
						value = true;
					}
				}

				break;
			}

			if (arg.startsWith(baseAndValue)) {
				value = arg.substring(baseAndValue.length);
				console.log(`[MicroServiceServer.getArg(name: ${name}, defaultValue: ${defaultValue})] : ${value}`);
				break;
			}
		}

		return value;
	}

	static getArgs(preferenceConfig) {
		let config = {};
		config.dbConfig = {};
		if (preferenceConfig == undefined) preferenceConfig = {};
		if (preferenceConfig.dbConfig == undefined) preferenceConfig.dbConfig = {};

		config.dbConfig.host = preferenceConfig.dbConfig.host || MicroServiceServer.getArg("db-host");//localhost// Server hosting the postgres database
		config.dbConfig.port = preferenceConfig.dbConfig.port || MicroServiceServer.getArg("db-port");//5432//env var: PGPORT
		config.dbConfig.database = preferenceConfig.dbConfig.database || MicroServiceServer.getArg("db-name");//env var: PGDATABASE
		config.dbConfig.user = preferenceConfig.dbConfig.user || MicroServiceServer.getArg("db-user");//"development", //env var: PGUSER
		config.dbConfig.password = preferenceConfig.dbConfig.password || MicroServiceServer.getArg("db-password");//"123456", //env var: PGPASSWORD
		config.dbConfig.limitQuery = preferenceConfig.dbConfig.limitQuery || MicroServiceServer.getArg("db-limit-query");
		config.dbConfig.limitQueryExceptions = preferenceConfig.dbConfig.limitQueryExceptions || MicroServiceServer.getArg("db-limit-query-exceptions");

		config.dbMissingPrimaryKeys = preferenceConfig.dbMissingPrimaryKeys;
		config.dbMissingForeignKeys = preferenceConfig.dbMissingForeignKeys;
		config.aliasMap = preferenceConfig.aliasMap;

		config.appName = preferenceConfig.appName || MicroServiceServer.getArg("name", "");
		config.port = preferenceConfig.port || MicroServiceServer.getArg("port", "9080");

		config.apiPath = preferenceConfig.apiPath || MicroServiceServer.getArg("api_path", "rest");
		config.requestBodyContentType = preferenceConfig.requestBodyContentType || MicroServiceServer.getArg("request_body_content_type", "application/json");
		config.responseContentType = preferenceConfig.responseContentType || MicroServiceServer.getArg("response_content_type", "application/json");
		config.security = preferenceConfig.security || MicroServiceServer.getArg("security", "jwt");
		config.useCamelCaseUpper = preferenceConfig.useCamelCaseUpper || MicroServiceServer.getArg("camel-case-upper", false);

		config.fileNamePrivateKey = preferenceConfig.fileNamePrivateKey || MicroServiceServer.getArg("private-key", "key.pem");
		config.fileNameCertificate = preferenceConfig.fileNameCertificate || MicroServiceServer.getArg("certificate", "cert.pem");
		config.webapp = preferenceConfig.webapp;

		if (config.appName && config.appName.length > 0) {
			config.webapp = config.webapp || MicroServiceServer.getArg("webapp", preferenceConfig.defaultStaticPaths);//`./rufs-${config.appName}-es6/webapp`
		}

		console.log(`[MicroServiceServer.getArgs] service ${config.appName}, port ${config.port} : serving static files of ${config.webapp}`);
		return config;
	}

	constructor(config) {
		const defaultStaticPaths = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "webapp");
		config.defaultStaticPaths = config.defaultStaticPaths != undefined ? config.defaultStaticPaths + "," + defaultStaticPaths : defaultStaticPaths;
		this.config = MicroServiceServer.getArgs(config);
		this.restServer = express();
		this.restServer.use(express.urlencoded({extended:true}));
		this.restServer.use(express.json({limit: "1mb"}));
		this.restServer.use(bodyParser.raw({type: ["application/octet-stream", "image/jpeg"]}));
		this.restServer.use(bodyParser.text({type: ["application/text"], limit: "1mb"}));
		this.restServer.all("*", (req, res, next) => this.expressEndPoint(req, res, next));

		this.expressServer = express();

		if (this.config.apiPath != "") {
			console.log(`[MicroServiceServer.constructor] service ${this.config.appName}, port ${this.config.port} : serving static files of ${this.config.webapp}`);
			const paths = this.config.webapp.split(",");

			for (let path of paths)
				this.expressServer.use("/", express.static(path));

			console.log(`[${this.constructor.name}.constructor()] service ${this.config.appName}, port ${this.config.port} : restServer at : ${this.config.apiPath}`);
			this.expressServer.use("/" + this.config.apiPath, this.restServer);
		}

		if (this.config.apiPath != "rest") {
			console.log(`[${this.constructor.name}.constructor()] service ${this.config.appName}, port ${this.config.port} : restServer at : rest`);
			this.expressServer.use("/rest", this.restServer);
		}

		try {
			const privateKey  = fs.readFileSync(this.config.fileNamePrivateKey, 'utf8');
			const certificate = fs.readFileSync(this.config.fileNameCertificate, 'utf8');
			this.server = https.createServer({key: privateKey, cert: certificate}, this.expressServer);
			this.config.protocol = "https";
		} catch (error) {
			this.server = http.createServer(this.expressServer);
			this.config.protocol = "http";
		}

		this.wsServerConnections = new Map();
		this.wsServer = new WebSocketServer({httpServer: this.server, autoAcceptConnections: true});

		this.wsServer.on('connect', (connection) => {
			console.log((new Date()) + ' Connection accepted in micro service ' + this.config.appName);

			connection.on("message", (message) => {
				if (message.type === 'utf8') {
					console.log('Received Message in micro service :', this.config.appName, ":", message.utf8Data);
					this.onWsMessageFromClient(connection, message.utf8Data);
				}
			});

			connection.on("close", (reasonCode, description) => {
				console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
				this.onWsCloseFromClient(connection);
			});
		});

		// TODO : in missing port, auto connect to Redbird based server to discover free port and reverse-proxy registration
	}
	// return a promise
	onRequest(req, res, next) {
		return Promise.resolve(Response.unauthorized("Unknow Route"));
	}
	// private
	expressEndPoint(req, res, next) {
		console.log(`authorization='${req.get("Authorization")}';`);
		console.log(`curl -X '${req.method}' ${req.protocol}://${req.get("Host")}${req.originalUrl} -d '${JSON.stringify(req.body)}' -H 'Connection: ${req.get("Connection")}' -H 'content-type: ${req.get("content-type")}' -H 'Accept: ${req.get("Accept")}' --compressed -H "Authorization: $authorization"`);
		//  -H 'Origin: http://localhost:8080' -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Mode: cors' -H 'Referer: http://localhost:8080/crud/' -H 'Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'

		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS, POST, DELETE");
		res.header("Access-Control-Allow-Headers", req.header('Access-Control-Request-Headers'));

		if (req.method === 'OPTIONS') {
			res.send("Ok");
			return Promise.resolve();
		}

		const queryString = req.url.includes("?") == true ? req.url.substring(req.url.lastIndexOf("?")) : "";
		req.query = Qs.parse(queryString, {ignoreQueryPrefix: true, allowDots: true});
		return this.onRequest(req, res, next).
		catch(err => {
			console.error(`[${this.config.appName}] ${req.url} : ${err.message}`);
			return Response.internalServerError(err.message);
		}).
		then(response => {
			// TODO : registrar em arquivo
			if (req.method != "GET") console.log(response);
			return res.status(response.status).send(response.data);
		});
	}
	// remove the session after it's closed
	onWsCloseFromClient(session) {
		if (!session) {
			throw new Error("Ivalid session");
		}

		if (!session.token) {
			// A chamada à "window.location.reload();"
			// causa o wsSocket close sem o token, por isto não vou gerar exception
			console.warn("Ivalid session token");
			return;
		}

		if (!session.token.name) {
			throw new Error("Ivalid session token name");
		}

		const tokenPayload = session.token;

		if (this.wsServerConnections.has(tokenPayload.name) == true) {
			console.log("Websoket session closed:", this.config.appName, tokenPayload.name);
			this.wsServerConnections.delete(tokenPayload.name);
		}
	}

	onWsMessageFromClient(session, token) {
		try {
			const tokenPayload = jwt.verify(token, process.env.JWT_SECRET || "123456");
			// TODO : verificar o comportamento para esta condição
			if (this.wsServerConnections.has(tokenPayload.name) == true) {
				const oldSession = this.wsServerConnections.get(tokenPayload.name);
				console.error("Replacing already websocket session, check close process !!! :", this.config.appName, " user : ", oldSession.token.name);
			}

			session.token = tokenPayload;
			this.wsServerConnections.set(tokenPayload.name, session);
			console.log("New websocket session opened:", this.config.appName, " user : ", tokenPayload.name);
		} catch (err) {
			console.error("JWT Authorization fail : ", err);
		}
	}

	listen() {
		console.log(`starting listen in ${this.config.appName}...`);
		return new Promise((resolve, reject) => {
			this.server.on("listening", msg => {
				console.log(`...listening at http://${this.server.address().address}:${this.server.address().port}`);
				resolve(this.expressServer);
			});

			this.server.on("error", err => {
				console.log("Error in server", err);
				reject(err);
			});

			this.server.listen(this.config.port);
		});
	}

	loadOpenApi(fileName) {
		if (fileName == null) fileName = this.constructor.getArg("openapi-file", null);
		if (fileName == null) fileName = `openapi-${this.config.appName}.json`;
		console.log(`[${this.constructor.name}.loadOpenApi()] loading ${fileName}`);
		return fsPromises.readFile(fileName).
		then(text => {
			return JSON.parse(text);
		}).
		catch(err => {
			console.log(`[${this.constructor.name}.loadOpenApi()] : fail to parse file ${fileName}:`, err);
			return OpenApi.create({}, this.config.security);
		}).
		then(openapi => {
			if (openapi.servers.length == 0) {
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${this.config.port}/${this.config.apiPath}`});
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${Number.parseInt((this.config.port)/10)*10}/${this.config.appName}/${this.config.apiPath}`});
			}

			return openapi;
		}).
		then(openapi => OpenApi.convertStandartToRufs(openapi)).
		then(openapi => this.openapi = openapi);
	}

	storeOpenApi(openapi, fileName) {
		if (fileName == null) fileName = `openapi-${this.config.appName}.json`;
		return fsPromises.writeFile("rufs-" + fileName, JSON.stringify(openapi, null, "\t")).
		then(() => OpenApi.convertRufsToStandart(openapi)).
		then(standartOpenApi => fsPromises.writeFile(fileName, JSON.stringify(standartOpenApi, null, "\t"))).
		then(() => OpenApi.convertRufsToStandart(openapi, true)).
		then(standartOpenApi => fsPromises.writeFile("client-" + fileName, JSON.stringify(standartOpenApi, null, "\t"))).
		then(() => openapi);
	}

	static checkStandalone() {
		let cmd = process.argv[1];

        if (cmd.indexOf(this.name) >= 0) {
			let instance = new this();
			instance.listen();
        }
	}
}

MicroServiceServer.checkStandalone();

export {MicroServiceServer};
