import fs from "fs";
import jwt from "jsonwebtoken";
import {Response} from "./server-utils.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {DataStoreManager, Filter} from "./webapp/es6/DataStore.js";
import {DataStore} from "./webapp/es6/DataStore.js";
import {DbClientPostgres} from "./dbClientPostgres.js";

const fsPromises = fs.promises;

class DataStoreManagerDb extends DataStoreManager {
	constructor(listService, entityManager) {
		super(listService);
		this.entityManager = entityManager;
	}

	get(schemaName, primaryKey, ignoreCache) {
		return super.get(schemaName, primaryKey, ignoreCache).
		then(res => {
			if (res != null && res != undefined) return Promise.resolve(res);
			const service = this.getService(schemaName);
			if (service == null || service == undefined) return Promise.resolve(null);
			return this.entityManager.findOne(schemaName, primaryKey).then(data => service.cache(primaryKey, data));
		});
	}
}

class RequestFilter {
// private to create,update,delete,read
	static checkObjectAccess(tokenData, serviceName, obj) {
		let service;

		try {
			service = RequestFilter.getService (tokenData, serviceName);
		} catch (e) {
			return Response.unauthorized(e.Message);
		}

		let response = null;
		const userRufsGroupOwner = RequestFilter.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", tokenData);
		const rufsGroupOwnerEntries = RequestFilter.dataStoreManager.getForeignKeyEntries(serviceName, "rufsGroupOwner");

		if (userRufsGroupOwner != undefined && userRufsGroupOwner.primaryKey.id > 1 && rufsGroupOwnerEntries.length > 0) {
			const objRufsGroupOwner = RequestFilter.dataStoreManager.getPrimaryKeyForeign(serviceName, "rufsGroupOwner", obj);

			if (objRufsGroupOwner == undefined) {
				obj.rufsGroupOwner = userRufsGroupOwner.primaryKey.id;
				objRufsGroupOwner = {primaryKey: {}};
				objRufsGroupOwner.primaryKey.id = userRufsGroupOwner.primaryKey.id;
			}

			if (objRufsGroupOwner.primaryKey.id == userRufsGroupOwner.primaryKey.id) {
				const rufsGroup = RequestFilter.dataStoreManager.getPrimaryKeyForeign(serviceName, "rufsGroup", obj);

				if (rufsGroup != undefined && tokenData.groups.indexOf(rufsGroup.primaryKey.id) < 0) {
					response = Response.unauthorized("unauthorized object rufsGroup");
				}
			} else {
				response = Response.unauthorized("unauthorized object rufsGroupOwner");
			}
		}

		return response;
	}
	//
	static getService(tokenData, serviceName) {
		return RequestFilter.dataStoreManager.getService(serviceName, tokenData);
	}
	// public
	static processCreate(user, entityManager, serviceName, obj, microService) {
		const response = RequestFilter.checkObjectAccess(user, serviceName, obj);

		if (response != null) Promise.resolve(response);

		return entityManager.insert(serviceName, obj).then(newObj => {
			const primaryKey = RequestFilter.notify(microService, newObj, serviceName, false);
			// force read, cases of triggers before break result value
			return entityManager.findOne(serviceName, primaryKey).then(_obj => Response.ok(_obj));
		});
	}
	// public
	static getObject(tokenData, queryParams, entityManager, serviceName, useDocument) {
		const primaryKey = RequestFilter.parseQueryParameters(tokenData, serviceName, queryParams, true);
		return entityManager.findOne(serviceName, primaryKey).
		then(obj => {
			if (useDocument != true) return obj;
			return RequestFilter.dataStoreManager.getDocument(serviceName, obj, true, tokenData);
		}).
		catch(error => {
			throw new Error(`[RequestFilter.getObject] for service ${serviceName}, fail to find object with primaryKey ${JSON.stringify(primaryKey)} : ` + error.message);
		});
	}
	// public processRead
	static processRead(user, queryParams, entityManager, serviceName, useDocument) {
		return RequestFilter.getObject(user, queryParams, entityManager, serviceName, useDocument).then(obj => Response.ok(obj));
	}
	// public processUpdate
	static processUpdate(user, queryParams, entityManager, serviceName, obj, microService) {
		return RequestFilter.getObject(user, queryParams, entityManager, serviceName).then(oldObj => {
			const response = RequestFilter.checkObjectAccess(user, serviceName, obj);

			if (response != null) return Promise.resolve(response);

			return entityManager.update(serviceName, RequestFilter.parseQueryParameters(user, serviceName, queryParams, true), obj).then(newObj => {
				const primaryKey = RequestFilter.notify(microService, newObj, serviceName, false);
				// force read, cases of triggers before break result value
				return entityManager.findOne(serviceName, primaryKey).then(_obj => Response.ok(_obj));
			});
		});
	}
	// public processDelete
	static processDelete(user, queryParams, entityManager, serviceName, microService) {
		return RequestFilter.getObject(user, queryParams, entityManager, serviceName).then(obj => {
			return entityManager.deleteOne(serviceName, RequestFilter.parseQueryParameters(user, serviceName, queryParams, true)).then(objDeleted => {
				RequestFilter.notify(microService, objDeleted, serviceName, true);
				return Response.ok(objDeleted);
			});
		});
	}
	// public
	static processPatch(user, entityManager, serviceName, obj, microService) {
		const response = RequestFilter.checkObjectAccess(user, serviceName, obj);

		if (response != null) Promise.resolve(response);

		const service = RequestFilter.getService(user, serviceName);

		const process = keys => {
			if (keys.length > 0) {
				return entityManager.findOne(serviceName, keys.pop()).catch(() => process(keys));
			} else {
				return Promise.resolve(null);
			}
		};

		return process(service.getKeys(obj)).then(foundObj => {
			if (foundObj != null) {
				const primaryKey = service.getPrimaryKey(foundObj);
				return RequestFilter.processUpdate(user, primaryKey, entityManager, serviceName, obj, microService);
			} else {
				return RequestFilter.processCreate(user, entityManager, serviceName, obj, microService);
			}
		});
	}
	// private
	static parseQueryParameters(tokenData, serviceName, queryParameters, onlyPrimaryKey) {
		// se não for admin, limita os resultados para as rufsGroup vinculadas a empresa do usuário
		const userRufsGroupOwner = tokenData.rufsGroupOwner;
		const rufsGroupOwnerEntries = RequestFilter.dataStoreManager.getForeignKeyEntries(serviceName, "rufsGroupOwner");
		const rufsGroupEntries = RequestFilter.dataStoreManager.getForeignKeyEntries(serviceName, "rufsGroup");

		if (userRufsGroupOwner > 1) {
			if (rufsGroupOwnerEntries.length > 0) queryParameters[rufsGroupOwnerEntries[0].fieldName] = userRufsGroupOwner;
			if (rufsGroupEntries.length > 0) queryParameters[rufsGroupEntries[0].fieldName] = tokenData.groups;
		}

		const service = RequestFilter.getService(tokenData, serviceName);
		const obj = service.copyFields(queryParameters);
		let ret;

		if (onlyPrimaryKey == true)
			ret = service.getPrimaryKey(obj);
		else
			ret = obj;

		return ret;
   	}
	// public
	static processQuery(tokenData, queryParams, entityManager, serviceName) {
		const fields = RequestFilter.parseQueryParameters(tokenData, serviceName, queryParams);
		let orderBy = [];
		const service = RequestFilter.getService (tokenData, serviceName);

		for (let fieldName of service.primaryKeys) {
			const field = service.properties[fieldName];
			const type = field.type;

			if (type != undefined) {
				if (type == "integer" || type.includes("date") || type.includes("time")) {
					orderBy.push(fieldName + " desc");
				}
			}
		}

		return entityManager.find(serviceName, fields, orderBy).then(results =>
			Response.ok(results)
		);
	}

	static getDbConn(dbConnInfo, limitQuery) {
		let dbClient = RequestFilter.dbConnMap.get(dbConnInfo);

		if (dbClient != undefined) Promise.resolve(dbClient);

		dbClient = new DbClientPostgres({"connectionString": dbConnInfo, "limitQuery": limitQuery});

		return dbClient.connect().
		then(() => {
			RequestFilter.dbConnMap.set(dbConnInfo, dbClient);
			console.log(`[RequestFilter.authenticateByUserAndPassword] : added db connection to ${dbConnInfo}`);
			return dbConnInfo;
		}).
		catch(err => {
			console.err(`[RequestFilter.authenticateByUserAndPassword] : fail db connection to ${dbConnInfo} : `, err);
			return undefined;
		});
	}
	// public
	static checkAuthorization(req, serviceName, uriPath) {
		req.tokenPayload = RequestFilter.extractTokenPayload(req.get("Authorization"));
		let access = false;
		const serviceAuth = req.tokenPayload.roles[serviceName];
		// verfica a permissao de acesso
		if (serviceAuth != undefined) {
			const defaultAccess = {query: true, read: true, create: true, update: false, delete: false, patch: true};

			if (serviceAuth[uriPath] != undefined) {
				access = serviceAuth[uriPath];
			} else {
				access = defaultAccess[uriPath];
			}
		}

		return access;
	}
	// public
	static extractTokenPayload(authorizationHeader) {
		let tokenData;
		const authorizationHeaderPrefix = "Bearer ";

		if (authorizationHeader != undefined && authorizationHeader.startsWith(authorizationHeaderPrefix)) {
			try {
				const token = authorizationHeader.substring(authorizationHeaderPrefix.length);
				tokenData = jwt.verify(token, process.env.JWT_SECRET || "123456");
			} catch (err) {
				throw new Exception("JWT Authorization fail : " + err);
			}
		} else {
			throw new Exception("Authorization token header invalid");
		}

		return tokenData;
	}
	// processRequest
	static processRequest(req, res, next, entityManager, microService, serviceName, uriPath, useDocument) {
		if (microService.fileDbAdapter.fileTables.has(serviceName) == true) {
			entityManager = microService.fileDbAdapter;
		} else if (RequestFilter.dbConnMap.get(req.tokenPayload.dbConnInfo) != undefined) {
			entityManager = RequestFilter.dbConnMap.get(req.tokenPayload.dbConnInfo);
			console.log(`[RequestFilter.processRequest] : using connection ${req.tokenPayload.dbConnInfo}`);
		}

		const queryParams = req.query;
		let obj = null;

		if (uriPath == "create" || uriPath == "update" || uriPath == "patch") {
			obj = req.body;
		}

		let cf;

		if (uriPath == "create") {
			cf = RequestFilter.processCreate(req.tokenPayload, entityManager, serviceName, obj, microService);
		} else if (uriPath == "update") {
			cf = RequestFilter.processUpdate(req.tokenPayload, queryParams, entityManager, serviceName, obj, microService);
		} else if (uriPath == "patch") {
			cf = RequestFilter.processPatch(req.tokenPayload, entityManager, serviceName, obj, microService);
		} else if (uriPath == "delete") {
			cf = RequestFilter.processDelete(req.tokenPayload, queryParams, entityManager, serviceName, microService);
		} else if (uriPath == "read") {
			cf = RequestFilter.processRead(req.tokenPayload, queryParams, entityManager, serviceName, useDocument);
		} else if (uriPath == "query") {
			cf = RequestFilter.processQuery(req.tokenPayload, queryParams, entityManager, serviceName);
		} else {
			return Promise.resolve(Response.internalServerError("unknow rote"));
		}

		return cf.catch(error => {
			console.log("ProcessRequest error : ", error);
			return Response.internalServerError(error.message);
		});
	}
	// This method sends the same Bidding object to all opened sessions
	static notify(microService, obj, serviceName, isRemove) {
        const service = RequestFilter.dataStoreManager.services[serviceName];
		const primaryKey = service.getPrimaryKey(obj);
		var msg = {};
		msg.service = serviceName;
		msg.primaryKey = primaryKey;

		if (isRemove == false) {
			msg.action = "notify";
		} else {
			msg.action = "delete";
		}

		let str = JSON.stringify(msg);
		const objRufsGroupOwner = RequestFilter.dataStoreManager.getPrimaryKeyForeign(serviceName, "rufsGroupOwner", obj);
		const rufsGroup = RequestFilter.dataStoreManager.getPrimaryKeyForeign(serviceName, "rufsGroup", obj);
		console.log("[RequestFilter.notify] broadcasting...", msg);

		for (let [userName, wsServerConnection] of microService.wsServerConnections) {
			let tokenData = wsServerConnection.token;
			const userRufsGroupOwner = RequestFilter.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", tokenData);
			// enviar somente para os clients de "rufsGroupOwner"
			let checkRufsGroupOwner = objRufsGroupOwner == undefined || objRufsGroupOwner.primaryKey.id == userRufsGroupOwner.primaryKey.id;
			let checkRufsGroup = rufsGroup == undefined || tokenData.groups.indexOf(rufsGroup.primaryKey.id) >= 0;
			// restrição de rufsGroup
			if (userRufsGroupOwner.primaryKey.id == 1 || (checkRufsGroupOwner && checkRufsGroup)) {
				let role = tokenData.roles[serviceName];

				if (role != undefined && role.read != false) {
					Promise.resolve().then(() => {
						console.log("[RequestFilter.notify] send to client", tokenData.name);
						wsServerConnection.sendUTF(str)
					});
				}
			}
		}

		return primaryKey;
	}

	static updateRufsServices(entityManager, openapi) {
        return Promise.resolve().then(() => {
        	console.log(`RequestFilter.updateRufsServices() : reseting RequestFilter.dataStoreManager`);
			const listDataStore = [];
			// TODO : trocar openapi.definitions por openapi.paths
        	for (let name in openapi.definitions) {
        		listDataStore.push(new DataStore(name, openapi.definitions[name]));
        	}

        	RequestFilter.dataStoreManager = new DataStoreManagerDb(listDataStore, entityManager);
        });
	}

}

RequestFilter.dbConnMap = new Map();

export {RequestFilter}
