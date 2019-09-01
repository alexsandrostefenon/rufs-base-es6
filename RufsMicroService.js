import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";
import {MicroServiceServer} from "./MicroServiceServer.js";

class RufsMicroService extends MicroServiceServer {

	constructor(config) {
		if (config == undefined) config = {};
		config.appName = "rufs";
		super(config);
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
	}

	onRequest(req, res, next, resource, action) {
		return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
	}

	listen() {
		return this.entityManager.connect().
		then(() => {
			console.log(`starting updateRufsServices...`);
			return RequestFilter.updateRufsServices(this.entityManager).
			then(() => console.log(`...finished updateRufsServices...`)).
			then(() => super.listen());
		});
	}

}

RufsMicroService.checkStandalone();

export {RufsMicroService};
