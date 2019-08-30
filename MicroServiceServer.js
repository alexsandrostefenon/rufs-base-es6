import fs from "fs";
import https from "https";
import http from "http";
import bodyParser from "body-parser";
import express from "express";
import jwt from "jsonwebtoken";
import websocket from "websocket";
import url from "url";
import fetch from "node-fetch";

import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {HttpRestRequest, ServerConnection} from "./webapp/es6/ServerConnection.js";
import {Response} from "./server-utils.js";

const fsPromises = fs.promises;
const WebSocketServer = websocket.server;

class MicroServiceServer {

	static getArg(name, defaultValue) {
		let value = defaultValue;

		for (let arg of process.argv) {
			let tmp = "--" + name + "=";

			if (arg.startsWith(tmp)) {
				value = arg.substring(tmp.length);
				console.log(name, value);
				break;
			}
		}

		return value;
	}

	constructor(config) {
		this.config = {};
		this.config.dbConfig = {};
		if (config == undefined) config = {};
		if (config.dbConfig == undefined) config.dbConfig = {};
		this.config.dbConfig.host = config.dbConfig.host || MicroServiceServer.getArg("db_host");//localhost// Server hosting the postgres database
		this.config.dbConfig.port = config.dbConfig.port || MicroServiceServer.getArg("db_port");//5432//env var: PGPORT
		this.config.dbConfig.database = config.dbConfig.database || MicroServiceServer.getArg("db_name");//env var: PGDATABASE
		this.config.dbConfig.user = config.dbConfig.user || MicroServiceServer.getArg("db_user");//"development", //env var: PGUSER
		this.config.dbConfig.password = config.dbConfig.password || MicroServiceServer.getArg("db_password");//"123456", //env var: PGPASSWORD

		this.config.appName = config.appName || MicroServiceServer.getArg("name", "");
		this.config.port = config.port || MicroServiceServer.getArg("port", "9080");
		this.config.fileNamePrivateKey = config.fileNamePrivateKey || MicroServiceServer.getArg("private-key", "key.pem");
		this.config.fileNameCertificate = config.fileNameCertificate || MicroServiceServer.getArg("certificate", "cert.pem");
		this.config.webapp = config.webapp || MicroServiceServer.getArg("webapp", `./rufs-${this.config.appName}-es6/webapp`);

		this.restServer = express();
		this.restServer.use(express.urlencoded({extended:true}));
		this.restServer.use(express.json());
		this.restServer.use(bodyParser.raw({type: ["application/octet-stream", "image/jpeg"]}));
		this.restServer.use(bodyParser.text({type: ["application/text"]}));
		this.restServer.all("*", (req, res, next) => this.expressEndPoint(req, res, next));

		this.expressServer = express();
		this.expressServer.use("/", express.static(this.config.webapp));
		this.expressServer.use("/rest", this.restServer);

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

		console.log("RemoteAddr : ", req.ip);
		console.log("method : ", req.method);
		console.log("resource : ", resource);
		console.log("action : ", action);
		console.log("path : ", req.path);

		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS, POST, DELETE");
		res.header("Access-Control-Allow-Headers", req.header('Access-Control-Request-Headers'));

		if (req.method === 'OPTIONS') {
			res.send("Ok");
			return;
		}

		this.onRequest(req, res, next, resource, action).
		then(response => res.status(response.status).send(response.data));
	}
	// remove the session after it's closed
	onWsCloseFromClient(session) {
		const tokenPayload = session.token;

		if (this.wsServerConnections.get(tokenPayload.name) != null) {
			console.log("Websoket session closed:", this.config.appName, tokenPayload.name);
			this.wsServerConnections.delete(tokenPayload.name);
		}
	}

	onWsMessageFromClient(session, token) {
		try {
			const tokenPayload = jwt.verify(token, process.env.JWT_SECRET || "123456");

			if (this.wsServerConnections.get(tokenPayload.name) == null) {
				session.token = tokenPayload;
				this.wsServerConnections.set(tokenPayload.name, session);
				console.log("New websocket session opened:", this.config.appName, " user : ", tokenPayload.name);
			}
		} catch (err) {
			console.error("JWT Authorization fail : ", err);
		}
	}

	listen() {
		console.log(`starting listen in ${this.urlRest}...`);
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
