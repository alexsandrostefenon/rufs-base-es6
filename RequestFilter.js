import fs from "fs";
import jwt from "jsonwebtoken";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {Response} from "./server-utils.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {DataStoreManager, Filter} from "./webapp/es6/DataStore.js";
import {DataStore} from "./webapp/es6/DataStore.js";
import {DbClientPostgres} from "./dbClientPostgres.js";
import { RufsMicroService } from "./RufsMicroService.js";

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
	/**
	 * 
	 * @param {*} req 
	 * @param {RufsMicroService} microService 
	 */
	constructor(req, microService) {
		this.microService = microService
		/** @type {string} */
		this.method = req.method.toLowerCase()
		this.objIn = req.body
		this.parameters = req.query
		/** @type {string} */
		 this.path = OpenApi.getPathParams(microService.openapi, req.path, this.parameters)

		if (this.path == null) {
			throw new Error(`[RufsMicroService.onRequest] : missing path for ${req.path}`); 
		}
		/** @type {string} */
		 this.schemaName = OpenApi.getSchemaName(this.microService.openapi, this.path, this.method)

		if (microService.fileDbAdapter.fileTables.has(this.schemaName) == true) {
			this.entityManager = microService.fileDbAdapter;
		} else {
			this.entityManager = microService.entityManager
		}
	}
	// private to create,update,delete,read
	checkObjectAccess(obj) {
		let response = null;
		const userRufsGroupOwner = OpenApi.getPrimaryKeyForeign(this.microService.openapi, "rufsUser", "rufsGroupOwner", this.tokenPayload);
		const rufsGroupOwnerEntries = OpenApi.getPropertiesWithRef(this.microService.openapi, this.schemaName, "rufsGroupOwner");

		if (userRufsGroupOwner != undefined && userRufsGroupOwner.primaryKey.id > 1 && rufsGroupOwnerEntries.length > 0) {
			const objRufsGroupOwner = OpenApi.getPrimaryKeyForeign(this.microService.openapi, this.schemaName, "rufsGroupOwner", obj);

			if (objRufsGroupOwner == undefined) {
				obj.rufsGroupOwner = userRufsGroupOwner.primaryKey.id;
				objRufsGroupOwner = {primaryKey: {}};
				objRufsGroupOwner.primaryKey.id = userRufsGroupOwner.primaryKey.id;
			}

			if (objRufsGroupOwner.primaryKey.id == userRufsGroupOwner.primaryKey.id) {
				const rufsGroup = OpenApi.getPrimaryKeyForeign(this.microService.openapi, this.schemaName, "rufsGroup", obj);

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

		return this.entityManager.insert(this.schemaName, this.objIn).then(newObj => {
			this.notify(newObj, false);
			return Response.ok(newObj)
		});
	}
	// public
	getObject(useDocument) {
		const primaryKey = this.parseQueryParameters(true);
		return this.entityManager.findOne(this.schemaName, primaryKey).
		then(obj => {
			if (this.useDocument != true) return obj;
			//return this.entityManager.dataStoreManager.getDocument(this.service, obj, true, this.tokenPayload);
		}).
		catch(error => {
			throw new Error(`[RequestFilter.getObject] for service ${this.schemaName}, fail to find object with primaryKey ${JSON.stringify(primaryKey)} : ` + error.message);
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

			return this.entityManager.update(this.schemaName, this.parseQueryParameters(true), this.objIn).then(newObj => {
				this.notify(newObj, false);
				return Response.ok(newObj)
			});
		});
	}
	// public processDelete
	processDelete() {
		return this.getObject().then(obj => {
			return this.entityManager.deleteOne(this.schemaName, this.parseQueryParameters(true)).then(objDeleted => {
				this.notify(objDeleted, true);
				return Response.ok({});
			});
		});
	}
	// public
	processPatch() {
		const response = this.checkObjectAccess();

		if (response != null) Promise.resolve(response);

		const process = keys => {
			if (keys.length > 0) {
				return this.entityManager.findOne(this.schemaName, keys.pop()).catch(() => process(keys));
			} else {
				return Promise.resolve(null);
			}
		};
/*
		return process(this.service.getKeys(this.objIn)).then(foundObj => {
			if (foundObj != null) {
				return this.processUpdate();
			} else {
				return this.processCreate();
			}
		});
*/
	}
	// private
	parseQueryParameters(onlyPrimaryKey) {
		// se não for admin, limita os resultados para as rufsGroup vinculadas a empresa do usuário
		const userRufsGroupOwner = this.tokenPayload.rufsGroupOwner;
		const rufsGroupOwnerEntries = OpenApi.getPropertiesWithRef(this.microService.openapi, this.schemaName, "rufsGroupOwner");
		const rufsGroupEntries = OpenApi.getPropertiesWithRef(this.microService.openapi, this.schemaName, "rufsGroup");

		if (userRufsGroupOwner > 1) {
			if (rufsGroupOwnerEntries.length > 0) this.parameters[rufsGroupOwnerEntries[0].fieldName] = userRufsGroupOwner;
			if (rufsGroupEntries.length > 0) this.parameters[rufsGroupEntries[0].fieldName] = this.tokenPayload.groups;
		}

		const schema = OpenApi.getSchemaFromParameters(this.microService.openapi, this.path, this.method)
		const obj = OpenApi.copyFields(schema, this.parameters);
		let ret;

		if (onlyPrimaryKey == true) {
			ret = obj
			//ret = this.service.getPrimaryKey(obj);
		} else {
			ret = obj;
		}

		if (this.parameters.filter != undefined) ret.filter = OpenApi.copyFields(schema, this.parameters.filter);
		if (this.parameters.filterRangeMin != undefined) ret.filterRangeMin = OpenApi.copyFields(schema, this.parameters.filterRangeMin);
		if (this.parameters.filterRangeMax != undefined) ret.filterRangeMax = OpenApi.copyFields(schema, this.parameters.filterRangeMax);
		return ret;
	}
	// public
	processQuery() {
		const schema = OpenApi.getSchemaFromParameters(this.microService.openapi, this.path, this.method)
		const fields = Object.entries(this.parameters).length > 0 ? this.parseQueryParameters() : null;
		let orderBy = [];

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			if (field.type != undefined) {
				if (field.type == "integer" || field.type.includes("date") || field.type.includes("time")) {
					orderBy.push(fieldName + " desc");
				}
			}
		}

		return this.entityManager.find(this.schemaName, fields, orderBy).then(results =>
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
		const schemaResponse = OpenApi.getSchema(this.microService.openapi, this.path, this.method, "responseObject")

		if (this.method == "get" && schemaResponse != null && schemaResponse.type == "array") {
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
		const msg = {service: this.schemaName, action: "notify", primaryKey: this.parameters};

		if (isRemove) {
			msg.action = "delete";
		}

		let str = JSON.stringify(msg);
		const objRufsGroupOwner = OpenApi.getPrimaryKeyForeign(this.microService.openapi, this.schemaName, "rufsGroupOwner", obj);
		const rufsGroup = OpenApi.getPrimaryKeyForeign(this.microService.openapi, this.schemaName, "rufsGroup", obj);
		console.log("[RequestFilter.notify] broadcasting...", msg);

		for (let [userName, wsServerConnection] of this.microService.wsServerConnections) {
			let tokenPayload = wsServerConnection.token;
			const userRufsGroupOwner = OpenApi.getPrimaryKeyForeign(this.microService.openapi, "rufsUser", "rufsGroupOwner", tokenPayload);
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
	}

	static updateRufsServices(entityManager, openapi) {
        return Promise.resolve().then(() => {
        	console.log(`RequestFilter.updateRufsServices() : reseting microService.openapi`);
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
