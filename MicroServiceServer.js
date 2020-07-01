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

		req.jsonSearchParams = HttpRestRequest.urlSearchParamsToJson(req.query);
		return this.onRequest(req, res, next, resource, action).
		catch(err => {
			console.error(`[${this.config.appName}] ${req.url} : ${err.message}`);
			return Response.internalServerError(err.message);
		}).
		then(response => res.status(response.status).send(response.data));
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
	// public to be overwrite from childrens
	fillOpenApi(openapi) {
		if (openapi.paths == undefined) openapi.paths = {};
		if (openapi.components == undefined) openapi.components = {};
		if (openapi.components.schemas == undefined) openapi.components.schemas = {};
		if (openapi.components.responses == undefined) openapi.components.responses = {};
		if (openapi.components.parameters == undefined) openapi.components.parameters = {};
		if (openapi.components.requestBodies == undefined) openapi.components.requestBodies = {};
		if (openapi.tags == undefined) openapi.tags = [];
		// add components/responses with error schema
		const schemaError = {"type": "object", "properties": {"code": {"type": "integer"}, "description": {"type": "string"}}, "required": ["code", "description"]};
		openapi.components.responses["Error"] = {"description": "Error response", "content": {"application/json": {"schema": schemaError}}};

		for (let [schemaName, schema] of Object.entries(openapi.components.schemas)) {
			if (schema.primaryKeys == undefined) schema.primaryKeys = [];
			openapi.tags.push({"name": schemaName});
			const mediaTypeObject = {"schema": {"$ref": `#/components/schemas/${schemaName}`}};
			// fill components/requestBody with schemas
			openapi.components.requestBodies[schemaName] = {"required": true, "content": {}};
			openapi.components.requestBodies[schemaName].content[this.config.requestBodyContentType] = mediaTypeObject;
			// fill components/responses with schemas
			openapi.components.responses[schemaName] = {"description": "response", "content": {}};
			openapi.components.responses[schemaName].content[this.config.responseContentType] = mediaTypeObject;
			// fill components/parameters with primaryKeys
			if (schema.primaryKeys.length > 0) {
				const schemaPrimaryKey = {"type": "object", "properties": {}, "required": schema.primaryKeys};

				for (const primaryKey of schema.primaryKeys) {
					schemaPrimaryKey.properties[primaryKey] = schema.properties[primaryKey];
				}

				openapi.components.parameters[schemaName] = {"name": "primaryKey", "in": "query", "required": true, "schema": this.convertRufsToOpenApiSchema(schemaPrimaryKey)};
			}
			// path
			const pathName = `/${schemaName}`;
			const pathItemObject = openapi.paths[pathName] = {};
			const responsesRef = {"200": {"$ref": `#/components/responses/${schemaName}`}, "default": {"$ref": `#/components/responses/Error`}};
			const parametersRef = [{"$ref": `#/components/parameters/${schemaName}`}];
			const requestBodyRef = {"$ref": `#/components/requestBodies/${schemaName}`};

			const methods =                ["get", "put", "post", "delete", "patch"];
			const methodsHaveParameters =  [true , true , false , true    , true   ];
			const methodsHaveRequestBody = [false, true , true  , false   , true   ];

			for (let i = 0; i < methods.length; i++) {
				const method = methods[i];
				const operationObject = {"operationId": `${method}_${schemaName}`};

				if (methodsHaveParameters[i] == true) operationObject.parameters = parametersRef;
				if (methodsHaveRequestBody[i] == true) operationObject.requestBody = requestBodyRef;
				operationObject.responses = responsesRef;
				operationObject.tags = [schemaName];
				operationObject.description = `CRUD ${method} operation over ${schemaName}`;

				if (methodsHaveParameters[i] == false || schema.primaryKeys.length > 0) {
					pathItemObject[method] = operationObject;
				}
			}
		}

		return this.storeOpenApi(openapi);
	}

	loadOpenApi() {
		console.log(`[${this.constructor.name}.loadOpenApi()] loading openapi-${this.config.appName}.json`);
		return fsPromises.readFile(`openapi-${this.config.appName}.json`).
		then(text => JSON.parse(text)).
		catch(() => {
			return {};
		}).
		then(openapi => {
			if (openapi.openapi == undefined) openapi.openapi = "3.0.3";
			if (openapi.info == undefined) {
				openapi.info = {"title": "rufs-base-es6 openapi genetator", "version": "1.0.0", "description": "CRUD operations"};
				openapi.info.contact = {
				  "name": "API Support",
				  "url": "http://www.example.com/support",
				  "email": "support@example.com"
				};
			}

			if (openapi.servers == undefined) {
				openapi.servers = [];
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${this.config.port}/${this.config.apiPath}`});
				openapi.servers.push({"url": `${this.config.protocol}://localhost:${Number.parseInt((this.config.port)/10)*10}/${this.config.appName}/${this.config.apiPath}`});
			}

			if (openapi.paths == undefined) openapi.paths = {};
			if (openapi.components == undefined) openapi.components = {};
			if (openapi.components.schemas == undefined) openapi.components.schemas = {};
			if (openapi.components.parameters == undefined) openapi.components.parameters = {};

			if (openapi.components.securitySchemes == undefined) {
				const securitySchemes = {};
				securitySchemes.jwt = {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"};
				securitySchemes.apiKey = {"type": "apiKey", "in": "header", "name": "X-API-KEY"};
				securitySchemes.basic = {"type": "http", "scheme": "basic"};
				openapi.components.securitySchemes = securitySchemes;
			}

			if (openapi.security == undefined) {
				const security = {};
				security[this.config.security] = [];
				openapi.security = [security];
			}

			if (openapi.tags == undefined) openapi.tags = [];
			return openapi;
		}).
		then(openapi => {
			for (let [name, schema] of Object.entries(openapi.components.schemas)) {
				if (schema["x-primaryKeys"] != undefined) {
					schema.primaryKeys = schema["x-primaryKeys"];
					delete schema["x-primaryKeys"];
				}

				if (schema["x-uniqueKeys"] != undefined) {
					schema.uniqueKeys = schema["x-uniqueKeys"];
					delete schema["x-uniqueKeys"];
				}

				if (schema["x-foreignKeys"] != undefined) {
					schema.foreignKeys = schema["x-foreignKeys"];
					delete schema["x-foreignKeys"];
				}

				if (schema.required == undefined) schema.required = [];
				const skypes = ["x-$ref", "x-identityGeneration", "x-notNull", "x-updatable", "x-scale", "x-precision"];

				for (let [fieldName, field] of Object.entries(schema.properties)) {
					if (schema.required.indexOf(fieldName) >= 0) field.required = true;

					if (field.format == "date-time" || field.format == "date") {
						field.type = field.format;
					}

					for (let skypeName of skypes) {
						if (field[skypeName] != undefined) {
							field[skypeName.substring(1)] = field[skypeName];
							delete field[skypeName];
						}
					}
				}
			}

			return openapi;
		}).
		then(openapi => {
			if (this.openapi == undefined) return openapi;
			if (this.openapi.components == undefined) this.openapi.components = {};
			if (this.openapi.components.schemas == undefined) this.openapi.components.schemas = {};
			let isChanged = false;

			for (let [name, schema] of Object.entries(this.openapi.components.schemas)) {
				if (schema.primaryKeys == undefined) schema.primaryKeys = [];
				if (schema.required == undefined) schema.required = [];

				for (let [fieldName, field] of Object.entries(schema.properties)) {
					if (field.type == undefined) field.type = "string";
					if (field.primaryKey == true && schema.primaryKeys.indexOf(fieldName) < 0) schema.primaryKeys.push(fieldName);
					if (field.required == true && schema.required.indexOf(fieldName) < 0) schema.required.push(fieldName);
				}

				const oldSchema = openapi.components.schemas[name];

				if (oldSchema == undefined || JSON.stringify(oldSchema) != JSON.stringify(schema)) {
					openapi.components.schemas[name] = schema;
					isChanged = true;
				}
			}

			if (isChanged == true)
				return this.storeOpenApi(openapi);
			else
				return openapi;
		});
	}

	convertRufsToOpenApiSchema(schema) {
		const standartSchema = {};
		standartSchema.type = schema.type || "object";

		if (Array.isArray(schema.required) == true) {
			standartSchema.required = schema.required;
		} else {
			standartSchema.required = [];
		}

		if (schema.primaryKeys && schema.primaryKeys.length > 0) standartSchema["x-primaryKeys"] = schema.primaryKeys;
		standartSchema["x-uniqueKeys"] = schema.uniqueKeys;
		standartSchema["x-foreignKeys"] = schema.foreignKeys;
		standartSchema.properties = {};

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			let property = {};
			const type = field.type;

			if (type == "date-time" || type == "date") {
				property.type = "string";
				property.format = type;
			} else {
				property.type = type;
			}

			if (type == "object") {
				if (field.$ref) {
					property.$ref = field.$ref;
				} else {
					if (field.properties != undefined) {
						property = this.convertRufsToOpenApiSchema(field);
					} else {
						console.error(`[${this.constructor.name}.convertRufsToOpenApiSchema()] : missing "properties" in field ${fieldName} from schema :`, schema);
					}
				}
			} else {
				if (field.$ref) property["x-$ref"] = field.$ref;
				if (field.identityGeneration) property["x-identityGeneration"] = field.identityGeneration;
				if (field.notNull) property["x-notNull"] = field.notNull;
				if (field.updatable) property["x-updatable"] = field.updatable;
				if (field.scale) property["x-scale"] = field.scale;
				if (field.precision) property["x-precision"] = field.precision;
				if (field.maxLength) property.maxLength = field.maxLength;
				if (field.pattern) property.pattern = field.pattern;
				if (field.format) property.format = field.format;
			}

			if (field.required == true && standartSchema.required.indexOf(fieldName) < 0)
				standartSchema.required.push(fieldName);

			if (field.default) property.default = field.default;
			if (field.description) property.description = field.description;
			if (field.enum) property.enum = field.enum;
			standartSchema.properties[fieldName] = property;
		}

		return standartSchema;
	}

	storeOpenApi(openapi) {
		const standartSchemas = {};

		for (let [name, schema] of Object.entries(openapi.components.schemas)) {
			standartSchemas[name] = this.convertRufsToOpenApiSchema(schema);
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

	static updateJsonSchema(schemaName, schemaNew, schemaOld) {
		schemaOld = schemaOld != undefined && schemaOld != null ? schemaOld : {};
//		console.log(`[MicroServiceServer.updateJsonSchema(schemaName: ${schemaName}, schemaNew.properties: ${schemaNew.properties}, schemaOld.properties: ${schemaOld.properties})]`);
		const jsonSchemaTypes = ["boolean", "string", "integer", "number", "date-time", "date"];
		if (schemaNew.properties == undefined) schemaNew.properties = {};
		if (schemaOld.properties == undefined) schemaOld.properties = {};
		let newFields = schemaNew.properties;
		let oldFields = schemaOld.properties;
		if (newFields == undefined) throw new Error(`rufsServiceDbSync.generateJsonSchema(${schemaName}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = Object.entries(JSON.parse(newFields));
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		if (newFields instanceof Map == false) newFields = Object.entries(newFields);
		let jsonBuilder = {}; 

		for (let [fieldName, field] of newFields) {
			if (field.type == undefined) field.type = "string";
			if (field.hiden == undefined && field.identityGeneration != undefined) field.hiden = true;
			if (field.readOnly == undefined && field.identityGeneration != undefined) field.readOnly = true;

			if (jsonSchemaTypes.indexOf(field.type) < 0) {
				console.error(`${schemaName} : ${fieldName} : Unknow type : ${field.type}`);
				continue;
			}
			// type (columnDefinition), readOnly, hiden, primaryKey, required (insertable), updatable, default, length, precision, scale 
			let jsonBuilderValue = {};
			// registra conflitos dos valores antigos com os valores detectados do banco de dados
			jsonBuilderValue["type"] = field.type;

			if (field.updatable == false) {
				jsonBuilderValue["updatable"] = false;
			}

			if (field.maxLength > 0) {
				jsonBuilderValue["maxLength"] = field.maxLength;
			}

			if (field.precision > 0) {
				jsonBuilderValue["precision"] = field.precision;
			}

			if (field.scale > 0) {
				jsonBuilderValue["scale"] = field.scale;
			}

			if (field.notNull == true) {
				jsonBuilderValue["required"] = true;
			} else {
				jsonBuilderValue["required"] = field.required;
			}
			//
			if (field.$ref != undefined) {
				jsonBuilderValue["$ref"] = field.$ref;
			}

			jsonBuilderValue["default"] = field.default;
			jsonBuilderValue["unique"] = field.unique;
			jsonBuilderValue["identityGeneration"] = field.identityGeneration;
			jsonBuilderValue["isClonable"] = field.isClonable;
			jsonBuilderValue["hiden"] = field.hiden;
			jsonBuilderValue["readOnly"] = field.readOnly;
			jsonBuilderValue["description"] = field.description;
			// oculta tipos incompatíveis
			if (jsonBuilderValue["type"] != "string") {
				delete jsonBuilderValue["length"];
			}

			if (jsonBuilderValue["type"] != "number") {
				delete jsonBuilderValue["precision"];
				delete jsonBuilderValue["scale"];
			}
			// habilita os campos PLENAMENTE não SQL
			jsonBuilderValue.title = field.title;
			jsonBuilderValue.document = field.document;
			jsonBuilderValue.enum = field.enum;
			jsonBuilderValue.enumLabels = field.enumLabels;
			jsonBuilderValue.sortType = field.sortType;
			jsonBuilderValue.orderIndex = field.orderIndex;
			jsonBuilderValue.tableVisible = field.tableVisible;
			jsonBuilderValue.shortDescription = field.shortDescription;
			// exceções
			if (oldFields != undefined && oldFields[fieldName] != undefined) {
				let fieldOriginal = oldFields[fieldName];
				// copia do original os campos PLENAMENTE não SQL
				jsonBuilderValue.title = fieldOriginal.title;
				jsonBuilderValue.document = fieldOriginal.document;
				jsonBuilderValue.enum = fieldOriginal.enum;
				jsonBuilderValue.enumLabels = fieldOriginal.enumLabels;
				jsonBuilderValue.sortType = fieldOriginal.sortType;
				jsonBuilderValue.orderIndex = fieldOriginal.orderIndex;
				jsonBuilderValue.tableVisible = fieldOriginal.tableVisible;
				jsonBuilderValue.shortDescription = fieldOriginal.shortDescription;
				// registra conflitos dos valores antigos com os valores detectados do banco de dados
				const exceptions = ["service", "isClonable", "hiden", "$ref"];

				for (let subFieldName in fieldOriginal) {
					if (exceptions.indexOf(subFieldName) < 0 && fieldOriginal[subFieldName] != jsonBuilderValue[subFieldName]) {
						console.warn(`rufsServiceDbSync.generateJsonSchema() : table [${schemaName}], field [${fieldName}], property [${subFieldName}] conflict previous declared [${fieldOriginal[subFieldName]}] new [${jsonBuilderValue[subFieldName]}]\nold:\n`, fieldOriginal, "\nnew:\n", jsonBuilderValue);
					}
				}
				// copia do original os campos PARCIALMENTE não SQL
				jsonBuilderValue.isClonable = fieldOriginal.isClonable;
				jsonBuilderValue.readOnly = fieldOriginal.readOnly;
				jsonBuilderValue.hiden = fieldOriginal.hiden;
			}
			// oculta os valores dafault
			const defaultValues = {updatable: true, maxLength: 255, precision: 9, scale: 3, hiden: false, primaryKey: false, required: false};

			for (let subFieldName in defaultValues) {
				if (jsonBuilderValue[subFieldName] == defaultValues[subFieldName]) {
					delete jsonBuilderValue[subFieldName];
				}
			}
			// troca todos os valores null por undefined
			for (let [key, value] of Object.entries(jsonBuilderValue)) {
				if (value == null) delete jsonBuilderValue[key];
			}

			jsonBuilder[fieldName] = jsonBuilderValue;
		}

		const schema = {};
		schema.properties = jsonBuilder;
		schema.primaryKeys = schemaNew.primaryKeys;
		schema.uniqueKeys = schemaNew.uniqueKeys;
		schema.foreignKeys = schemaNew.foreignKeys;
		return schema;
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
