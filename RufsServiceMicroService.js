import {OpenApi} from "./webapp/es6/OpenApi.js";
import {Response} from "./server-utils.js";
import {RufsMicroService} from "./RufsMicroService.js";
import {RequestFilter} from "./RequestFilter.js";

class RufsServiceMicroService extends RufsMicroService {

	constructor(config) {
		super(config, "rufs_service");
	}

	update(req, res, next, resource, action) {
		const name = req.query.name;
		return this.loadOpenApi().
		then(openapi => {
			const schemaOld = openapi.components.schemas[name];
			const schema = req.body;
			console.log(`.update : [${name}] :\nold properties :\n`, schemaOld.properties, "\nnew properties :\n", schema.properties);
			let promise;

			if (schemaOld.properties == undefined) {
				if (schema.properties != undefined)
					promise = this.rufsServiceDbSync.createTable(schema.name, schema).then(resSqlCreate => schema);
				else
					promise = Promise.resolve(schema);
			} else {
				if (schema.properties == undefined) schema.properties = "{}";
				promise =  this.rufsServiceDbSync.alterTable(schema.name, schema.properties, schemaOld.properties).then(resSqlAlter => schema);
			}
			
			promise.then(schemaChanged => {
				openapi.components.schemas[name] = OpenApi.mergeSchemas(schemaChanged.name, schemaChanged, schemaOld);
				return this.storeOpenApi(openapi);
			});
		}).
		catch(err => {
			console.log("ProcessRequest error : ", err);
			return Response.internalServerError(err.message);
		});
	}

	remove(req, res, next, resource, action) {
		return this.entityManager.findOne("rufsService", {name: req.query.name}).
		then(schemaOld => {
			console.log(`.remove : [${schemaOld.name}] : old properties`);
			return this.rufsServiceDbSync.dropTable(schemaOld.name).then(resSqlDrop => schemaOld);
		}).
		then(schemaChanged => {
			return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
		}).
		catch(err => {
			console.log("ProcessRequest error : ", err);
			return Response.internalServerError(err.message);
		});
	}

	processLogin(req) {
		let access = RequestFilter.checkAuthorization(req, resource, action);
		let promise;

		if (access == true) {
			if (req.method == "PUT") {
				promise = this.update(req, res, next, resource, action);
			} else if (req.method == "DELETE") {
				promise = this.remove(req, res, next, resource, action);
			} else {
				promise = super.onRequest(req, res, next, resource, action);
			}
		} else {
			promise = Promise.resolve(Response.unauthorized("Explicit Unauthorized"));
		}

		return promise;
    }
	// return a promise
	onRequest(req, res, next, resource, action) {
		if (resource == "login") {
			return this.processLogin(req);
		} else {
			return super.onRequest(req, res, next, resource, action);
		}
	}

}

RufsServiceMicroService.checkStandalone();

export {RufsServiceMicroService};
