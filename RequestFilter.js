import fs from "fs";
import jwt from "jsonwebtoken";
import {Response} from "./server-utils.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {Filter} from "./webapp/es6/DataStore.js";
import {RufsServiceUtils} from "./webapp/es6/ServerConnection.js";
import {DbClientPostgres} from "./dbClientPostgres.js";

const fsPromises = fs.promises;

class RequestFilter {
	static getForeignKeyEntries(serviceName, foreignServiceName) {
        const service = Filter.findOne(RequestFilter.listService, {"name": serviceName});
		if (service.jsonFields == undefined) service.jsonFields = JSON.parse(service.fields);
		let foreignKeyEntries = [];

		for (let [fieldName, field] of Object.entries(service.jsonFields)) {
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
			throw new Exception ("Unauthorized service Access");
		}

        const service = Filter.findOne(RequestFilter.listService, {"name": serviceName});
		if (service.jsonFields == undefined) service.jsonFields = JSON.parse(service.fields);
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
	static getObject(tokenData, uriInfo, entityManager, serviceName, useDocument) {
		const primaryKeyForeign = RequestFilter.parseQueryParameters(tokenData, serviceName, uriInfo.query);
		return entityManager.findOne(serviceName, primaryKeyForeign).
		then(obj => {
			let promises = [];

			if (useDocument == true) {
				// TODO : inspect response.data and add/replace foreign data (compliance XSD),
				// like replace request.person (int) to his Person object
				let rufsService = RequestFilter.getService(tokenData, serviceName);

				if (rufsService.jsonFields.oneToMany != undefined) {
					for (let item of rufsService.jsonFields.oneToMany.list) {
						let rufsServiceOther = RequestFilter.getService(tokenData, item.table);
						let foreignKey = RufsServiceUtils.getForeignKeyFromPrimaryKeyForeign(rufsServiceOther, obj, item.field);
						// TODO : call Query
						if (obj.oneToMany == undefined) obj.oneToMany = {};
						if (obj.oneToMany[item.table] == undefined) obj.oneToMany[item.table] = {};
						promises.push(entityManager.find(item.table, foreignKey).then(list => obj.oneToMany[item.table][item.field] = list));
					}
				}
			}

			return Promise.all(promises).then(() => obj);
		}).
		catch(error => {
			throw new Error("fail to find object with rufsGroup and query parameters related : " + error.message);
		});
	}
	// public processRead
	static processRead(user, uriInfo, entityManager, serviceName, useDocument) {
		return RequestFilter.getObject(user, uriInfo, entityManager, serviceName, useDocument).then(obj => Response.ok(obj));
	}
	// public processUpdate
	static processUpdate(user, uriInfo, entityManager, serviceName, obj, microService) {
		return RequestFilter.getObject(user, uriInfo, entityManager, serviceName).then(oldObj => {
			const response = RequestFilter.checkObjectAccess(user, serviceName, obj);

			if (response != null) return Promise.resolve(response);

			return entityManager.update(serviceName, RequestFilter.parseQueryParameters(user, serviceName, uriInfo.query), obj).then(newObj => {
				const primaryKey = RequestFilter.notify(microService, newObj, serviceName, false);
				// force read, cases of triggers before break result value
				return entityManager.findOne(serviceName, primaryKey).then(_obj => Response.ok(_obj));
			});
		});
	}
	// public processDelete
	static processDelete(user, uriInfo, entityManager, serviceName, microService) {
		return RequestFilter.getObject(user, uriInfo, entityManager, serviceName).then(obj => {
			return entityManager.deleteOne(serviceName, RequestFilter.parseQueryParameters(user, serviceName, uriInfo.query)).then(objDeleted => {
				RequestFilter.notify(microService, objDeleted, serviceName, true);
				return Response.ok(objDeleted);
			});
		});
	}
	// private
	static parseQueryParameters(tokenData, serviceName, queryParameters) {
		let queryFields = {};
		const service = RequestFilter.getService (tokenData, serviceName);

		for (let [fieldName, field] of Object.entries(service.jsonFields)) {
			if (field.primaryKey == true) {
				const value = queryParameters[fieldName];

				if (value != undefined) {
					const type = field["type"];
					
					if (type == undefined || type == "s") {
						queryFields[fieldName] = value;
					} else if (type == "n" || type == "i") {
						queryFields[fieldName] = Number.parseInt(value);
					} else if (type == "b") {
						queryFields[fieldName] = (value == "true");
					}
				}
			}
		}
		// se não for admin, limita os resultados para as rufsGroup vinculadas a empresa do usuário
		const userRufsGroupOwner = tokenData.rufsGroupOwner;
		const rufsGroupOwnerEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroupOwner");
		const rufsGroupEntries = RequestFilter.getForeignKeyEntries(serviceName, "rufsGroup");

		if (userRufsGroupOwner > 1) {
			if (rufsGroupOwnerEntries.length > 0) queryFields[rufsGroupOwnerEntries[0].fieldName] = userRufsGroupOwner;
			if (rufsGroupEntries.length > 0) queryFields[rufsGroupEntries[0].fieldName] = tokenData.groups;
		}

		return queryFields;
   	}
	// public
	static processQuery(tokenData, uriInfo, entityManager, serviceName) {
		const fields = RequestFilter.parseQueryParameters(tokenData, serviceName, uriInfo.query);
		let orderBy = [];
		const service = RequestFilter.getService (tokenData, serviceName);

		for (let [fieldName, field] of Object.entries(service.jsonFields)) {
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
		let access = null;
		const serviceAuth = tokenData.roles[serviceName];
		// verfica a permissao de acesso
		if (serviceAuth != undefined) {
			const defaultAccess = {query: true, read: true, create: true, update: false, delete: false};

			if (serviceAuth[uriPath] != undefined) {
				access = serviceAuth[uriPath];
			} else {
				access = defaultAccess[uriPath];
			}
		}

		return access != null;
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

			const uriInfo = req;
			let obj = null;

			if (uriPath == "create" || uriPath == "update") {
				obj = req.body;
			}

			let cf;

			if (uriPath == "create") {
				cf = RequestFilter.processCreate(tokenData, entityManager, serviceName, obj, microService);
			} else if (uriPath == "update") {
				cf = RequestFilter.processUpdate(tokenData, uriInfo, entityManager, serviceName, obj, microService);
			} else if (uriPath == "delete") {
				cf = RequestFilter.processDelete(tokenData, uriInfo, entityManager, serviceName, microService);
			} else if (uriPath == "read") {
				cf = RequestFilter.processRead(tokenData, uriInfo, entityManager, serviceName, useDocument);
			} else if (uriPath == "query") {
				cf = RequestFilter.processQuery(tokenData, uriInfo, entityManager, serviceName);
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
			
			for (let [fieldName, field] of Object.entries(service.jsonFields)) {
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

	static updateRufsServices(entityManager) {
        return RequestFilter.loadTable(entityManager, "rufsService").then(rows => {
            RequestFilter.listService = rows;
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
