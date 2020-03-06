import fs from "fs";
import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";

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
		if (tableOut != "rufs_group_owner" && mapTables.get(field.foreignKeysImport.table).rufsGroupOwner != undefined) {
			str = `FOREIGN KEY(rufs_group_owner,${fieldName}) REFERENCES ${tableOut}(rufs_group_owner, ${fieldOut})`;
		} else {
			str = `FOREIGN KEY(${CaseConvert.camelToUnderscore(fieldName)}) REFERENCES ${tableOut}(${fieldOut})`;
		}

		return str;
	}

	createTable(name, fields) {
		if (fields == undefined) throw new Error(`DbClientPostgres.createTable(${name}, ${fields}) : fields : Invalid Argument Exception`);
		if (typeof(fields) == "string") fields = JSON.parse(fields);

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
		
		return this.entityManager.getTablesInfo().then(mapTables => genSql(mapTables)).then(sql => this.entityManager.client.query(sql));
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
		
		return this.entityManager.getTablesInfo().
		then(mapTables => genSql(mapTables)).
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

let tablesRufs = {
	rufsGroupOwner: {
		id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
		name: {notNull: true, unique:true}
	},
	rufsUser: {
		id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
		rufsGroupOwner: {type: "integer", notNull: true, foreignKeysImport: {table: "rufsGroupOwner", field: "id"}},
		name: {length: 32, notNull: true, unique:true},
		password: {notNull: true},
		roles: {length: 10240},
		routes: {length: 10240},
		path: {},
		menu: {length: 10240},
		showSystemMenu: {type: "boolean", defaultValue: false},
		authctoken: {}
	},
	rufsGroup: {
		id: {type: "integer", identityGeneration: "BY DEFAULT", primaryKey: true},
		name: {notNull: true, unique:true}
	},
	rufsGroupUser: {
		rufsUser: {type: "integer", primaryKey: true, foreignKeysImport: {table: "rufsUser", field: "id"}},
		rufsGroup: {type: "integer", primaryKey: true, foreignKeysImport: {table: "rufsGroup", field: "id"}}
	}
};

class RufsMicroService extends MicroServiceServer {

	constructor(config, appName) {
		if (config == undefined) config = {};
		config.appName = appName || "rufs";
		super(config);
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
	}

	onRequest(req, res, next, resource, action) {
		return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
	}

	static syncDb(entityManager) {
		return entityManager.getTablesInfo().
		then(tablesExistents => {
			let tablesMissing = new Map();
			for (let tableName in tablesRufs) if (tablesExistents.has(tableName) == false) tablesMissing.set(tableName, tablesRufs[tableName]);
			const rufsServiceDbSync = new RufsServiceDbSync(entityManager);

			const createTable = iterator => {
				let it = iterator.next();
				if (it.done == true) return Promise.resolve();
				let [name, fields] = it.value;
				console.log(`[${this.constructor.name}].setup.getTablesInfo().createTable(${name})`, fields);
				return rufsServiceDbSync.createTable(name, fields).then(() => createTable(iterator));
			};

			const userAdmin = {
				name: "admin", rufsGroupOwner: 1, password: "admin", path: "rufs_user/search", showSystemMenu: true,
				roles: '{"rufsGroupOwner":{"create":true,"update":true,"delete":true},"rufsUser":{"create":true,"update":true,"delete":true},"rufsGroup":{"create":true,"update":true,"delete":true},"rufsGroupUser":{"create":true,"update":true,"delete":true},"rufsTranslation":{"create":true,"update":true,"delete":true}}',
				routes: '[{"path": "/app/rufs_service/:action", "controller": "RufsServiceController"}, {"path": "/app/rufs_user/:action", "controller": "UserController"}]'
			};

			return createTable(tablesMissing.entries()).
			then(() => {
				return entityManager.getTablesInfo().then(map => {
					return this.loadOpenApi().then(openapi => {
						if (openapi.definitions == undefined) openapi.definitions = {};
						
						for (let [name, schemaDb] of map) {
							if (openapi.definitions[name] == undefined) openapi.definitions[name] = {};
							if (openapi.definitions[name].properties == undefined) openapi.definitions[name].properties = {};
							openapi.definitions[name] = this.updateJsonSchema(name, schemaDb, openapi.definitions[name]);
						}

						return this.storeOpenApi(openapi);
					});
				});
			}).
			then(openapi => {
				return Promise.resolve().
				then(() => entityManager.findOne("rufsGroupOwner", {name: "ADMIN"}).catch(() => entityManager.insert("rufsGroupOwner", {name: "ADMIN"}))).
				then(() => entityManager.findOne("rufsUser", {name: "admin"}).catch(() => entityManager.insert("rufsUser", userAdmin))).
				then(() => entityManager.find("rufsGroupOwner")).then(rows => fsPromises.writeFile("rufsGroupOwner.json", JSON.stringify(rows, null, "\t"))).
				then(() => entityManager.find("rufsUser")).then(rows => fsPromises.writeFile("rufsUser.json", JSON.stringify(rows, null, "\t"))).
				then(() => entityManager.find("rufsGroupUser")).then(rows => fsPromises.writeFile("rufsGroupUser.json", JSON.stringify(rows, null, "\t"))).
				then(() => openapi);
			});
		});
	}

	listen() {
		console.log(`[${this.constructor.name}] starting RufsMicroService ${this.config.appName}...`);
		return this.entityManager.connect().
		then(() => this.constructor.syncDb(this.entityManager)).
		then(openapi => {
			return RequestFilter.updateRufsServices(this.entityManager, openapi).
			then(() => super.listen()).
			then(() => console.log(`[${this.constructor.name}] ...RufsMicroService ${this.config.appName} started.`));
		});
	}

}

if (MicroServiceServer.getArg("sync-and-exit") != undefined) {
	const entityManager = new DbClientPostgres();
	entityManager.connect().then(() => RufsMicroService.syncDb(entityManager).finally(() => entityManager.disconnect()));
} else {
	RufsMicroService.checkStandalone();
}

export {RufsMicroService};
