import {RufsMicroService} from "./RufsMicroService.js";
import {RequestFilter} from "./RequestFilter.js";

class RufsServiceMicroService extends RufsMicroService {

	constructor(config) {
		super(config, "rufs_service");
	}

	update(req, res, next, resource, action) {
		const name = req.query.name;
		return this.constructor.loadOpenApi().
		then(openapi => {
			const objOld = openapi.definitions[name];
			const obj = req.body;
			console.log(`.update : [${name}] :\nold fields :\n`, objOld.fields, "\nnew fields :\n", obj.fields);
			let promise;

			if (objOld.fields == undefined) {
				if (obj.fields != undefined)
					promise = this.rufsServiceDbSync.createTable(obj.name, obj.fields).then(resSqlCreate => obj);
				else
					promise = Promise.resolve(obj);
			} else {
				if (obj.fields == undefined) obj.fields = "{}";
				promise =  this.rufsServiceDbSync.alterTable(obj.name, obj.fields, objOld.fields).then(resSqlAlter => obj);
			}
			
			promise.then(objChanged => {
				openapi.definitions[name] = this.constructor.updateJsonSchema(objChanged.name, objChanged, objOld);
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
		then(objOld => {
			console.log(`.remove : [${objOld.name}] : old fields`);
			return this.rufsServiceDbSync.dropTable(objOld.name).then(resSqlDrop => objOld);
		}).
		then(objChanged => {
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
