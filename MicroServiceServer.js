import fs from "fs";
import https from "https";
import http from "http";
import bodyParser from "body-parser";
import express from "express";
import jwt from "jsonwebtoken";
import websocket from "websocket";
import url from "url";
import path from "path";

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

		for (let arg of process.argv) {
			if (arg == base) {
				value = "";
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

		config.dbConfig.host = preferenceConfig.dbConfig.host || MicroServiceServer.getArg("db_host");//localhost// Server hosting the postgres database
		config.dbConfig.port = preferenceConfig.dbConfig.port || MicroServiceServer.getArg("db_port");//5432//env var: PGPORT
		config.dbConfig.database = preferenceConfig.dbConfig.database || MicroServiceServer.getArg("db_name");//env var: PGDATABASE
		config.dbConfig.user = preferenceConfig.dbConfig.user || MicroServiceServer.getArg("db_user");//"development", //env var: PGUSER
		config.dbConfig.password = preferenceConfig.dbConfig.password || MicroServiceServer.getArg("db_password");//"123456", //env var: PGPASSWORD
		config.dbConfig.limitQuery = preferenceConfig.dbConfig.limitQuery || MicroServiceServer.getArg("db-limit-query");

		config.appName = preferenceConfig.appName || MicroServiceServer.getArg("name", "");
		config.port = preferenceConfig.port || MicroServiceServer.getArg("port", "9080");

		config.apiPath = preferenceConfig.apiPath || MicroServiceServer.getArg("api_path", "/rest");
		config.requestBodyContentType = preferenceConfig.requestBodyContentType || MicroServiceServer.getArg("request_body_content_type", "application/json");
		config.responseContentType = preferenceConfig.responseContentType || MicroServiceServer.getArg("response_content_type", "application/json");
		config.security = preferenceConfig.security || MicroServiceServer.getArg("security", "jwt");

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
		this.restServer.use(express.json());
		this.restServer.use(bodyParser.raw({type: ["application/octet-stream", "image/jpeg"]}));
		this.restServer.use(bodyParser.text({type: ["application/text"]}));
		this.restServer.all("*", (req, res, next) => this.expressEndPoint(req, res, next));

		this.expressServer = express();
		console.log(`[MicroServiceServer.constructor] service ${this.config.appName}, port ${this.config.port} : serving static files of ${this.config.webapp}`);
		const paths = this.config.webapp.split(",");

		for (let path of paths)
			this.expressServer.use("/", express.static(path));

		console.log(`[${this.constructor.name}.constructor()] service ${this.config.appName}, port ${this.config.port} : restServer at : ${this.config.apiPath}`);
		this.expressServer.use(this.config.apiPath, this.restServer);

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
	onRequest(req, res, next, resource, action) {
		return Promise.resolve(Response.unauthorized("Unknow Route"));
	}
	// private
	expressEndPoint(req, res, next) {
		const paths =  req.path.split("/");
		let resource = null;
		let action = null;

		if (paths.length >= 2) {
			resource = CaseConvert.underscoreToCamel (paths[1], false);

			if (paths.length >= 3) {
				action = paths[2];
			}
		}

		console.log(`curl -X '${req.method}' ${req.originalUrl} -d '${JSON.stringify(req.body)}' -H 'Authorization: ${req.get("Authorization")}' -H 'Connection: ${req.get("Connection")}' -H 'content-type: ${req.get("content-type")}' -H 'Accept: ${req.get("Accept")}' --compressed`);
		//  -H 'Origin: http://localhost:8080' -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Mode: cors' -H 'Referer: http://localhost:8080/crud/' -H 'Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'

		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS, POST, DELETE");
		res.header("Access-Control-Allow-Headers", req.header('Access-Control-Request-Headers'));

		if (req.method === 'OPTIONS') {
			res.send("Ok");
			return Promise.resolve();
		}
		// TODO : dispensar o HttpRestRequest.urlSearchParamsToJson pois o middleware do Express (qs) já faz a conversão
//		req.jsonSearchParams = HttpRestRequest.urlSearchParamsToJson(req.query);
		req.jsonSearchParams = req.query;
		return this.onRequest(req, res, next, resource, action).
		catch(err => {
			console.error(`[${this.config.appName}] ${req.url} : ${err.message}`);
			return Response.internalServerError(err.message);
		}).
		then(response => {
			// TODO : registrar em arquivo
			if (action != "query") console.log(response);
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

	loadOpenApi() {
		console.log(`[${this.constructor.name}.loadOpenApi()] loading openapi-${this.config.appName}.json`);
		return fsPromises.readFile(`openapi-${this.config.appName}.json`).
		then(text => {
			return JSON.parse(text);
		}).
		catch(err => {
			console.log(`[${this.constructor.name}.loadOpenApi()] : fail to parse file :`, err);
			return OpenApi.create({}, this.config.security);
		}).
		then(openapi => {
			if (openapi.servers.length == 0) {
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${this.config.port}/${this.config.apiPath}`});
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${Number.parseInt((this.config.port)/10)*10}/${this.config.appName}/${this.config.apiPath}`});
			}

			return openapi;
		}).
		then(openapi => OpenApi.convertStandartToRufs(openapi));
	}

	storeOpenApi(openapi) {
		const standartSchemas = {};

		for (let [name, schema] of Object.entries(openapi.components.schemas)) {
			standartSchemas[name] = OpenApi.convertRufsToStandartSchema(schema);
		}

		const standartOpenApi = {};
		standartOpenApi.openapi = openapi.openapi;
		standartOpenApi.info = openapi.info;
		standartOpenApi.servers = openapi.servers;
		standartOpenApi.paths = openapi.paths;
		standartOpenApi.components = {};
		standartOpenApi.components.schemas = standartSchemas;
		standartOpenApi.components.responses = openapi.components.responses;
		standartOpenApi.components.parameters = openapi.components.parameters;
		standartOpenApi.components.requestBodies = openapi.components.requestBodies;
		standartOpenApi.components.securitySchemes = openapi.components.securitySchemes;
		standartOpenApi.security = openapi.security;
		standartOpenApi.tags = openapi.tags;
		return fsPromises.writeFile(`openapi-${this.config.appName}.json`, JSON.stringify(standartOpenApi, null, "\t")).then(() => openapi);
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
