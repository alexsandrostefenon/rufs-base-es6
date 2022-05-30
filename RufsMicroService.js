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
	// TODO : refatorar função genSqlForeignKey(fieldName, field, openapi) para genSqlForeignKey(tableName, openapi)
	genSqlForeignKey(fieldName, field, openapi) {
		const ret = [];
		const $ref = OpenApi.getSchemaName(field.$ref);
		const tableOut = CaseConvert.camelToUnderscore($ref);
		const str = `FOREIGN KEY(${CaseConvert.camelToUnderscore(fieldName)}) REFERENCES ${tableOut}`;
		ret.push(str);
		return ret.join(",");
	}

	createTable(name, schema) {
		if (schema == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${schema}) : schema : Invalid Argument Exception`);
		if (typeof(schema) == "string") schema = JSON.parse(schema);

		if (schema.properties == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${schema.properties}) : schema.properties : Invalid Argument Exception`);

		const genSql = openapi => {
			let tableBody = "";
			for (let [fieldName, field] of Object.entries(schema.properties)) tableBody = tableBody + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys
			for (let [fieldName, field] of Object.entries(schema.properties)) if (field.$ref != undefined) tableBody = tableBody + this.genSqlForeignKey(fieldName, field, openapi) + ", ";
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
		
		return this.entityManager.getOpenApi().then(openapi => genSql(openapi)).then(sql => this.entityManager.client.query(sql));
	}

	alterTable(name, newFields, oldFields) {
		if (newFields == undefined) throw new Error(`RequestFilter.alterTable(${name}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = JSON.parse(newFields);
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		
		const genSql = openapi => {
			let sql = null;
			let tableBody = "";
			// fields to remove
			for (let fieldName in oldFields) if (newFields[fieldName] ==  undefined) tableBody = tableBody + `DROP COLUMN ${CaseConvert.camelToUnderscore(fieldName)}, `;
			// fields to add
			for (let [fieldName, field] of Object.entries(newFields)) if (oldFields[fieldName] ==  undefined) tableBody = tableBody + "ADD COLUMN " + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys for new fields or existent fields without foreign keys 
			for (let [fieldName, field] of Object.entries(newFields)) if ((field.$ref != undefined) && (oldFields[fieldName] ==  undefined || oldFields[fieldName].$ref ==  undefined)) tableBody = tableBody + "ADD " + this.genSqlForeignKey(fieldName, field, openapi) + ", ";
			//
			if (tableBody.length > 0) {
				tableBody = tableBody.substring(0, tableBody.length-2);
				let tableName = CaseConvert.camelToUnderscore(name);
				sql = `ALTER TABLE ${tableName} ${tableBody}`;
			}

			console.log(`.alterTable() : table ${name}, sql : \n${sql}\n`, openapi);
			return sql;
		};
		
		return this.entityManager.getOpenApi().
		then(openApi => genSql(openApi)).
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
			const user = Filter.findOne(this.listUser, {"name": userName})

			if (!user || user.password != userPassword) {
				throw "Don't match user and password."
			}

			const loginResponse = {};
			loginResponse.title = "";
			loginResponse.rufsGroupOwner = user.rufsGroupOwner;
			loginResponse.roles = user.roles;
			loginResponse.routes = user.routes;
			loginResponse.path = user.path;
			loginResponse.menu = user.menu;
			loginResponse.groups = [];

			if (loginResponse.rufsGroupOwner) {
				const item = this.entityManager.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", user);
				const rufsGroupOwner = Filter.findOne(this.listGroupOwner, item.primaryKey);
				if (rufsGroupOwner != null) loginResponse.title = rufsGroupOwner.name + " - " + userName;
			}

			Filter.find(this.listGroupUser, {"rufsUser": user.id}).forEach(item => loginResponse.groups.push(item.rufsGroup));
			// TODO : fazer expirar no final do expediente diário
			loginResponse.tokenPayload = {id: user.id, name: user.name, rufsGroupOwner: user.rufsGroupOwner, groups: loginResponse.groups, roles: loginResponse.roles, ip: remoteAddr}
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
					loginResponse.openapi = this.entityManager.dataStoreManager.openapi;
				}
				// warning tokenPayload is http.header size limited to 8k
				loginResponse.JwtHeader = jwt.sign(loginResponse.tokenPayload, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
				return Response.ok(loginResponse)
			}).
			catch(msg => Response.unauthorized(msg));
		} else {
			let access = RequestFilter.checkAuthorization(this, req);
			if (access != true) return Promise.resolve(Response.unauthorized("Explicit Unauthorized"));

			if (req.path == "/rufs_service" && req.method == "GET") {
				const list = OpenApi.getList(Qs, OpenApi.convertRufsToStandart(this.openapi, true), true, req.tokenPayload.roles);
				return Promise.resolve(Response.ok(list));
			}

			const serviceName = CaseConvert.underscoreToCamel(req.path.substring(1))
			let entityManager = this.entityManager

			if (this.fileDbAdapter.fileTables.has(serviceName) == true) {
				entityManager = this.fileDbAdapter;
			}
	
			let obj = null;
	
			if (req.method == "POST" || req.method == "PUT" || req.method == "PATCH") {
				obj = req.body;
			}
	
			const rf = new RequestFilter(req.path, req.method.toLowerCase(), req.query, req.tokenPayload, obj, entityManager, this, false)
			return rf.processRequest();
		}
	}

	loadRufsTables() {
		const loadTable = (name, defaultRows) => this.entityManager.find(name).catch(() => this.fileDbAdapter.load(name, defaultRows))
		return this.loadOpenApi().
		then(openapi => {
			this.fileDbAdapter = new FileDbAdapter(openapi);
			return RequestFilter.updateRufsServices(this.fileDbAdapter, openapi);
		}).
		then(() => loadTable("rufsService", [])).
//		then(rows => this.listRufsService= rows).
		then(() => loadTable("rufsGroup", [])).
		then(rows => this.listGroup = rows).
		then(() => loadTable("rufsGroupUser", [])).
		then(rows => this.listGroupUser = rows).
		then(() => loadTable("rufsGroupOwner", [RufsMicroService.defaultGroupOwnerAdmin])).
		then(rows => this.listGroupOwner = rows).
		then(() => loadTable("rufsUser", [RufsMicroService.defaultUserAdmin])).
		then(rows => this.listUser = rows);
	}

	listen() {
		const openApiRufs = OpenApi.convertStandartToRufs(JSON.parse(RufsMicroService.openApiRufs));

		const createRufsTables = () => {
			if (this.config.checkRufsTables != true)
				return Promise.resolve();

			return this.entityManager.getOpenApi().
			then(openapi => {
				let tablesMissing = new Map();

				for (let [name, schema] of Object.entries(openApiRufs.components.schemas)) {
					if (openapi.components.schemas[name] == undefined) {
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

				return createTable(tablesMissing.entries());
			}).
			then(() => {
				return Promise.resolve().
				then(() => this.entityManager.findOne("rufsGroupOwner", {name: "ADMIN"}).catch(() => this.entityManager.insert("rufsGroupOwner", RufsMicroService.defaultGroupOwnerAdmin))).
				then(() => this.entityManager.findOne("rufsUser", {name: "admin"}).catch(() => this.entityManager.insert("rufsUser", RufsMicroService.defaultUserAdmin))).
				then(() => Promise.resolve());
			});
		}

		const syncDb2OpenApi = () => {
			const execMigrations = () => {
				if (fs.existsSync(this.config.migrationPath) == false)
					return Promise.resolve();

				const regExp1 = /^(?<v1>\d{1,3})\.(?<v2>\d{1,3})\.(?<v3>\d{1,3})/;
				const regExp2 = /^(?<v1>\d{3})(?<v2>\d{3})(?<v3>\d{3})/;

				const getVersion = name => {
					const regExpResult = regExp1.exec(name);
					if (regExpResult == null) return 0;
					return Number.parseInt(regExpResult.groups.v1.padStart(3, "0") + regExpResult.groups.v2.padStart(3, "0") + regExpResult.groups.v3.padStart(3, "0"));
				};

				const migrate = (openapi, list) => {
					if (list.length == 0)
						return Promise.resolve(openapi);

					const fileName = list.shift();
					return fsPromises.readFile(`${this.config.migrationPath}/${fileName}`, "utf8").
					then(text => {
						const execSql = list => {
							if (list.length == 0) return Promise.resolve();
							const sql = list.shift();
							return this.entityManager.client.query(sql).
							catch(err => {
								console.error(`[${this.constructor.name}.listen.syncDb2OpenApi.execMigrations.migrate(${fileName}).execSql] :\n${sql}\n${err.message}`);
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
						openapi.info.version = `${Number.parseInt(regExpResult.groups.v1)}.${Number.parseInt(regExpResult.groups.v2)}.${Number.parseInt(regExpResult.groups.v3)}`;
						return this.storeOpenApi(openapi);
					}).
					then(() => migrate(openapi, list));
				};

				return this.loadOpenApi().
				then(openapi => {
					console.log(`[${this.constructor.name}.syncDb2OpenApi()] openapi in execMigrations`);
					const oldVersion = getVersion(openapi.info.version);
					return fsPromises.readdir(`${this.config.migrationPath}`).
					then(list => list.filter(fileName => getVersion(fileName) > oldVersion)).
					then(list => list.sort((a, b) => getVersion(a) - getVersion(b))).
					then(list => migrate(openapi, list));
				});
			};

			return execMigrations().
			then(() => this.entityManager.getOpenApi({}, {requestBodyContentType: this.config.requestBodyContentType})).
			then(openApiDb => {
				return this.loadOpenApi().
				then(openapi => {
					console.log(`[${this.constructor.name}.syncDb2OpenApi()] openapi after execMigrations`);
					OpenApi.fillOpenApi(openApiDb, {schemas: openApiRufs.components.schemas, requestBodyContentType: this.config.requestBodyContentType});
/*
					for (let name in openApiRufs.components.schemas) {
						if (openApiDb.components.schemas[name] == undefined) {
							openApiDb.components.schemas[name] = openApiRufs.components.schemas[name];
						}
					}
*/
					for (let [name, schemaDb] of Object.entries(openApiDb.components.schemas)) {
						openApiDb.components.schemas[name] = OpenApi.mergeSchemas(openapi.components.schemas[name], schemaDb, false, name);
					}

//					OpenApi.fillOpenApi(openApiDb, {requestBodyContentType: this.config.requestBodyContentType});
//					OpenApi.merge(openapi, openApiDb);

					for (let name in openApiDb.components.schemas) {
						if (openapi.components.schemas[name] == undefined) {
							if (openApiDb.components.schemas[name] != null) openapi.components.schemas[name] = openApiDb.components.schemas[name];
							if (openApiDb.paths["/" + name] != null) openapi.paths["/" + name] = openApiDb.paths["/" + name];
							if (openapi.components.parameters == null) openapi.components.parameters = {}
							if (openApiDb.components.parameters[name] != null) openapi.components.parameters[name] = openApiDb.components.parameters[name];
							if (openApiDb.components.requestBodies[name] != null) openapi.components.requestBodies[name] = openApiDb.components.requestBodies[name];
							if (openapi.components.responses == null) openapi.components.responses = {}
							if (openApiDb.components.responses[name] != null) openapi.components.responses[name] = openApiDb.components.responses[name];
						}
					}

					return this.storeOpenApi(openapi);
				}).
				then(openapi => this.openapi = openapi);
			});
		}

		console.log(`[${this.constructor.name}] starting ${this.config.appName}...`);
		return this.entityManager.connect().
		then(() => createRufsTables()).
		then(() => syncDb2OpenApi()).
		then(openapi => {
			console.log(`[${this.constructor.name}.listen()] openapi after syncDb2OpenApi`);
			return Promise.resolve().
			then(() => this.loadRufsTables()).
			then(() => {
				return RequestFilter.updateRufsServices(this.entityManager, openapi);
			}).
			then(() => super.listen()).
			then(() => console.log(`[${this.constructor.name}] ... ${this.config.appName} started.`));
		});
	}

	loadOpenApi(fileName) {
		return super.loadOpenApi(fileName).then(openapi => {
			const openApiRufs = OpenApi.convertStandartToRufs(JSON.parse(RufsMicroService.openApiRufs))
			OpenApi.fillOpenApi(openapi, {schemas: openApiRufs.components.schemas, requestBodyContentType: this.config.requestBodyContentType});
			return openapi
		});
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
