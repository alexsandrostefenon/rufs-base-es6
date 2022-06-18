import fs from "fs";
import jwt from "jsonwebtoken";
import Qs from "qs";
import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {Filter} from "./webapp/es6/DataStore.js";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {HttpRestRequest} from "./webapp/es6/ServerConnection.js";
import {FileDbAdapter} from "./FileDbAdapter.js";
import {Response} from "./server-utils.js";

const fsPromises = fs.promises;

class RufsServiceDbSync {

	constructor(entityManager) {
		this.entityManager = entityManager;
	}

	genSqlColumnDescription(fieldName, field) {
		if (field.type == undefined) {
			if (field.identityGeneration != undefined) field.type = "integer"; else field.type = "string";
		}

		let pos = this.entityManager.rufsTypes.indexOf(field.type);
        if (pos < 0) throw new Error(`DbClientPostgres.genSqlColumnDescription() : field ${fieldName} : unknow type : ${field.type}`);
		let sqlType = this.entityManager.sqlTypes[pos];
		if (field.type == "string" && field.maxLength < 32) sqlType = "character";

		if (field.maxLength == undefined) {
			if (field.type == "string") field.maxLength = 255;
			if (field.type == "number") field.maxLength = 9;
		}

		if (field.type == "number" && field.scale == undefined) field.scale = 3;

		let sqlLengthScale = "";

		if (field.maxLength != undefined && field.scale != undefined) {
			sqlLengthScale = `(${field.maxLength},{field.scale})`;
		} else if (field.maxLength != undefined) {
			sqlLengthScale = `(${field.maxLength})`;
		}

		let sqlDefault = "";
//		if (field.identityGeneration != undefined) sqlDefault = `GENERATED ${field.identityGeneration} AS IDENTITY`;
		if (field.identityGeneration != undefined) sqlType = `SERIAL`;

		if (field.default != undefined) {
			if (field.type == "string") sqlDefault = ` DEFAULT '${field.default}'`; else sqlDefault = " DEFAULT " + field.default;
		}

		let sqlNotNull = field.nullable != true ? "NOT NULL" : "";
		return `${CaseConvert.camelToUnderscore(fieldName)} ${sqlType}${sqlLengthScale} ${sqlDefault} ${sqlNotNull}`;
	}
	// TODO : refatorar função genSqlForeignKey(fieldName, field) para genSqlForeignKey(tableName)
	genSqlForeignKey(fieldName, field) {
		const ret = [];
		const $ref = OpenApi.getSchemaNameFromRef(field.$ref);
		const tableOut = CaseConvert.camelToUnderscore($ref);
		const str = `FOREIGN KEY(${CaseConvert.camelToUnderscore(fieldName)}) REFERENCES ${tableOut}`;
		ret.push(str);
		return ret.join(",");
	}

	createTable(name, schema) {
		if (schema == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${schema}) : schema : Invalid Argument Exception`);
		if (typeof(schema) == "string") schema = JSON.parse(schema);

		if (schema.properties == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${schema.properties}) : schema.properties : Invalid Argument Exception`);

		const genSql = () => {
			let tableBody = "";
			for (let [fieldName, field] of Object.entries(schema.properties)) tableBody = tableBody + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys
			for (let [fieldName, field] of Object.entries(schema.properties)) if (field.$ref != undefined) tableBody = tableBody + this.genSqlForeignKey(fieldName, field) + ", ";
			// add unique keys
			let mapUniqueKey = new Map();

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.unique != undefined) {
					if (mapUniqueKey.has(field.unique) == false) mapUniqueKey.set(field.unique, []);
					mapUniqueKey.get(field.unique).push(fieldName);
				}
			}

			for (let [uniqueKey, listField] of Object.entries(mapUniqueKey)) {
				tableBody = tableBody + `UNIQUE(`;
				for (fieldName of listField) tableBody = tableBody + `${CaseConvert.camelToUnderscore(fieldName)}, `;
				tableBody = tableBody.substring(0, tableBody.length-2) + `)`;
			}
			// add primary key
			tableBody = tableBody + `PRIMARY KEY(`;
			for (let fieldName of schema.primaryKeys) tableBody = tableBody + `${CaseConvert.camelToUnderscore(fieldName)}, `;
			tableBody = tableBody.substring(0, tableBody.length-2) + `)`;
			let tableName = CaseConvert.camelToUnderscore(name);
			const sql = `CREATE TABLE ${tableName} (${tableBody})`;
			console.log(`RufsServiceDbSync.createTable() : table ${name}, sql : \n${sql}\n`);
			return sql;
		};
		
		return this.entityManager.updateOpenApi(this.entityManager.openapi).then(() => genSql()).then(sql => this.entityManager.client.query(sql));
	}

	alterTable(name, newFields, oldFields) {
		if (newFields == undefined) throw new Error(`RufsServiceDbSync.alterTable(${name}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = JSON.parse(newFields);
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		
		const genSql = () => {
			let sql = null;
			let tableBody = "";
			// fields to remove
			for (let fieldName in oldFields) if (newFields[fieldName] ==  undefined) tableBody = tableBody + `DROP COLUMN ${CaseConvert.camelToUnderscore(fieldName)}, `;
			// fields to add
			for (let [fieldName, field] of Object.entries(newFields)) if (oldFields[fieldName] ==  undefined) tableBody = tableBody + "ADD COLUMN " + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys for new fields or existent fields without foreign keys 
			for (let [fieldName, field] of Object.entries(newFields)) if ((field.$ref != undefined) && (oldFields[fieldName] ==  undefined || oldFields[fieldName].$ref ==  undefined)) tableBody = tableBody + "ADD " + this.genSqlForeignKey(fieldName, field) + ", ";
			//
			if (tableBody.length > 0) {
				tableBody = tableBody.substring(0, tableBody.length-2);
				let tableName = CaseConvert.camelToUnderscore(name);
				sql = `ALTER TABLE ${tableName} ${tableBody}`;
			}

			console.log(`.alterTable() : table ${name}, sql : \n${sql}\n`);
			return sql;
		};
		
		return this.entityManager.updateOpenApi(this.entityManager.openapi).
		then(() => genSql()).
		then(sql => {
			if (sql != null) {
				return this.entityManager.client.query(sql).catch(err => {
					console.error(`RufsServiceDbSync.alterTable(${name}) : error :\n${err.message}\nsql:\n${sql}`);
					throw err;
				});
			}
		});
	}

	dropTable(name) {
		let tableName = CaseConvert.camelToUnderscore(name);
		const sql = `DROP TABLE ${tableName}`;
		console.log(`.dropTable() : table ${name}, sql : \n${sql}\n`);
		return this.entityManager.client.query(sql);
	}

}

class RufsMicroService extends MicroServiceServer {

	constructor(config, appName, checkRufsTables) {
		if (config == undefined) config = {};
		config.appName = appName || "base";
		super(config);
		this.config.checkRufsTables = checkRufsTables || false;
		this.config.migrationPath = config.migrationPath || MicroServiceServer.getArg("migration-path", `./rufs-${config.appName}-es6/sql`);
		this.entityManager = new DbClientPostgres(this.config.dbConfig, {missingPrimaryKeys: this.config.dbMissingPrimaryKeys, missingForeignKeys: this.config.dbMissingForeignKeys, aliasMap: this.config.aliasMap});
	}

	authenticateUser(userName, userPassword, remoteAddr) {
		// sleep one secound to prevent db/disk over access in network atack
		return new Promise(r => setTimeout(r, 1000)).
		then(() => {
			if (this.fileDbAdapter.fileTables.has("rufsUser")) {
				return this.fileDbAdapter.findOne("rufsUser", {"name": userName})
			} else {
				return this.entityManager.findOne("rufsUser", {"name": userName})
			}
		}).
		then(user => {
			if (!user || user.password != userPassword) {
				throw "Don't match user and password."
			}

			const loginResponse = {};
			loginResponse.title = "";
			loginResponse.id = user.id
			loginResponse.name = user.name
			loginResponse.rufsGroupOwner = user.rufsGroupOwner;
			loginResponse.roles = user.roles;
			loginResponse.routes = user.routes;
			loginResponse.path = user.path;
			loginResponse.menu = user.menu;
			loginResponse.groups = [];

			if (loginResponse.rufsGroupOwner) {
				const item = this.entityManager.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", user);
				let promise;

				if (this.fileDbAdapter.fileTables.has("rufsGroupOwner")) {
					promise = this.fileDbAdapter.findOne("rufsGroupOwner", item.primaryKey)
				} else {
					promise = this.entityManager.findOne("rufsGroupOwner", item.primaryKey)
				}

				return promise.then(rufsGroupOwner => {
					if (rufsGroupOwner != null) loginResponse.title = rufsGroupOwner.name + " - " + userName;
					return loginResponse
				})
			} else {
				return Promise.resolve(loginResponse)
			}
		}).
		then(loginResponse => {
			let promise;

			if (this.fileDbAdapter.fileTables.has("rufsGroupUser")) {
				promise = this.fileDbAdapter.find("rufsGroupUser", {"rufsUser": loginResponse.id})
			} else {
				promise = this.entityManager.find("rufsGroupUser", {"rufsUser": loginResponse.id})
			}

			return promise.then(list => {
				list.forEach(item => loginResponse.groups.push(item.rufsGroup));
				return loginResponse
			})
		}).
		then(loginResponse => {
			// TODO : fazer expirar no final do expediente diário
			loginResponse.tokenPayload = {id: loginResponse.id, name: loginResponse.name, rufsGroupOwner: loginResponse.rufsGroupOwner, groups: loginResponse.groups, roles: loginResponse.roles, ip: remoteAddr}
			return loginResponse
		});
    }
	// return a promise
	onRequest(req, res, next) {
		if (req.path == "/login") {
			const userName = req.body.user;
			return this.authenticateUser(userName, req.body.password, req.ip).then(loginResponse => {
				if (userName == "admin") {
					loginResponse.openapi = this.entityManager.dataStoreManager.openapi;
				} else {
					//loginResponse.openapi = OpenApi.create({});
					//OpenApi.copy(loginResponse.openapi, this.entityManager.dataStoreManager.openapi, loginResponse.roles);
					loginResponse.openapi = OpenApi.convertRufsToStandart(this.entityManager.dataStoreManager.openapi)
				}
				// warning tokenPayload is http.header size limited to 8k
				loginResponse.JwtHeader = jwt.sign(loginResponse.tokenPayload, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
				return Response.ok(loginResponse)
			}).
			catch(msg => Response.unauthorized(msg));
		} else {
			try {
				const rf = new RequestFilter(req, this)
				const isAuthorized = rf.checkAuthorization(req)

				if (isAuthorized != true) {
					return Promise.resolve(Response.unauthorized("Explicit Unauthorized"))
				}

				return rf.processRequest();
			} catch (error) {
				return Promise.resolve(Response.badRequest(error))
			}
		}
	}

	loadFileTables() {
		const loadTable = (name, defaultRows) => this.entityManager.find(name).catch(() => this.fileDbAdapter.load(name, defaultRows))
		const promise = this.openapi == null ? this.loadOpenApi() : Promise.resolve()
		return promise.
		then(() => {
			this.fileDbAdapter = new FileDbAdapter(this.openapi);
			return RequestFilter.updateRufsServices(this.fileDbAdapter, this.openapi);
		}).
		then(() => loadTable("rufsGroup", [])).
		then(() => loadTable("rufsGroupUser", [])).
		then(() => loadTable("rufsGroupOwner", [RufsMicroService.defaultGroupOwnerAdmin])).
		then(() => loadTable("rufsUser", [RufsMicroService.defaultUserAdmin]))
	}

	listen() {
		const openApiRufs = OpenApi.convertStandartToRufs(JSON.parse(RufsMicroService.openApiRufs));

		const createRufsTables = () => {
			if (this.config.checkRufsTables != true) {
				return Promise.resolve()
			}

			let tablesMissing = new Map();

			for (let [name, schema] of Object.entries(openApiRufs.components.schemas)) {
				if (this.openapi.components.schemas[name] == undefined) {
					tablesMissing.set(name, schema)
				}
			}

			const rufsServiceDbSync = new RufsServiceDbSync(this.entityManager);

			const createTable = iterator => {
				let it = iterator.next();
				if (it.done == true) return Promise.resolve();
				let [name, schema] = it.value;
				console.log(`${this.constructor.name}.listen().createRufsTables().createTable(${name})`);
				return rufsServiceDbSync.createTable(name, schema).then(() => createTable(iterator));
			};

			return createTable(tablesMissing.entries()).
			then(() => this.entityManager.findOne("rufsGroupOwner", {name: "ADMIN"}).catch(() => this.entityManager.insert("rufsGroupOwner", RufsMicroService.defaultGroupOwnerAdmin))).
			then(() => this.entityManager.findOne("rufsUser", {name: "admin"}).catch(() => this.entityManager.insert("rufsUser", RufsMicroService.defaultUserAdmin)))
		}

		const execMigrations = () => {
			if (fs.existsSync(this.config.migrationPath) == false) {
				return Promise.resolve();
			}

			const regExp1 = /^(?<v1>\d{1,3})\.(?<v2>\d{1,3})\.(?<v3>\d{1,3})/;
			const regExp2 = /^(?<v1>\d{3})(?<v2>\d{3})(?<v3>\d{3})/;

			const getVersion = name => {
				const regExpResult = regExp1.exec(name);
				if (regExpResult == null) return 0;
				return Number.parseInt(regExpResult.groups.v1.padStart(3, "0") + regExpResult.groups.v2.padStart(3, "0") + regExpResult.groups.v3.padStart(3, "0"));
			};

			const migrate = (list) => {
				if (list.length == 0) {
					return Promise.resolve()
				}

				const fileName = list.shift();
				return fsPromises.readFile(`${this.config.migrationPath}/${fileName}`, "utf8").
				then(text => {
					const execSql = list => {
						if (list.length == 0) return Promise.resolve();
						const sql = list.shift();
						return this.entityManager.client.query(sql).
						catch(err => {
							console.error(`[${this.constructor.name}.listen.execMigrations.migrate(${fileName}).execSql] :\n${sql}\n${err.message}`);
							throw err;
						}).
						then(() => execSql(list));
					};

					const list = text.split("--split");
					return execSql(list);
				}).
				then(() => {
					let newVersion = getVersion(fileName);
					const regExpResult = regExp2.exec(newVersion.toString().padStart(9, "0"));
					this.openapi.info.version = `${Number.parseInt(regExpResult.groups.v1)}.${Number.parseInt(regExpResult.groups.v2)}.${Number.parseInt(regExpResult.groups.v3)}`;
				}).
				then(() => migrate(list));
			};

			const oldVersion = getVersion(this.openapi.info.version);
			return fsPromises.readdir(`${this.config.migrationPath}`).
			then(list => list.filter(fileName => getVersion(fileName) > oldVersion)).
			then(list => list.sort((a, b) => getVersion(a) - getVersion(b))).
			then(list => {
				if (list.length > 0) {
					return migrate(list).
					then(() => {
						return this.entityManager.updateOpenApi(this.openapi, {requestBodyContentType: this.config.requestBodyContentType})
					}).
					then(() => {
						return this.storeOpenApi()
					})
				}
			})
		}

		console.log(`[${this.constructor.name}] starting ${this.config.appName}...`);
		const promise = this.openapi == null ? this.loadOpenApi() : Promise.resolve()
		return promise.
		then(() => this.entityManager.connect()).
		then(() => this.entityManager.updateOpenApi(this.openapi, {requestBodyContentType: this.config.requestBodyContentType})).
		then(() => createRufsTables()).
		then(() => OpenApi.fillOpenApi(this.openapi, {schemas: openApiRufs.components.schemas, requestBodyContentType: this.config.requestBodyContentType, security: [{"jwt": []}]})).
		then(() => execMigrations()).
		then(() => this.loadFileTables()).
		then(() => {
			return RequestFilter.updateRufsServices(this.entityManager, this.openapi)
		}).
		then(() => super.listen()).
		then(() => console.log(`[${this.constructor.name}] ... ${this.config.appName} started.`));
	}
}

RufsMicroService.schemaProperties = `{
	"x-required":{"type": "boolean", "x-orderIndex": 1, "x-sortType": "asc"},
	"nullable":{"type": "boolean", "x-orderIndex": 2, "x-sortType": "asc"},
	"type":{"options": ["string", "integer", "boolean", "number", "date-time", "date", "time"]},
	"properties":{"type": "object", "properties": {}},
	"items":{"type": "object", "properties": {}},
	"maxLength":{"type": "integer"},
	"format":{},
	"pattern":{},
	"enum": {},
	"x-$ref":{},
	"x-enumLabels": {},
	"default":{},
	"example":{},
	"description":{}
}`

RufsMicroService.openApiRufs = `{
	"components": {
		"schemas": {
			"rufsGroupOwner": {
				"properties": {
					"id":   {"type": "integer", "x-identityGeneration": "BY DEFAULT"},
					"name": {"nullable": false, "unique": true}
				},
				"x-primaryKeys": ["id"]
			},
			"rufsUser": {
				"properties": {
					"id":             {"type": "integer", "x-identityGeneration": "BY DEFAULT"},
					"rufsGroupOwner": {"type": "integer", "nullable": false, "x-$ref": "#/components/schemas/rufsGroupOwner"},
					"name":           {"maxLength": 32, "nullable": false, "unique": true},
					"password":       {"nullable": false},
					"path":           {},
					"roles":          {"type": "array", "items": {"properties": {"name": {"type": "string"}, "mask": {"type": "integer"}}}},
					"routes":         {"type": "array", "items": {"properties": {"path": {"type": "string"}, "controller": {"type": "string"}, "templateUrl": {"type": "string"}}}},
					"menu":           {"type": "object", "properties": {"menu": {"type": "string"}, "label": {"type": "string"}, "path": {"type": "string"}}}
				},
				"x-primaryKeys": ["id"],
				"x-uniqueKeys":  {}
			},
			"rufsGroup": {
				"properties": {
					"id":   {"type": "integer", "x-identityGeneration": "BY DEFAULT"},
					"name": {"nullable": false, "unique": true}
				},
				"x-primaryKeys": ["id"]
			},
			"rufsGroupUser": {
				"properties": {
					"rufsUser":  {"type": "integer", "nullable": false, "x-$ref": "#/components/schemas/rufsUser"},
					"rufsGroup": {"type": "integer", "nullable": false, "x-$ref": "#/components/schemas/rufsGroup"}
				},
				"x-primaryKeys": ["rufsUser", "rufsGroup"],
				"x-uniqueKeys":  {}
			},
			"rufsService": {
				"properties": {
					"operationId": {},
					"path":        {},
					"method":      {},
					"parameter":   {"type": "object", "properties": ` + RufsMicroService.schemaProperties + `},
					"requestBody": {"type": "object", "properties": ` + RufsMicroService.schemaProperties + `},
					"response":    {"type": "object", "properties": ` + RufsMicroService.schemaProperties + `}
				},
				"x-primaryKeys": ["operationId"],
				"x-uniqueKeys": {}
			}
		}
	}
}
`

RufsMicroService.defaultGroupOwnerAdmin = {
//	id: 1,
	name: "ADMIN"
};

RufsMicroService.defaultUserAdmin = {
//	"id": 1,
	"name": "admin",
	"rufsGroupOwner": 1,
	"password": "21232f297a57a5a743894a0e4a801fc3",
	"path": "rufs_user/search",
	"menu": {},
	"roles": [
		{
			"mask": 31,
			"path": "/rufs_group_owner"
		},
		{
			"mask": 31,
			"path": "/rufs_user"
		},
		{
			"mask": 31,
			"path": "/rufs_group"
		},
		{
			"mask": 31,
			"path": "/rufs_group_user",
		}
	],
	"routes": [
		{
			"controller": "OpenApiOperationObjectController",
			"path": "/app/rufs_service/:action"
		},
		{
			"controller": "UserController",
			"path": "/app/rufs_user/:action"
		}
	]
};

RufsMicroService.checkStandalone();

export {RufsMicroService};
