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
			const schemaOld = openapi.definitions[name];
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
				openapi.definitions[name] = this.constructor.updateJsonSchema(schemaChanged.name, schemaChanged, schemaOld);
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

	onRequest(req, res, next, resource, action) {
		return Promise.resolve().
		then(() => {
			let tokenPayload = RequestFilter.extractTokenPayload(req.get("Authorization"));
			let access = RequestFilter.checkAuthorization(tokenPayload, resource, action);
			let promise;

			if (access == true) {
				if (action == "update") {
					promise = this.update(req, res, next, resource, action);
				} else if (action == "delete") {
					promise = this.remove(req, res, next, resource, action);
				} else {
					promise = super.onRequest(req, res, next, resource, action);
				}
			} else {
				promise = Promise.resolve(Response.unauthorized("Explicit Unauthorized"));
			}

			return promise;
		}).
		catch(err => {
			console.error(err);
			return Response.unauthorized(err.msg);
		});
	}

}

RufsServiceMicroService.checkStandalone();

export {RufsServiceMicroService};
