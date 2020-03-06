import fs from "fs";
import jwt from "jsonwebtoken";
import {Response} from "./server-utils.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {Filter} from "./webapp/es6/DataStore.js";
import {RufsSchema} from "./webapp/es6/DataStore.js";
import {DbClientPostgres} from "./dbClientPostgres.js";

const fsPromises = fs.promises;

class RequestFilter {
	static getForeignKeyEntries(serviceName, foreignServiceName) {
        const service = Filter.findOne(RequestFilter.listService, {"name": serviceName});
		let foreignKeyEntries = [];

		for (let [fieldName, field] of Object.entries(service.fields)) {
			if (field.foreignKeysImport != undefined && field.foreignKeysImport.table == foreignServiceName) {
				foreignKeyEntries.push({fieldName, field});
			}
		}

		return foreignKeyEntries;
	}

	static getForeignKey(serviceName, foreignServiceName, obj) {
		const foreignKeyEntries = RequestFilter.getForeignKeyEntries(serviceName, foreignServiceName);
		let foreignKey = {};

		for (let foreignKeyEntry of foreignKeyEntries) {
			foreignKey[foreignKeyEntry.field.foreignKeysImport.field] = obj[foreignKeyEntry.fieldName];
		}

		return foreignKey;
	}

// private to create,update,delete,read
	static checkObjectAccess(tokenData, serviceName, obj) { // LoginResponse tokenData, EntityManager entityManager, Object obj
		let service;

		try {
			service = RequestFilter.getService (tokenData, serviceName);
		} catch (e) {
			return Response.unauthorized(e.Message);
		}

		let response = null;
		const userRufsGroupOwner = RequestFilter.getForeignKey("rufsUser", "rufsGroupOwner", tokenData);
		const rufsGroupOwnerEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroupOwner");

		if (userRufsGroupOwner.id > 1 && rufsGroupOwnerEntries.length > 0) {
			const objRufsGroupOwner = RequestFilter.getForeignKey(serviceName, "rufsGroupOwner", obj);

			if (objRufsGroupOwner.id == undefined) {
				obj.rufsGroupOwner = userRufsGroupOwner.id;
				objRufsGroupOwner.id = userRufsGroupOwner.id;
			}

			if (objRufsGroupOwner.id == userRufsGroupOwner.id) {
				const rufsGroupEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroup");

				if (rufsGroupEntries.length > 0) {
					const rufsGroup = RequestFilter.getForeignKey(serviceName, "rufsGroup", obj);

					if (tokenData.groups.indexOf(rufsGroup.id) < 0) {
						response = Response.unauthorized("unauthorized object rufsGroup");
					}
				}
			} else {
				response = Response.unauthorized("unauthorized object rufsGroupOwner");
			}
		}

		return response;
	}
	//
	static getService(tokenData, serviceName) {
		serviceName = CaseConvert.underscoreToCamel (serviceName, false);

		if (tokenData.roles[serviceName] == undefined) {
			throw new Error("Unauthorized service Access");
		}

        const service = Filter.findOne(RequestFilter.listService, {"name": serviceName});
		return service;
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
			let promises = [];

			if (useDocument == true) {
				// One To One
				{
					const service = RequestFilter.getService(tokenData, serviceName);
					
					for (let [fieldName, field] of Object.entries(service.fields)) {
						if (field.foreignKeysImport != undefined) {
							let item = field.foreignKeysImport;
							
							if (tokenData.roles[item.table] != undefined) {
								// neste caso, valRef contém o id do registro de referência
								const rufsServiceOther = RequestFilter.getService(tokenData, item.table);
								// dataForeign, fieldNameForeign, fieldName
								const primaryKey = rufsServiceOther.getPrimaryKeyFromForeignData(obj, fieldName, item.field);
								promises.push(entityManager.findOne(item.table, primaryKey).then(objExternal => obj[fieldName] = objExternal));
							}
						}
					}
				}
				// One To Many
				{
					const dependents = RufsSchema.getDependents(RequestFilter.listService, serviceName, true);

					for (let item of dependents) {
						let rufsServiceOther = RequestFilter.getService(tokenData, item.table);
						let field = rufsServiceOther.fields[item.field];
						let foreignKey = RufsSchema.getForeignKeyFromPrimaryKeyForeign(rufsServiceOther, obj, item.field);
						promises.push(entityManager.find(item.table, foreignKey).then(list => obj[field.document] = list));
					}
				}
			}

			return Promise.all(promises).then(() => obj);
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
		const rufsGroupOwnerEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroupOwner");
		const rufsGroupEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroup");

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

		for (let [fieldName, field] of Object.entries(service.fields)) {
			const type = field.type;

			if (field.primaryKey == true && type != undefined) {
				if (type == "i" || type.includes("date") || type.includes("time")) {
					orderBy.push(fieldName + " desc");
				}
			}
		}

		return entityManager.find(serviceName, fields, orderBy).then(results =>
			Response.ok(results)
		);
	}

	static getDbConn(dbConnInfo) {
		let dbClient = RequestFilter.dbConnMap.get(dbConnInfo);

		if (dbClient != undefined) Promise.resolve(dbClient);

		dbClient = new DbClientPostgres({connectionString: dbConnInfo});

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
	static checkAuthorization(tokenData, serviceName, uriPath) {
		let access = false;
		const serviceAuth = tokenData.roles[serviceName];
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
		// rufsProcess
		let rufsProcess = tokenData => {
			if (RequestFilter.dbConnMap.get(tokenData.dbConnInfo) != undefined) {
				entityManager = RequestFilter.dbConnMap.get(tokenData.dbConnInfo);
				console.log(`[RequestFilter.processRequest] : using connection ${tokenData.dbConnInfo}`);
			}

			const queryParams = req.query;
			let obj = null;

			if (uriPath == "create" || uriPath == "update" || uriPath == "patch") {
				obj = req.body;
			}

			let cf;

			if (uriPath == "create") {
				cf = RequestFilter.processCreate(tokenData, entityManager, serviceName, obj, microService);
			} else if (uriPath == "update") {
				cf = RequestFilter.processUpdate(tokenData, queryParams, entityManager, serviceName, obj, microService);
			} else if (uriPath == "patch") {
				cf = RequestFilter.processPatch(tokenData, entityManager, serviceName, obj, microService);
			} else if (uriPath == "delete") {
				cf = RequestFilter.processDelete(tokenData, queryParams, entityManager, serviceName, microService);
			} else if (uriPath == "read") {
				cf = RequestFilter.processRead(tokenData, queryParams, entityManager, serviceName, useDocument);
			} else if (uriPath == "query") {
				cf = RequestFilter.processQuery(tokenData, queryParams, entityManager, serviceName);
			} else {
				return Promise.resolve(Response.internalServerError("unknow rote"));
			}

			return cf.catch(error => {
				console.log("ProcessRequest error : ", error);
				return Response.internalServerError(error.message);
			});
		};

		return Promise.resolve().
		then(() => {
			let tokenPayload = RequestFilter.extractTokenPayload(req.get("Authorization"));
			let access = RequestFilter.checkAuthorization(tokenPayload, serviceName, uriPath);
			return access == true ? rufsProcess(tokenPayload) : Promise.resolve(Response.unauthorized("Explicit Unauthorized"));
		}).
		catch(err => {
			console.error(err);
			return Response.unauthorized(err.msg);
		});
	}
	// This method sends the same Bidding object to all opened sessions
	static notify(microService, obj, serviceName, isRemove) {
        const service = Filter.findOne(RequestFilter.listService, {"name": serviceName});

		let getPrimaryKey = () => {
			let primaryKeyBuilder = {};
			
			for (let [fieldName, field] of Object.entries(service.fields)) {
				if (field["primaryKey"] == true) {
					primaryKeyBuilder[fieldName] = obj[fieldName];
				}
			}
			
			return primaryKeyBuilder;
		};
		
		let primaryKey = getPrimaryKey();
		var msg = {};
		msg.service = serviceName;
		msg.primaryKey = primaryKey;

		if (isRemove == false) {
			msg.action = "notify";
		} else {
			msg.action = "delete";
		}

		let str = JSON.stringify(msg);
		const objRufsGroupOwner = RequestFilter.getForeignKey(serviceName, "rufsGroupOwner", obj);
		const rufsGroup = RequestFilter.getForeignKey(serviceName, "rufsGroup", obj);
		console.log("[RequestFilter.notify] broadcasting...", msg);

		for (let [userName, wsServerConnection] of microService.wsServerConnections) {
			let tokenData = wsServerConnection.token;
			const userRufsGroupOwner = RequestFilter.getForeignKey("rufsUser", "rufsGroupOwner", tokenData);
			// enviar somente para os clients de "rufsGroupOwner"
			let checkRufsGroupOwner = objRufsGroupOwner.id == undefined || objRufsGroupOwner.id == userRufsGroupOwner.id;
			let checkRufsGroup = rufsGroup.id == undefined || tokenData.groups.indexOf(rufsGroup.id) >= 0;
			// restrição de rufsGroup
			if (userRufsGroupOwner.id == 1 || (checkRufsGroupOwner && checkRufsGroup)) {
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

	static loadTable(entityManager, name) {
		return entityManager.find(name).catch(() => fsPromises.readFile(name + ".json").then(data => JSON.parse(data)));
	}

	static updateRufsServices(entityManager, openapi) {
        return Promise.resolve().then(() => {
			RequestFilter.listService = [];
			// TODO : trocar openapi.definitions por openapi.paths
        	for (let name in openapi.definitions) RequestFilter.listService.push(new RufsSchema(name, openapi.definitions[name].properties));
        }).then(() => RequestFilter.loadTable(entityManager, "rufsGroupUser")).then(rows => {
            RequestFilter.listGroupUser = rows;
        }).then(() => RequestFilter.loadTable(entityManager, "rufsGroupOwner")).then(rows => {
            RequestFilter.listGroupOwner = rows;
        });
	}

}

RequestFilter.dbConnMap = new Map();
RequestFilter.listService = [];
RequestFilter.listGroupUser = [];
RequestFilter.listGroupOwner = [];

export {RequestFilter}
