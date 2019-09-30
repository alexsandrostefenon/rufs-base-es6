import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {MicroServiceClient} from "./MicroServiceClient.js";

class DocumentMicroService extends MicroServiceServer {

	constructor(config) {
		if (config == undefined) config = {};
		config.appName = "document";
		super(config);
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
//		this.rufsClient = new MicroServiceClient({"user":"admin", "password":"admin"});
	}

	onRequest(req, res, next, resource, action) {
		const response = RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action, true);
		return response;
	}

	listen() {
		return this.entityManager.connect().
		then(() => {
			console.log(`starting updateRufsServices...`);
			return RequestFilter.updateRufsServices(this.entityManager).
			then(() => console.log(`...finished updateRufsServices...`)).
//			then(() => this.rufsClient.login()).
			then(() => super.listen());
		});
	}

}

DocumentMicroService.checkStandalone();

export {DocumentMicroService};
