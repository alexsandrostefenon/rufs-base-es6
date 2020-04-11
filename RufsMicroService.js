import fs from "fs";
import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {FileDbAdapter} from "./FileDbAdapter.js";

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
		if (field.type == "string" && field.length < 32) sqlType = "character";

		if (field.length == undefined) {
			if (field.type == "string") field.length = 255;
			if (field.type == "numeric") field.length = 9;
		}

		if (field.type == "numeric" && field.scale == undefined) field.scale = 3;

		let sqlLengthScale = "";

		if (field.length != undefined && field.scale != undefined) {
			sqlLengthScale = `(${field.length},{field.scale})`;
		} else if (field.length != undefined) {
			sqlLengthScale = `(${field.length})`;
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

	genSqlForeignKey(fieldName, field, mapTables) {
		let tableOut = CaseConvert.camelToUnderscore(field.foreignKeysImport.table);
		let fieldOut = CaseConvert.camelToUnderscore(field.foreignKeysImport.field);
		let str = "";
//		console.log(`RufsServiceDbSync.genSqlForeignKey(${fieldName}) : field.foreignKeysImport.table : ${field.foreignKeysImport.table}, mapTables[field.foreignKeysImport.table] : ${mapTables[field.foreignKeysImport.table]}`);
		const foreignSchema = mapTables.definitions[field.foreignKeysImport.table];

		if (tableOut != "rufs_group_owner" && foreignSchema != undefined && foreignSchema.rufsGroupOwner != undefined) {
			str = `FOREIGN KEY(rufs_group_owner,${fieldName}) REFERENCES ${tableOut}(rufs_group_owner, ${fieldOut})`;
		} else {
			str = `FOREIGN KEY(${CaseConvert.camelToUnderscore(fieldName)}) REFERENCES ${tableOut}(${fieldOut})`;
		}

		return str;
	}

	createTable(name, schema) {
		if (schema == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${schema}) : schema : Invalid Argument Exception`);
		if (typeof(schema) == "string") schema = JSON.parse(schema);
		const fields = schema.properties;
		if (fields == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${fields}) : fields : Invalid Argument Exception`);

		const genSql = mapTables => {
			let tableBody = "";
			for (let [fieldName, field] of Object.entries(fields)) tableBody = tableBody + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys
			for (let [fieldName, field] of Object.entries(fields)) if (field.foreignKeysImport != undefined) tableBody = tableBody + this.genSqlForeignKey(fieldName, field, mapTables) + ", ";
			// add unique keys
			let mapUniqueKey = new Map();

			for (let [fieldName, field] of Object.entries(fields)) {
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
			for (let [fieldName, field] of Object.entries(fields)) if (field.primaryKey == true) tableBody = tableBody + `${CaseConvert.camelToUnderscore(fieldName)}, `;
			tableBody = tableBody.substring(0, tableBody.length-2) + `)`;
			let tableName = CaseConvert.camelToUnderscore(name);
			const sql = `CREATE TABLE ${tableName} (${tableBody})`;
			console.log(`RufsServiceDbSync.createTable() : table ${name}, sql : \n${sql}\n`);
			return sql;
		};
		
		return this.entityManager.getOpenApi().then(mapTables => genSql(mapTables)).then(sql => this.entityManager.client.query(sql));
	}

	alterTable(name, newFields, oldFields) {
		if (newFields == undefined) throw new Error(`RequestFilter.alterTable(${name}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = JSON.parse(newFields);
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		
		const genSql = mapTables => {
			let sql = null;
			let tableBody = "";
			// fields to remove
			for (let fieldName in oldFields) if (newFields[fieldName] ==  undefined) tableBody = tableBody + `DROP COLUMN ${CaseConvert.camelToUnderscore(fieldName)}, `;
			// fields to add
			for (let [fieldName, field] of Object.entries(newFields)) if (oldFields[fieldName] ==  undefined) tableBody = tableBody + "ADD COLUMN " + this.genSqlColumnDescription(fieldName, field) + ", ";
			// add foreign keys for new fields or existent fields without foreign keys 
			for (let [fieldName, field] of Object.entries(newFields)) if ((field.foreignKeysImport != undefined) && (oldFields[fieldName] ==  undefined || oldFields[fieldName].foreignKeysImport ==  undefined)) tableBody = tableBody + "ADD " + this.genSqlForeignKey(fieldName, field, mapTables) + ", ";
			//
			if (tableBody.length > 0) {
				tableBody = tableBody.substring(0, tableBody.length-2);
				let tableName = CaseConvert.camelToUnderscore(name);
				sql = `ALTER TABLE ${tableName} ${tableBody}`;
			}

			console.log(`.alterTable() : table ${name}, sql : \n${sql}\n`, mapTables);
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
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
	}

	onRequest(req, res, next, resource, action) {
		return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
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

		return this.constructor.loadOpenApi().
		then(openapi => this.fileDbAdapter = new FileDbAdapter(openapi)).
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
				for (let name in RufsMicroService.tablesRufs) if (openapi.definitions[name] == undefined) tablesMissing.set(name, RufsMicroService.tablesRufs[name]);
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
						return this.constructor.storeOpenApi(openapi);
					}).
					then(() => migrate(openapi, list));
				};

				return this.constructor.loadOpenApi().
				then(openapi => {
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
				return this.constructor.loadOpenApi().
				then(openapi => {
					for (let name in RufsMicroService.tablesRufs) if (openApiDb.definitions[name] == undefined) openApiDb.definitions[name] = RufsMicroService.tablesRufs[name];

					for (let [name, schemaDb] of Object.entries(openApiDb.definitions)) {
						openapi.definitions[name] = this.constructor.updateJsonSchema(name, schemaDb, openapi.definitions[name]);
					}

					return this.constructor.storeOpenApi(openapi);
				});
			});
		}

		console.log(`[${this.constructor.name}] starting ${this.config.appName}...`);
		return this.entityManager.connect().
		then(() => createRufsTables()).
		then(() => syncDb2OpenApi()).
		then(openapi => {
			return Promise.resolve().
			then(() => RequestFilter.updateRufsServices(this.entityManager, openapi)).
			then(() => super.listen()).
			then(() => console.log(`[${this.constructor.name}] ... ${this.config.appName} started.`));
		});
	}

}

RufsMicroService.tablesRufs = {
	rufsGroupOwner: {
		properties: {
			id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
			name: {notNull: true, unique:true}
		}
	},
	rufsUser: {
		properties: {
			id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
			rufsGroupOwner: {type: "integer", notNull: true, foreignKeysImport: {table: "rufsGroupOwner", field: "id"}},
			name: {length: 32, notNull: true, unique:true},
			password: {notNull: true},
			roles: {length: 10240},
			routes: {length: 10240},
			path: {},
			menu: {length: 10240}
		}
	},
	rufsGroup: {
		properties: {
			id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
			name: {notNull: true, unique:true}
		}
	},
	rufsGroupUser: {
		properties: {
			rufsUser: {type: "integer", primaryKey: true, foreignKeysImport: {table: "rufsUser", field: "id"}},
			rufsGroup: {type: "integer", primaryKey: true, foreignKeysImport: {table: "rufsGroup", field: "id"}}
		}
	}
};

RufsMicroService.defaultGroupOwnerAdmin = {
//	id: 1,
	name: "ADMIN"
};

RufsMicroService.defaultUserAdmin = {
//	id: 1, 
	name: "admin", rufsGroupOwner: 1, password: "admin", path: "rufs_user/search",
	roles: '{"rufsGroupOwner":{"create":true,"update":true,"delete":true},"rufsUser":{"create":true,"update":true,"delete":true},"rufsGroup":{"create":true,"update":true,"delete":true},"rufsGroupUser":{"create":true,"update":true,"delete":true}}',
	routes: '[{"path": "/app/rufs_service/:action", "controller": "RufsServiceController"}, {"path": "/app/rufs_user/:action", "controller": "UserController"}]'
};

RufsMicroService.checkStandalone();

export {RufsMicroService};
