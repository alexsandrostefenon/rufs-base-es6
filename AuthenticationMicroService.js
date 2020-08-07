import jwt from "jsonwebtoken";
import {Filter} from "./webapp/es6/DataStore.js";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {Response} from "./server-utils.js";
import {RufsMicroService} from "./RufsMicroService.js";
import {RequestFilter} from "./RequestFilter.js";
import fs from "fs";

class AuthenticationMicroService extends RufsMicroService {

	constructor(config) {
		super(config, "base");
	}
	// Load rufsGroupOwner, Services and Groups
    load(user, dbConnInfo) {
    	// TODO : adjusts user.menu and user.routes to starts with default "rufs" in addr
		let loginResponse = {};
		loginResponse.rufsGroupOwner = user.rufsGroupOwner;
		loginResponse.routes = user.routes;
		loginResponse.path = user.path;
		loginResponse.menu = user.menu;

		if (user.rufsGroupOwner) {
			const item = RequestFilter.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", user);
			const rufsGroupOwner = Filter.findOne(this.listGroupOwner, item.primaryKey);
			if (rufsGroupOwner != null) loginResponse.title = rufsGroupOwner.name + " - " + user.name;
		}

        // TODO : código temporário para caber o na tela do celular
        loginResponse.title = user.name;
        const roles = JSON.parse(user.roles);

        if (user.name == "admin") {
        	loginResponse.openapi = RequestFilter.dataStoreManager.openapi;
        } else {
			loginResponse.openapi = OpenApi.create({});
			OpenApi.copy(loginResponse.openapi, RequestFilter.dataStoreManager.openapi, roles);
			fs.writeFileSync(`openapi-${user.name}.json`, JSON.stringify(loginResponse.openapi, null, "\t"));
        }
		// TODO : remove below header control size
		// header size limited to 8k
        const authctoken = {};
        authctoken.groups = [];
        // Add Groups
        {
			const userGroups = Filter.find(this.listGroupUser, {"rufsUser": user.id});
			for (let userGroup of userGroups) authctoken.groups.push(userGroup.rufsGroup);
        }
        authctoken.dbConnInfo = dbConnInfo;
        authctoken.name = user.name;
        authctoken.rufsGroupOwner = user.rufsGroupOwner;
        authctoken.roles = roles;
		// TODO : fazer expirar no final do expediente diário
		loginResponse.authctoken = jwt.sign(authctoken, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
        return loginResponse;
    }

	processLogin(req) {
		// sleep one secound to prevent db/disk over access in network atack
		return new Promise(r => setTimeout(r, 1000)).
		then(() => this.loadRufsTables()).
		then(() => {
			let user = Filter.findOne(this.listUser, {"name": req.body.userId});

			if (!user || user.password != req.body.password)
				return Promise.resolve(Response.unauthorized("Don't match user and password."));

			user.ip = req.ip;
			return RequestFilter.getDbConn(req.body.dbUri, this.entityManager.limitQuery).
			then(dbConnInfo => this.load(user, dbConnInfo)).
			then(loginResponse => Response.ok(loginResponse));
		});
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

AuthenticationMicroService.checkStandalone();

export {AuthenticationMicroService};
