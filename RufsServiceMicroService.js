import fs from "fs";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";
import {MicroServiceServer} from "./MicroServiceServer.js";
import {DbClientPostgres} from "./dbClientPostgres.js";
import {RequestFilter} from "./RequestFilter.js";

const fsPromises = fs.promises;

class RufsServiceDbSync {
	
	constructor(entityManager) {
		this.entityManager = entityManager;
	}

	genSqlColumnDescription(fieldName, field) {
		if (field.type == undefined) {
			if (field.identityGeneration != undefined) field.type = "i"; else field.type = "s";
		}

		let pos = this.entityManager.rufsTypes.indexOf(field.type);
        if (pos < 0) throw new Error(`DbClientPostgres.genSqlColumnDescription() : table ${name}, field ${fieldName} : unknow type : ${field.type}`);
		let sqlType = this.entityManager.sqlTypes[pos];
		if (field.type == "s" && field.length < 32) sqlType = "character";

		if (field.length == undefined) {
			if (field.type == "s") field.length = 255;
			if (field.type == "n") field.length = 9;
		}

		if (field.type == "n" && field.scale == undefined) field.scale = 3;

		let sqlLengthScale = "";

		if (field.length != undefined && field.scale != undefined) {
			sqlLengthScale = `(${field.length},{field.scale})`;
		} else if (field.length != undefined) {
			sqlLengthScale = `(${field.length})`;
		}

		let sqlDefault = "";
//		if (field.identityGeneration != undefined) sqlDefault = `GENERATED ${field.identityGeneration} AS IDENTITY`;
		if (field.identityGeneration != undefined) sqlType = `SERIAL`;

		if (field.defaultValue != undefined) {
			if (field.type == "s") sqlDefault = ` DEFAULT '${field.defaultValue}'`; else sqlDefault = " DEFAULT " + field.defaultValue;
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

			console.log(`DbClientPostgres.alterTable() : table ${name}, sql : \n${sql}\n`, mapTables);
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
		console.log(`DbClientPostgres.dropTable() : table ${name}, sql : \n${sql}\n`);
		return this.entityManager.client.query(sql);
	}

	generateFieldsStr(tabelName, newFields, oldFields) {
		if (newFields == undefined) throw new Error(`rufsServiceDbSync.generateFieldsStr(${tabelName}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = Object.entries(JSON.parse(newFields));
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		let jsonBuilder = {}; 

		for (let [fieldName, field] of newFields) {
			if (field.type == undefined) field.type = "s";
			if (field.hiden == undefined && field.identityGeneration != undefined) field.hiden = true;
			if (field.readOnly == undefined && field.identityGeneration != undefined) field.readOnly = true;

			if (this.entityManager.rufsTypes.indexOf(field.type) < 0) {
				console.error(`${tabelName} : ${fieldName} : Unknow type : ${field.type}`);
				continue;
			}
			// type (columnDefinition), readOnly, hiden, primaryKey, required (insertable), updatable, defaultValue, length, precision, scale 
			let jsonBuilderValue = {};
			// registra conflitos dos valores antigos com os valores detectados do banco de dados
			jsonBuilderValue["type"] = field.type;

			if (field.updatable == false) {
				jsonBuilderValue["updatable"] = false;
			}

			if (field.length > 0) {
				jsonBuilderValue["length"] = field.length;
			}

			if (field.precision > 0) {
				jsonBuilderValue["precision"] = field.precision;
			}

			if (field.scale > 0) {
				jsonBuilderValue["scale"] = field.scale;
			}

			if (field.notNull == true) {
				jsonBuilderValue["required"] = true;
			} else {
				jsonBuilderValue["required"] = field.required;
			}
			//
			if (field.foreignKeysImport != undefined) {
				if (Array.isArray(field.foreignKeysImport) == true) {
					if (field.foreignKeysImport.length > 1) {
						for (let i = 0; i < field.foreignKeysImport.length; i++) {
							let item = field.foreignKeysImport[i];

							if (item.field == "rufsGroupOwner") {
								field.foreignKeysImport.splice(i, 1);
							}
						}
					}

					if (field.foreignKeysImport.length > 1) {
						console.error(`rufsServiceDbSync.generateFieldsStr() : table [${tabelName}], field [${fieldName}], conflict foreignKeysImport : `, field.foreignKeysImport);
					}

					jsonBuilderValue["foreignKeysImport"] = field.foreignKeysImport[0];
				} else {
					jsonBuilderValue["foreignKeysImport"] = field.foreignKeysImport;
				}
			}

			jsonBuilderValue["primaryKey"] = field.primaryKey;
			jsonBuilderValue["defaultValue"] = field.defaultValue;
			jsonBuilderValue["unique"] = field.unique;
			jsonBuilderValue["identityGeneration"] = field.identityGeneration;
			jsonBuilderValue["isClonable"] = field.isClonable;
			jsonBuilderValue["hiden"] = field.hiden;
			jsonBuilderValue["readOnly"] = field.readOnly;
			jsonBuilderValue["comment"] = field.comment;
			// oculta tipos incompatíveis
			if (jsonBuilderValue["type"] != "s") {
				delete jsonBuilderValue["length"];
			}

			if (jsonBuilderValue["type"].startsWith("n") == false) {
				delete jsonBuilderValue["precision"];
				delete jsonBuilderValue["scale"];
			}
			// habilita os campos PLENAMENTE não SQL
			jsonBuilderValue.title = field.title;
			jsonBuilderValue.options = field.options;
			jsonBuilderValue.optionsLabels = field.optionsLabels;
			jsonBuilderValue.sortType = field.sortType;
			jsonBuilderValue.orderIndex = field.orderIndex;
			jsonBuilderValue.tableVisible = field.tableVisible;
			jsonBuilderValue.shortDescription = field.shortDescription;
			// exceções
			if (oldFields != undefined && oldFields[fieldName] != undefined) {
				let fieldOriginal = oldFields[fieldName];
				// copia do original os campos PLENAMENTE não SQL
				jsonBuilderValue.title = fieldOriginal.title;
				jsonBuilderValue.options = fieldOriginal.options;
				jsonBuilderValue.optionsLabels = fieldOriginal.optionsLabels;
				jsonBuilderValue.sortType = fieldOriginal.sortType;
				jsonBuilderValue.orderIndex = fieldOriginal.orderIndex;
				jsonBuilderValue.tableVisible = fieldOriginal.tableVisible;
				jsonBuilderValue.shortDescription = fieldOriginal.shortDescription;
				// registra conflitos dos valores antigos com os valores detectados do banco de dados
				const exceptions = ["service", "isClonable", "hiden", "foreignKeysImport"];

				for (let subFieldName in fieldOriginal) {
					if (exceptions.indexOf(subFieldName) < 0 && fieldOriginal[subFieldName] != jsonBuilderValue[subFieldName]) {
						console.warn(`rufsServiceDbSync.generateFieldsStr() : table [${tabelName}], field [${fieldName}], property [${subFieldName}] conflict previous declared [${fieldOriginal[subFieldName]}] new [${jsonBuilderValue[subFieldName]}]\nold:\n`, fieldOriginal, "\nnew:\n", jsonBuilderValue);
					}
				}
				// copia do original os campos PARCIALMENTE não SQL
				jsonBuilderValue.isClonable = fieldOriginal.isClonable;
				jsonBuilderValue.readOnly = fieldOriginal.readOnly;
				jsonBuilderValue.hiden = fieldOriginal.hiden;
			}
			// oculta os valores dafault
			const defaultValues = {type: "s", updatable: true, length: 255, precision: 9, scale: 3, hiden: false, primaryKey: false, required: false};

			for (let subFieldName in defaultValues) {
				if (jsonBuilderValue[subFieldName] == defaultValues[subFieldName]) {
					delete jsonBuilderValue[subFieldName];
				}
			}
			// troca todos os valores null por undefined
			for (let [key, value] of Object.entries(jsonBuilderValue)) {
				if (value == null) delete jsonBuilderValue[key];
			}

			jsonBuilder[fieldName] = jsonBuilderValue;
		}

		console.log(`rufsServiceDbSync.generateFieldsStr() : tableInfo(${tabelName}) :`, jsonBuilder);
		// TODO : NEXT LINE ONLY IN DEBUG
//		jsonBuilder = oldFields;
		return JSON.stringify(jsonBuilder);
    }

    updateRufsServices() {
		return this.entityManager.getTablesInfo().then(map => {
			const iterator = map.entries();
			
			const process = it => {
				if (it.done == true) {
					return;
				}
				
				let [name, tableInfo] = it.value;
				console.log(`RequestFilter.updateRufsServices.entityManager.getTablesInfo().process(${name})`);
				
				return this.entityManager.findOne("rufsService", {name}).then(service => {
            		service.fields = this.generateFieldsStr(name, tableInfo.fields, service.fields);
            		return this.entityManager.update("rufsService", {name}, service);
	        	}).catch(err => {
	        		if (err.message != "NoResultException") {
		        		console.error(`RequestFilter.updateRufsServices.entityManager.getTablesInfo().entityManager.find(${name}) :`, err);
		        		throw err;
	        		}
	        		
            		let service = {};
            		service.name = name;
            		service.fields = this.generateFieldsStr(name, tableInfo.fields);
            		return this.entityManager.insert("rufsService", service);
	        	}).then(serviceUpdated => {
        			return process(iterator.next());
            	});
			};
			
			return process(iterator.next());
        });
	}

}

let tablesRufs = {
	rufsService: {
		name: {primaryKey: true},
		menu: {},
		template:{},
		saveAndExit: {type: "b"},
		isOnLine: {type: "b"},
		title: {},
		fields: {length: 30000}
	},
	rufsGroupOwner: {
		id: {type: "i", identityGeneration: "BY DEFAULT", primaryKey: true},
		name: {notNull: true, unique:true}
	},
	rufsUser: {
		id: {type: "i", identityGeneration: "BY DEFAULT", primaryKey: true},
		rufsGroupOwner: {type: "i", notNull: true, foreignKeysImport: {table: "rufsGroupOwner", field: "id"}},
		name: {length: 32, notNull: true, unique:true},
		password: {notNull: true},
		roles: {length: 10240},
		routes: {length: 10240},
		path: {},
		menu: {length: 10240},
		showSystemMenu: {type: "b", defaultValue: false},
		authctoken: {}
	},
	rufsGroup: {
		id: {type: "i", identityGeneration: "BY DEFAULT", primaryKey: true},
		name: {notNull: true, unique:true}
	},
	rufsGroupUser: {
		rufsUser: {type: "i", primaryKey: true, foreignKeysImport: {table: "rufsUser", field: "id"}},
		rufsGroup: {type: "i", primaryKey: true, foreignKeysImport: {table: "rufsGroup", field: "id"}}
	},
	rufsTranslation: {
		id: {type: "i", identityGeneration: "BY DEFAULT", primaryKey: true},
		locale: {notNull: true, defaultValue: "pt-br"},
		name: {notNull: true},
		translation: {}
	}
};

class RufsServiceMicroService extends MicroServiceServer {

	constructor(config) {
		if (config == undefined) config = {};
		config.appName = "rufs_service";
		super(config);
		this.entityManager = new DbClientPostgres(this.config.dbConfig);
		this.rufsServiceDbSync = new RufsServiceDbSync(this.entityManager);
	}

	update(req, res, next, resource, action) {
		return this.entityManager.findOne("rufsService", {name: req.query.name}).
		then(objOld => {
			let obj = req.body;
			console.log(`RufsServiceEndPoint.update : [${obj.name}] :\nold fields :\n`, objOld.fields, "\nnew fields :\n", obj.fields);

			if (objOld.fields == undefined) {
				if (obj.fields != undefined && obj.isOnLine == true) return this.rufsServiceDbSync.createTable(obj.name, obj.fields).then(resSqlCreate => obj);
			} else {
				if (obj.fields == undefined) obj.fields = "{}";
				if (obj.isOnLine == true) return this.rufsServiceDbSync.alterTable(obj.name, obj.fields, objOld.fields).then(resSqlAlter => obj);
			}
			
			return obj;
		}).
		then(objChanged => {
			objChanged.fields = this.rufsServiceDbSync.generateFieldsStr(objChanged.name, objChanged.fields);
			return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
		}).
		catch(err => {
			console.log("ProcessRequest error : ", err);
			return Response.internalServerError(err.message);
		});
	}
		
	remove(req, res, next, resource, action) {
		return this.entityManager.findOne("rufsService", {name: req.query.name}).
		then(objOld => {
			console.log(`RufsServiceEndPoint.remove : [${objOld.name}] : old fields`);
			return this.rufsServiceDbSync.dropTable(objOld.name).then(resSqlDrop => objOld);
		}).
		then(objChanged => {
			return RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
		}).
		catch(err => {
			console.log("ProcessRequest error : ", err);
			return Response.internalServerError(err.message);
		});
	}

	onRequest(req, res, next, resource, action) {
		return Promise.resolve().
		then(() => {
			let tokenPayload = RequestFilter.extractTokenPayload(req.get("Authorization"));
			let access = RequestFilter.checkAuthorization(tokenPayload, resource, action);
			let promise;

			if (access == true) {
				if (action == "update") {
					promise = this.update(req, res, next, resource, action);
				} else if (action == "delete") {
					promise = this.remove(req, res, next, resource, action);
				} else {
					promise = RequestFilter.processRequest(req, res, next, this.entityManager, this, resource, action);
				}
			} else {
				promise = Promise.resolve(Response.unauthorized("Explicit Unauthorized"));
			}

			return promise;
		}).
		catch(err => {
			console.error(err);
			return Response.unauthorized(err.msg);
		});
	}

	listen() {
		return this.entityManager.connect().
		then(() => {
			const entityManager = this.entityManager;
			return entityManager.getTablesInfo().
			then(tablesExistents => {
				let tablesMissing = new Map();
				for (let tableName in tablesRufs) if (tablesExistents.has(tableName) == false) tablesMissing.set(tableName, tablesRufs[tableName]);

				const createTable = iterator => {
					let it = iterator.next();
					if (it.done == true) return Promise.resolve();
					let [name, fields] = it.value;
					console.log(`RequestFilter.setup.getTablesInfo().createTable(${name})`, fields);
					return this.rufsServiceDbSync.createTable(name, fields).then(() => createTable(iterator));
				};
				const userAdmin = {
					name: "admin", rufsGroupOwner: 1, password: "admin", path: "rufs_service/search", showSystemMenu: true,
					roles: '{"rufsService":{"create":true,"update":true,"delete":true},"rufsGroupOwner":{"create":true,"update":true,"delete":true},"rufsUser":{"create":true,"update":true,"delete":true},"rufsGroup":{"create":true,"update":true,"delete":true},"rufsGroupUser":{"create":true,"update":true,"delete":true},"rufsTranslation":{"create":true,"update":true,"delete":true}}',
					routes: '[{"path": "/app/rufs_service/:action", "controller": "RufsServiceController"}, {"path": "/app/rufs_user/:action", "controller": "UserController"}]'
				};
				return createTable(tablesMissing.entries()).
				then(() => this.rufsServiceDbSync.updateRufsServices()).
				then(() => entityManager.findOne("rufsGroupOwner", {name: "ADMIN"}).catch(() => entityManager.insert("rufsGroupOwner", {name: "ADMIN"}))).
				then(() => entityManager.findOne("rufsUser", {name: "admin"}).catch(() => entityManager.insert("rufsUser", userAdmin))).
				then(() => entityManager.find("rufsService")).then(rows => fsPromises.writeFile("rufsService.json", JSON.stringify(rows))).
				then(() => entityManager.find("rufsGroupOwner")).then(rows => fsPromises.writeFile("rufsGroupOwner.json", JSON.stringify(rows))).
				then(() => entityManager.find("rufsUser")).then(rows => fsPromises.writeFile("rufsUser.json", JSON.stringify(rows))).
				then(() => entityManager.find("rufsGroupUser")).then(rows => fsPromises.writeFile("rufsGroupUser.json", JSON.stringify(rows)));
			});
		}).
		then(() => {
			console.log(`starting updateRufsServices...`);
			return RequestFilter.updateRufsServices(this.entityManager).
			then(() => console.log(`...finished updateRufsServices...`)).
			then(() => super.listen());
		});
	}

}

RufsServiceMicroService.checkStandalone();

export {RufsServiceMicroService};
