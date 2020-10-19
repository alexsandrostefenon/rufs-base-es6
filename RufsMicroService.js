import fs from "fs";
import jwt from "jsonwebtoken";
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

		let sqlNotNull = field.notNull == true ? "NOT NULL" : "";  
		return `${CaseConvert.camelToUnderscore(fieldName)} ${sqlType}${sqlLengthScale} ${sqlDefault} ${sqlNotNull}`;
	}
	// TODO : refatorar função genSqlForeignKey(fieldName, field, openapi) para genSqlForeignKey(tableName, openapi)
	genSqlForeignKey(fieldName, field, openapi) {
		const ret = [];
		const $ref = OpenApi.getSchemaName($ref);
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
		this.entityManager = new DbClientPostgres(this.config.dbConfig, this.config.dbMissingPrimaryKeys);
	}

	authenticateUser(userName, userPassword, loginResponse) {
		// sleep one secound to prevent db/disk over access in network atack
		return new Promise(r => setTimeout(r, 1000)).
		then(() => this.loadRufsTables()).
		then(() => {
			let user = Filter.findOne(this.listUser, {"name": userName});

			if (!user || user.password != userPassword)
				throw "Don't match user and password.";

			// TODO : adjusts user.menu and user.routes to starts with default "rufs" in addr
			loginResponse.rufsGroupOwner = user.rufsGroupOwner;
			loginResponse.routes = user.routes;
			loginResponse.path = user.path;
			loginResponse.menu = user.menu;

			if (loginResponse.rufsGroupOwner) {
				const item = RequestFilter.dataStoreManager.getPrimaryKeyForeign("rufsUser", "rufsGroupOwner", user);
				const rufsGroupOwner = Filter.findOne(this.listGroupOwner, item.primaryKey);
				if (rufsGroupOwner != null) loginResponse.title = rufsGroupOwner.name + " - " + userName;
			}

			Filter.find(this.listGroupUser, {"rufsUser": user.id}).forEach(item => loginResponse.tokenPayload.groups.push(item.rufsGroup));
			// TODO : código temporário para caber o na tela do celular
			loginResponse.title = userName;
			return JSON.parse(user.roles);
		});
    }
	// return a promise
	onRequest(req, res, next, resource, action) {
		if (resource == "login") {
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

			const userName = req.body.userId;
			const loginResponse = {"title": "", "rufsGroupOwner": null, "routes": null, "path": "", "menu": null, "openapi": {}};
			loginResponse.tokenPayload = {"name": userName, "rufsGroupOwner": null, "groups": [], "roles": {}, "ip": req.ip};
			return this.authenticateUser(userName, req.body.password, loginResponse).
			catch(msg => Response.unauthorized(msg)).
			then(roles => {
				if (userName == "admin") {
					loginResponse.openapi = RequestFilter.dataStoreManager.openapi;
				} else {
					loginResponse.openapi = OpenApi.create({});
					OpenApi.copy(loginResponse.openapi, RequestFilter.dataStoreManager.openapi, roles);
					this.storeOpenApi(loginResponse.openapi, `openapi-${userName}.json`);
				}

				loginResponse.tokenPayload.roles = getRolesMask(roles);
				// TODO : fazer expirar no final do expediente diário
				loginResponse.tokenPayload.rufsGroupOwner = loginResponse.rufsGroupOwner;
				// warning tokenPayload is http.header size limited to 8k
				loginResponse.tokenPayload = jwt.sign(loginResponse.tokenPayload, process.env.JWT_SECRET || "123456", {expiresIn: 24 * 60 * 60 /*secounds*/});
			}).
			then(() => Response.ok(loginResponse));
		} else {
			let access = RequestFilter.checkAuthorization(req, resource, action);
			if (access != true) return Promise.resolve(Response.unauthorized("Explicit Unauthorized"));
			if (resource == "rufsService" && req.method == "GET" && action == "query") return Promise.resolve(Response.ok(OpenApi.getList(this.openapi, req.tokenPayload.roles)));
			return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
		}
	}

	loadRufsTables() {
		const loadTable = (name, defaultRows) => {
			return this.entityManager.
			find(name).
			catch(() => {
				console.log(`[${this.constructor.name}.loadRufsTables.loadTable(${name})] : loading fileDbAdapter data.`);
				return this.fileDbAdapter.load(name).
				then(rows => rows.length == 0 && defaultRows && defaultRows.length > 0 ? this.fileDbAdapter.store(name, defaultRows) : rows).catch(() => this.fileDbAdapter.store(name, defaultRows));
			});
		}

		return this.loadOpenApi().
		then(openapi => this.fileDbAdapter = new FileDbAdapter(openapi)).
		then(() => loadTable("rufsService", [])).
//		then(rows => this.listRufsService= rows).
		then(() => loadTable("rufsGroup", [])).
		then(rows => this.listGroup= rows).
		then(() => loadTable("rufsGroupUser", [])).
		then(rows => this.listGroupUser = rows).
		then(() => loadTable("rufsGroupOwner", [RufsMicroService.defaultGroupOwnerAdmin])).
		then(rows => this.listGroupOwner = rows).
		then(() => loadTable("rufsUser", [RufsMicroService.defaultUserAdmin])).
		then(rows => this.listUser = rows);
	}

	expressEndPoint(req, res, next) {
		let promise;

		if (this.fileDbAdapter == undefined) {
			promise = this.loadRufsTables();
		} else {
			promise = Promise.resolve();
		}

		return promise.then(() => super.expressEndPoint(req, res, next));
	}

	listen() {
		const createRufsTables = () => {
			if (this.config.checkRufsTables != true)
				return Promise.resolve();

			return this.entityManager.getOpenApi().
			then(openapi => {
				let tablesMissing = new Map();
				for (let name in RufsMicroService.openApiRufs.components.schemas) if (openapi.components.schemas[name] == undefined) tablesMissing.set(name, RufsMicroService.openApiRufs.components.schemas[name]);
				const rufsServiceDbSync = new RufsServiceDbSync(this.entityManager);

				const createTable = iterator => {
					let it = iterator.next();
					if (it.done == true) return Promise.resolve();
					let [name, schema] = it.value;
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

				const regExp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})/;

				const getVersion = name => {
					const groups = regExp.exec(name);

					if (groups == null)
						return 0;

					return BigInt(groups[1]) * 1000n * 1000n + BigInt(groups[2]) * 1000n + BigInt(groups[3]);
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
						const v3 = newVersion % 1000n;
						newVersion /= 1000n;
						const v2 = newVersion % 1000n;
						newVersion /= 1000n;
						openapi.info.version = `${newVersion}.${v2}.${v3}`;
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
			then(() => this.entityManager.getOpenApi()).
			then(openApiDb => {
				return this.loadOpenApi().
				then(openapi => {
					console.log(`[${this.constructor.name}.syncDb2OpenApi()] openapi after execMigrations`);

					for (let name in RufsMicroService.openApiRufs.components.schemas) {
						if (openApiDb.components.schemas[name] == undefined) {
							openApiDb.components.schemas[name] = RufsMicroService.openApiRufs.components.schemas[name];
						}
					}

					for (let [name, schemaDb] of Object.entries(openApiDb.components.schemas)) {
						openApiDb.components.schemas[name] = OpenApi.mergeSchemas(name, schemaDb, openapi.components.schemas[name]);
					}

					OpenApi.fillOpenApi(openApiDb, {requestBodyContentType: this.config.requestBodyContentType});
//					OpenApi.merge(openapi, openApiDb);

					for (let name in openApiDb.components.schemas) {
						if (openapi.components.schemas[name] == undefined) {
							openapi.components.schemas[name] = openApiDb.components.schemas[name];
							openapi.paths["/" + name] = openApiDb.paths["/" + name];
							openapi.components.parameters[name] = openApiDb.components.parameters[name];
							openapi.components.requestBodies[name] = openApiDb.components.requestBodies[name];
							openapi.components.responses[name] = openApiDb.components.responses[name];
						}
					}

					return this.storeOpenApi(openapi);
				});
			});
		}

		console.log(`[${this.constructor.name}] starting ${this.config.appName}...`);
		return this.entityManager.connect().
		then(() => createRufsTables()).
		then(() => syncDb2OpenApi()).
		then(openapi => {
			console.log(`[${this.constructor.name}.listen()] openapi after syncDb2OpenApi`);
			return Promise.resolve().
			then(() => {
				return RequestFilter.updateRufsServices(this.entityManager, openapi);
			}).
			then(() => super.listen()).
			then(() => console.log(`[${this.constructor.name}] ... ${this.config.appName} started.`));
		});
	}

}

RufsMicroService.openApiRufs = {
	components: {
		schemas: {
			rufsGroupOwner: {
				properties: {
					id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
					name: {notNull: true, unique:true}
				},
				"primaryKeys": ["id"]
			},
			rufsUser: {
				properties: {
					id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
					rufsGroupOwner: {type: "integer", notNull: true, $ref: "#/components/schemas/rufsGroupOwner"},
					name: {maxLength: 32, notNull: true, unique:true},
					password: {notNull: true},
					roles: {maxLength: 10240},
					routes: {maxLength: 10240},
					path: {},
					menu: {maxLength: 10240}
				},
				"primaryKeys": ["id"],
				"uniqueKeys": {}
			},
			rufsGroup: {
				properties: {
					id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
					name: {notNull: true, unique:true}
				},
				"primaryKeys": ["id"]
			},
			rufsGroupUser: {
				properties: {
					rufsUser: {type: "integer", primaryKey: true, notNull: true, $ref: "#/components/schemas/rufsUser"},
					rufsGroup: {type: "integer", primaryKey: true, notNull: true, $ref: "#/components/schemas/rufsGroup"}
				},
				"primaryKeys": ["rufsUser", "rufsGroup"],
				"uniqueKeys": {}
			},
			rufsService: {
				properties: {
					operationId: {primaryKey: true},
					path: {},
					method: {},
					parameter: {maxLength: 10240},
					requestBody: {maxLength: 10240},
					response: {maxLength: 10240}
				},
				"primaryKeys": ["operationId"],
				"uniqueKeys": {}
			}
		}
	}
};

RufsMicroService.defaultGroupOwnerAdmin = {
//	id: 1,
	name: "ADMIN"
};

RufsMicroService.defaultUserAdmin = {
//	id: 1, 
	name: "admin", rufsGroupOwner: 1, password: HttpRestRequest.MD5("admin"), path: "rufs_user/search",
	roles: '{"rufsGroupOwner":{"post":true,"put":true,"delete":true},"rufsUser":{"post":true,"put":true,"delete":true},"rufsGroup":{"post":true,"put":true,"delete":true},"rufsGroupUser":{"post":true,"put":true,"delete":true}}',
	routes: '[{"path": "/app/rufs_service/:action", "controller": "RufsServiceController"}, {"path": "/app/rufs_user/:action", "controller": "UserController"}]'
};

RufsMicroService.checkStandalone();

export {RufsMicroService};
