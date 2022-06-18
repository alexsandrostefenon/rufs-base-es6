import fs from "fs";
import jwt from "jsonwebtoken";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {Response} from "./server-utils.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {DataStoreManager, Filter} from "./webapp/es6/DataStore.js";
import {DataStore} from "./webapp/es6/DataStore.js";
import {DbClientPostgres} from "./dbClientPostgres.js";

const fsPromises = fs.promises;

class DataStoreManagerDb extends DataStoreManager {

	constructor(listService, openapi, entityManager) {
		super(listService, openapi);
		this.entityManager = entityManager;
	}

	get(schemaName, primaryKey, ignoreCache) {
		return super.get(schemaName, primaryKey, ignoreCache).
		then(res => {
			if (res != null && res != undefined) return Promise.resolve(res);
			const service = this.getSchema(schemaName);
			if (service == null || service == undefined) return Promise.resolve(null);
			return this.entityManager.findOne(schemaName, primaryKey).then(data => service.cache(primaryKey, data));
		});
	}

}

class RequestFilter {
	constructor(req, microService) {
		this.microService = microService
		this.method = req.method.toLowerCase();

		if (this.method == "post" || this.method == "put" || this.method == "patch") {
			this.obj = req.body;
		}

		this.queryParams = req.query
		this.path = OpenApi.getPathParams(microService.openapi, req.path, this.queryParams)

		if (this.path == null) {
			return Promise.resolve(Response.badRequest(`[RufsMicroService.onRequest] : missing path for ${req.path}`))
		}

		this.serviceName = OpenApi.getSchemaName(this.microService.openapi, this.path, this.method, null)
		this.schemaResponse = OpenApi.getResponseSchema(this.microService.openapi, this.path, this.method)

		if (microService.fileDbAdapter.fileTables.has(this.serviceName) == true) {
			this.entityManager = microService.fileDbAdapter;
		} else {
			this.entityManager = microService.entityManager
		}

		this.tokenPayload = null
		this.useDocument = false
		this.service = this.entityManager.dataStoreManager.getSchema(this.serviceName, null)
	}
	// private to create,update,delete,read
	checkObjectAccess() {
		let response = null;
		const userRufsGroupOwner = this.entityManager.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", this.tokenPayload);
		const rufsGroupOwnerEntries = this.entityManager.dataStoreManager.getForeignKeyEntries(this.serviceName, "rufsGroupOwner");

		if (userRufsGroupOwner != undefined && userRufsGroupOwner.primaryKey.id > 1 && rufsGroupOwnerEntries.length > 0) {
			const objRufsGroupOwner = entityManager.dataStoreManager.getPrimaryKeyForeign(this.serviceName, "rufsGroupOwner", this.obj);

			if (objRufsGroupOwner == undefined) {
				obj.rufsGroupOwner = userRufsGroupOwner.primaryKey.id;
				objRufsGroupOwner = {primaryKey: {}};
				objRufsGroupOwner.primaryKey.id = userRufsGroupOwner.primaryKey.id;
			}

			if (objRufsGroupOwner.primaryKey.id == userRufsGroupOwner.primaryKey.id) {
				const rufsGroup = this.entityManager.dataStoreManager.getPrimaryKeyForeign(this.serviceName, "rufsGroup", this.obj);

				if (rufsGroup != undefined && this.tokenPayload.groups.indexOf(rufsGroup.primaryKey.id) < 0) {
					response = Response.unauthorized("unauthorized object rufsGroup");
				}
			} else {
				response = Response.unauthorized("unauthorized object rufsGroupOwner");
			}
		}

		return response;
	}
	// public
	processCreate() {
		const response = this.checkObjectAccess();

		if (response != null) Promise.resolve(response);

		return this.entityManager.insert(this.serviceName, this.obj).then(newObj => {
			const primaryKey = this.notify(newObj, false);
			// force read, cases of triggers before break result value
			return this.entityManager.findOne(this.serviceName, primaryKey).then(_obj => Response.ok(_obj));
		});
	}
	// public
	getObject() {
		const primaryKey = this.parseQueryParameters(true);
		return this.entityManager.findOne(this.serviceName, primaryKey).
		then(obj => {
			if (this.useDocument != true) return obj;
			return this.entityManager.dataStoreManager.getDocument(this.service, obj, true, this.tokenPayload);
		}).
		catch(error => {
			throw new Error(`[RequestFilter.getObject] for service ${serviceName}, fail to find object with primaryKey ${JSON.stringify(primaryKey)} : ` + error.message);
		});
	}
	// public processRead
	processRead() {
		return this.getObject().
		then(obj => {
			if (obj == null) {
				return Response.notFound("Don't found data with requested parameters.");
			}

			return Response.ok(obj);
		});
	}
	// public processUpdate
	processUpdate() {
		return this.getObject().then(oldObj => {
			const response = this.checkObjectAccess();

			if (response != null) return Promise.resolve(response);

			return this.entityManager.update(this.serviceName, this.parseQueryParameters(true), this.obj).then(newObj => {
				const primaryKey = this.notify(newObj, false);
				// force read, cases of triggers before break result value
				return this.entityManager.findOne(this.serviceName, primaryKey).
				then(_obj => {
					return Response.ok(_obj)
				});
			});
		});
	}
	// public processDelete
	processDelete() {
		return this.getObject().then(obj => {
			return this.entityManager.deleteOne(this.serviceName, this.parseQueryParameters(true)).then(objDeleted => {
				this.notify(objDeleted, true);
				return Response.ok(objDeleted);
			});
		});
	}
	// public
	processPatch() {
		const response = this.checkObjectAccess();

		if (response != null) Promise.resolve(response);

		const process = keys => {
			if (keys.length > 0) {
				return this.entityManager.findOne(this.serviceName, keys.pop()).catch(() => process(keys));
			} else {
				return Promise.resolve(null);
			}
		};

		return process(this.service.getKeys(this.obj)).then(foundObj => {
			if (foundObj != null) {
				return this.processUpdate();
			} else {
				return this.processCreate();
			}
		});
	}
	// private
	parseQueryParameters(onlyPrimaryKey) {
		// se não for admin, limita os resultados para as rufsGroup vinculadas a empresa do usuário
		const userRufsGroupOwner = this.tokenPayload.rufsGroupOwner;
		const rufsGroupOwnerEntries = this.entityManager.dataStoreManager.getForeignKeyEntries(this.serviceName, "rufsGroupOwner");
		const rufsGroupEntries = this.entityManager.dataStoreManager.getForeignKeyEntries(this.serviceName, "rufsGroup");

		if (userRufsGroupOwner > 1) {
			if (rufsGroupOwnerEntries.length > 0) this.queryParams[rufsGroupOwnerEntries[0].fieldName] = userRufsGroupOwner;
			if (rufsGroupEntries.length > 0) this.queryParams[rufsGroupEntries[0].fieldName] = this.tokenPayload.groups;
		}

		const obj = OpenApi.copyFields(this.service, this.queryParams);
		let ret;

		if (onlyPrimaryKey == true)
			ret = this.service.getPrimaryKey(obj);
		else
			ret = obj;

		if (this.queryParams.filter != undefined) ret.filter = OpenApi.copyFields(this.service, this.queryParams.filter);
		if (this.queryParams.filterRangeMin != undefined) ret.filterRangeMin = OpenApi.copyFields(this.service, this.queryParams.filterRangeMin);
		if (this.queryParams.filterRangeMax != undefined) ret.filterRangeMax = OpenApi.copyFields(this.service, this.queryParams.filterRangeMax);
		return ret;
	}
	// public
	processQuery() {
		const fields = Object.entries(this.queryParams).length > 0 ? this.parseQueryParameters() : null;
		let orderBy = [];

		for (let fieldName of this.service.primaryKeys) {
			const field = this.service.properties[fieldName];
			const type = field.type;

			if (type != undefined) {
				if (type == "integer" || type.includes("date") || type.includes("time")) {
					orderBy.push(fieldName + " desc");
				}
			}
		}

		return this.entityManager.find(this.serviceName, fields, orderBy).then(results =>
			Response.ok(results)
		);
	}
	// public
	checkAuthorization(req) {
		const extractTokenPayload = tokenRaw => {
			let tokenPayload;
	
			if (tokenRaw != undefined) {
				try {
					const token = tokenRaw
					tokenPayload = jwt.verify(token, process.env.JWT_SECRET || "123456");
				} catch (err) {
					throw new Error("JWT Authorization fail : " + err);
				}
			} else {
				throw new Error("Authorization token header invalid");
			}
	
			return tokenPayload;
		}

		for (const securityItem of this.microService.openapi.security) {
			for (const securityName in securityItem) {
				const securityScheme = this.microService.openapi.components.securitySchemes[securityName]

				if (securityScheme != null) {
					if (securityScheme.type == "http" && securityScheme.scheme == "bearer" && securityScheme.bearerFormat == "JWT") {
						const authorizationHeaderPrefix = "Bearer ";
						let tokenRaw = req.get("Authorization")

						if (tokenRaw != null && tokenRaw.startsWith(authorizationHeaderPrefix)) {
							tokenRaw = tokenRaw.substring(authorizationHeaderPrefix.length)

							try {
								this.tokenPayload = extractTokenPayload(tokenRaw);
							} catch (err) {
								return false;
							}
						}
					} else if (securityScheme.type == "apiKey") {
						if (securityScheme.in == "header") {
							const tokenRaw = req.get(securityScheme.name)

							if (tokenRaw != null && tokenRaw.length >= 0) {
								const user = this.microService.fileDbAdapter.findOneSync("rufsUser", {"password": tokenRaw});
								if (user == null) return false
								this.tokenPayload = user
							}
						}
					}
				}
			}
		}

		if (this.tokenPayload == null) {
			return false;
		}

		let access = false;
		const role = this.tokenPayload.roles.find(role => role.path == this.path)
		// verfica a permissao de acesso
		if (role != undefined) {
			const idx = OpenApi.methods.indexOf(this.method);

			if (idx >= 0 && (role.mask & (1 << idx)) != 0) {
				access = true
			}
		}

		return access;
	}
	// processRequest
	processRequest() {
		let cf;

		if (this.method == "get" && this.schemaResponse != null && this.schemaResponse.type == "array") {
			cf = this.processQuery();
		} else if (this.method == "post") {
			cf = this.processCreate();
		} else if (this.method == "put") {
			cf = this.processUpdate();
		} else if (this.method == "patch") {
			cf = this.processPatch();
		} else if (this.method == "delete") {
			cf = this.processDelete();
		} else if (this.method == "get") {
			cf = this.processRead();
		} else {
			return Promise.resolve(Response.internalServerError("unknow rote"));
		}

		return cf.catch(error => {
			console.log("ProcessRequest error : ", error);
			return Response.internalServerError(error.message);
		});
	}
	// This method sends the same Bidding object to all opened sessions
	notify(obj, isRemove) {
		const primaryKey = this.service.getPrimaryKey(obj);
		var msg = {};
		msg.service = this.serviceName;
		msg.primaryKey = primaryKey;

		if (isRemove == false) {
			msg.action = "notify";
		} else {
			msg.action = "delete";
		}

		let str = JSON.stringify(msg);
		const objRufsGroupOwner = this.microService.entityManager.dataStoreManager.getPrimaryKeyForeign(this.serviceName, "rufsGroupOwner", obj);
		const rufsGroup = this.microService.entityManager.dataStoreManager.getPrimaryKeyForeign(this.serviceName, "rufsGroup", obj);
		console.log("[RequestFilter.notify] broadcasting...", msg);

		for (let [userName, wsServerConnection] of this.microService.wsServerConnections) {
			let tokenPayload = wsServerConnection.token;
			const userRufsGroupOwner = this.microService.entityManager.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", tokenPayload);
			// enviar somente para os clients de "rufsGroupOwner"
			let checkRufsGroupOwner = objRufsGroupOwner == undefined || objRufsGroupOwner.primaryKey.id == userRufsGroupOwner.primaryKey.id;
			let checkRufsGroup = rufsGroup == undefined || tokenPayload.groups.indexOf(rufsGroup.primaryKey.id) >= 0;
			// restrição de rufsGroup
			if (userRufsGroupOwner.primaryKey.id == 1 || (checkRufsGroupOwner && checkRufsGroup)) {
				const role = tokenPayload.roles.find(item => item.path == this.path)

				if (role != null && (role.mask & 1) != 0) {
					Promise.resolve().then(() => {
						console.log("[RequestFilter.notify] send to client", tokenPayload.name);
						wsServerConnection.sendUTF(str)
					});
				}
			}
		}

		return primaryKey;
	}

	static updateRufsServices(entityManager, openapi) {
        return Promise.resolve().then(() => {
        	console.log(`RequestFilter.updateRufsServices() : reseting entityManager.dataStoreManager`);
			const listDataStore = [];
			// TODO : trocar openapi.components.schemas por openapi.paths
        	for (let name in openapi.components.schemas) {
        		listDataStore.push(new DataStore(name, openapi.components.schemas[name]));
        	}

        	entityManager.dataStoreManager = new DataStoreManagerDb(listDataStore, openapi, entityManager);
        });
	}
}

export {RequestFilter}
