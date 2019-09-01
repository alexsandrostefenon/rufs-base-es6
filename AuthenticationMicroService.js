import jwt from "jsonwebtoken";
import {Filter} from "./webapp/es6/DataStore.js";
import {DbClientPostgres} from "./dbClientPostgres.js";
import {Response} from "./server-utils.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {RequestFilter} from "./RequestFilter.js";

class AuthenticationMicroService extends MicroServiceServer {
	constructor(config) {
		if (config == undefined) config = {};
		config.appName = "authc";
		super(config);
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
		this.listUser = [];
	}
	// Load rufsGroupOwner, Services and Groups
    static load(user, dbConnInfo) {
    	// TODO : adjusts user.menu and user.routes to starts with default "rufs" in addr
		let loginResponse = {};
		loginResponse.user = user;
		const foreignKey = RequestFilter.getForeignKey("rufsUser", "rufsGroupOwner", user);
        const rufsGroupOwner = Filter.findOne(RequestFilter.listGroupOwner, foreignKey);
        if (rufsGroupOwner != null) loginResponse.title = rufsGroupOwner.name + " - " + user.name;
        let authctoken = {};
        // TODO : código temporário para caber o na tela do celular
        loginResponse.title = user.name;
        loginResponse.roles = JSON.parse(user.roles);
        loginResponse.rufsServices = [];
        authctoken.groups = [];

        for (let serviceName of Object.keys(loginResponse.roles)) {
        	let service = Filter.findOne(RequestFilter.listService, {"name": serviceName});
			loginResponse.rufsServices.push(service);
        }
        // Add Groups
        const userGroups = Filter.find(RequestFilter.listGroupUser, {"rufsUser": user.id});
        for (let userGroup of userGroups) authctoken.groups.push(userGroup.rufsGroup);
        authctoken.dbConnInfo = dbConnInfo;
        authctoken.name = user.name;
        authctoken.rufsGroupOwner = user.rufsGroupOwner;
        authctoken.roles = loginResponse.roles;
		// TODO : fazer expirar no final do expediente diário
		loginResponse.user.authctoken = jwt.sign(authctoken, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
        return loginResponse;
    }
	// return a promise
	onRequest(req, res, next, resource, action) {
		let promise = super.onRequest(req, res, next, resource, action);//Promise.reject(Response.unauthorized("Unknow Route"));

		if (resource == "login") {
			let user = Filter.findOne(this.listUser, {"name": req.body.userId});

			if (user != undefined && user.password == req.body.password) {
				user.ip = req.ip;
				promise = RequestFilter.getDbConn(req.body.dbUri).
				then(dbConnInfo => AuthenticationMicroService.load(user, dbConnInfo)).
				then(loginResponse => Response.ok(loginResponse));
			} else {
				promise = Promise.resolve(Response.unauthorized("Don't match user and password."));
			}
		}
		
		return promise;
	}

	listen() {
		return this.entityManager.connect().
		then(() => RequestFilter.updateRufsServices(this.entityManager)).
        then(() => RequestFilter.loadTable(this.entityManager, "rufsUser")).
        then(rows => this.listUser = rows).
		then(() => super.listen());
	}
}

AuthenticationMicroService.checkStandalone();

export {AuthenticationMicroService};
