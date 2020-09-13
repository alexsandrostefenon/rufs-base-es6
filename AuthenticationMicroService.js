import jwt from "jsonwebtoken";
import {Filter} from "./webapp/es6/DataStore.js";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {Response} from "./server-utils.js";
import {RufsMicroService} from "./RufsMicroService.js";
import {RequestFilter} from "./RequestFilter.js";

class AuthenticationMicroService extends RufsMicroService {

	constructor(config) {
		super(config, "base");
	}
	// Load rufsGroupOwner, Services and Groups
    load(user) {
    	const getRolesMask = roles => {
    		const ret = {};

			for (let [schemaName, role] of Object.entries(roles)) {
				let mask = 0;
				if (role["get"] == undefined) mask |= 1 << 0;
				if (role["get"] == true)      mask |= 1 << 0;
				if (role["post"] == true)     mask |= 1 << 1;
				if (role["patch"] == true)    mask |= 1 << 2;
				if (role["put"] == true)      mask |= 1 << 3;
				if (role["delete"] == true)   mask |= 1 << 4;
				ret[schemaName] = mask;
			}

    		return ret;
    	}
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
			this.storeOpenApi(loginResponse.openapi, `openapi-${user.name}.json`);
        }
		// TODO : remove below header control size
		// header size limited to 8k
        const tokenPayload = {};
        tokenPayload.groups = [];
        // Add Groups
        {
			const userGroups = Filter.find(this.listGroupUser, {"rufsUser": user.id});
			for (let userGroup of userGroups) tokenPayload.groups.push(userGroup.rufsGroup);
        }
        tokenPayload.name = user.name;
        tokenPayload.password = user.password;
        tokenPayload.rufsGroupOwner = user.rufsGroupOwner;
        tokenPayload.roles = getRolesMask(roles);
		// TODO : fazer expirar no final do expediente diário
		loginResponse.tokenPayload = jwt.sign(tokenPayload, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
        return Promise.resolve(loginResponse);
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
			return this.load(user).
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
