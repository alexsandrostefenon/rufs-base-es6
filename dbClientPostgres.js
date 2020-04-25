import pg from "pg";
import pgCamelCase from "pg-camelcase";
import {CaseConvert} from "./webapp/es6/CaseConvert.js";

var revertCamelCase = pgCamelCase.inject(pg);

// Fix for parsing of numeric fields
var types = pg.types
types.setTypeParser(1700, 'text', parseFloat);
types.setTypeParser(1114, str => new Date(str + "+0000"));

class SgdbmAdapter {
	
	constructor(config) {

	}
}

class DbClientPostgres {

	constructor(dbConfig) {
		this.limitQuery = 10 * 1000;
		
		this.dbConfig = {
		  max: 10, // max number of clients in the pool
		  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
		};

		if (dbConfig != undefined) {
			if (dbConfig.host != undefined) this.dbConfig.host = dbConfig.host;
			if (dbConfig.port != undefined) this.dbConfig.port = dbConfig.port;
			if (dbConfig.database != undefined) this.dbConfig.database = dbConfig.database;
			if (dbConfig.user != undefined) this.dbConfig.user = dbConfig.user;
			if (dbConfig.password != undefined) this.dbConfig.password = dbConfig.password;
			// const connectionString = 'postgresql://dbuser:secretpassword@database.server.com:3211/mydb'
			if (dbConfig.connectionString != undefined) this.dbConfig.connectionString = dbConfig.connectionString;
			if (dbConfig.limitQuery != undefined) this.limitQuery = dbConfig.limitQuery;
		}
		//connect to our database
		//env var: PGHOST,PGPORT,PGDATABASE,PGUSER,PGPASSWORD
		this.client = new pg.Client(this.dbConfig);
		this.sqlTypes  = ["boolean","character varying","character","integer","jsonb", "numeric", "timestamp without time zone", "timestamp with time zone", "time without time zone", "bigint" , "smallint", "text"  , "date", "double precision", "bytea"];
		this.rufsTypes = ["boolean","string"           ,"string"   ,"integer","json" , "numeric", "datetime-local"             , "datetime-local"          , "datetime-local"        , "integer", "integer" , "string", "date", "numeric"         , "string"];
	}

	connect() {
		return this.client.connect();
	}

	disconnect() {
		return this.client.end();
	}

	static buildQuery(fields, params, orderBy) {
		var i = params.length + 1;
		var str = "";

		for (let fieldName in fields) {
			let field = fields[fieldName];

			if (Array.isArray(field)) {
				str = str + CaseConvert.camelToUnderscore(fieldName) + " = ANY ($" + i + ") AND ";
			} else {
				str = str + CaseConvert.camelToUnderscore(fieldName) + "=$" + i + " AND ";
			}

			params.push(field);
			i++;
		}

		if (str.endsWith(" AND ") > 0) {
			str = str.substring(0, str.length - 5);
		}

		if (str.length > 0) {
			str = " WHERE " + str;
		}

		if (orderBy != undefined && Array.isArray(orderBy) && orderBy.length > 0) {
			str = str + " ORDER BY " + CaseConvert.camelToUnderscore(orderBy.join(","));
		}

		return str;
	}

	insert(tableName, createObj) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		var params = [];
		var i = 1;
		var strFields = "";
		var strValues = "";

		for (var fieldName in createObj) {
			var obj = createObj[fieldName];
			strFields = strFields + CaseConvert.camelToUnderscore(fieldName) + ",";
			strValues = strValues + "$" + i + ",";

			if (Array.isArray(obj) == true) {
				var strArray = JSON.stringify(obj);
				params.push(strArray);
			} else {
				if (typeof(obj) === "string" && obj.length > 30000) console.error(`dbClientPostgres.insert: too large value of field ${fieldName}:\n${obj}`);
				params.push(obj);
			}

			i++;
		}

		if (strFields.endsWith(",") > 0) {
			strFields = strFields.substring(0, strFields.length - 1);
			strValues = strValues.substring(0, strValues.length - 1);
		}

		const sql = "INSERT INTO " + tableName + " (" + strFields + ") VALUES (" + strValues + ") RETURNING *";
		return this.client.query(sql, params).
		then(result => {
			console.log(`[${this.constructor.name}.insert(${tableName})]\n${sql}\n`, createObj, "\n", result.rows[0]);
			return result.rows[0];
		}).
		catch(err => {
			err.message = err.message + ` sql : ${sql} : ${params}`;
			throw err;
		});
	}

	find(tableName, fields, orderBy) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = [];
		const sqlQuery = DbClientPostgres.buildQuery(fields, params, orderBy);
		const sql = `SELECT * FROM ${tableName} ${sqlQuery} LIMIT ${this.limitQuery}`;
		console.log(sql);
		return this.client.query(sql, params).then(result => result.rows);
	}

	findOne(tableName, fields) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = [];
		const sql = "SELECT * FROM " + tableName + DbClientPostgres.buildQuery(fields, params);
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error(`NoResultException for ${tableName} : ${sql} : ${params}`);
			}

			return result.rows[0]
		});
	}

	findMax(tableName, fieldName, fields) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = [];
		const sql = "SELECT MAX(" + fieldName + ") FROM " + tableName + DbClientPostgres.buildQuery(fields, params);
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0].max;
		});
	}

	update(tableName, primaryKey, updateObj) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		var sql = "UPDATE " + tableName;
		var params = [];
		var i = 1;
		var str = "";

		for (var fieldName in updateObj) {
			str = str + CaseConvert.camelToUnderscore(fieldName) + "=$" + i + ",";
			var obj = updateObj[fieldName];

			if (Array.isArray(obj) == true) {
				var strArray = JSON.stringify(obj);
				params.push(strArray);
			} else {
				params.push(obj);
			}

			i++;
		}

		if (str.endsWith(",") > 0) {
			str = str.substring(0, str.length - 1);
			sql = sql + " SET " + str;
		}

		sql = sql + DbClientPostgres.buildQuery(primaryKey, params) + " RETURNING *";
		
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0]
		})
		.catch(error => {
			console.error(`DbClientPostgres.update(${tableName})\nprimaryKey:\n`, primaryKey, "\nupdateObj:\n", updateObj, "\nsql:\n", sql, "\nerror:\n", error);
			throw error;
		});
	}

	deleteOne(tableName, primaryKey) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = [];
		const sql = "DELETE FROM " + tableName + DbClientPostgres.buildQuery(primaryKey, params) + " RETURNING *";
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0]
		});
	}

	getOpenApi() {
		const processConstraints = mapTables => {
			return this.client.query("SELECT table_name,constraint_name,constraint_type FROM information_schema.table_constraints ORDER BY table_name").
			then(result => {
				return this.client.query("SELECT constraint_name,table_name,column_name,ordinal_position FROM information_schema.key_column_usage ORDER BY constraint_name,ordinal_position").
				then(resultFields => {
					return this.client.query("SELECT constraint_name,table_name,column_name FROM information_schema.constraint_column_usage").
					then(resultFieldsRef => {
						for (let [schemaName, schemaDb] of Object.entries(mapTables.definitions)) {
							schemaDb.primaryKeys = [];
							schemaDb.foreignKeys = {};
							schemaDb.uniqueKeys = {};
							const tableName = CaseConvert.camelToUnderscore(schemaName);
							const constraints = result.rows.filter(item => item.tableName == tableName);

							for (let constraint of constraints) {
								const constraintName = constraint.constraintName;
								const name = CaseConvert.underscoreToCamel(constraintName, false);
								const list = resultFields.rows.filter(item => item.constraintName == constraintName);
								const listRef = resultFieldsRef.rows.filter(item => item.constraintName == constraintName);

								if (constraint.constraintType == "FOREIGN KEY") {
									const foreignKey = {fields: [], fieldsRef: []};//requestFreight_RufsGroupOwner_Request_Fkey : {fields: ["rufsGroupOwner", "request"], tableRef: "request", fieldsRef: ["rufsGroupOwner", "id"]};
									schemaDb.foreignKeys[name] = foreignKey;

									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName, false);
										foreignKey.fields.push(columnName);
									}

									for (let itemRef of listRef) {
										const columnName = CaseConvert.underscoreToCamel(itemRef.columnName, false);
										foreignKey.fieldsRef.push(columnName);
										const tableName = CaseConvert.underscoreToCamel(itemRef.tableName, false);
										foreignKey.tableRef = tableName;
									}

									for (let i = 0; i < foreignKey.fields.length; i++) {
										const field = schemaDb.properties[foreignKey.fields[i]];
										if (field.foreignKeysImport == undefined) field.foreignKeysImport = [];
										field.foreignKeysImport.push({name: name, table: foreignKey.tableRef, field: foreignKey.fieldsRef[i]});
									}
								} else if (constraint.constraintType == "UNIQUE") {
									schemaDb.uniqueKeys[name] = [];

									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName, false);
										schemaDb.uniqueKeys[name].push(columnName);
									}
								} else if (constraint.constraintType == "PRIMARY KEY") {
									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName, false);
										schemaDb.primaryKeys.push(columnName);
									}
								}
							}

							for (let [fieldName, field] of Object.entries(schemaDb.properties)) {
								if (field.foreignKeysImport != undefined) {
									for (let item of field.foreignKeysImport) {
										if (fieldName.startsWith(item.table) == true) {
											field.foreignKeysImport = [item];
											break;
										}
									}
								}
							}
						}

						return mapTables;
					});
				});
			}).
			catch(err => {
				console.error(`this.constructor.name.getTablesInfo.processConstraints : ${err.message}`);
				throw err;
			});
		}

		const processColumns = () => {
			let sqlGetComments = 
				"select c.*,left(pgd.description,100) as description " +
				"from pg_catalog.pg_statio_all_tables as st " +
				"inner join pg_catalog.pg_description pgd on (pgd.objoid=st.relid) " +
				"right outer join information_schema.columns c on (pgd.objsubid=c.ordinal_position and  c.table_schema=st.schemaname and c.table_name=st.relname) " +
				"where table_schema = 'public' order by c.table_name,c.ordinal_position";
			return this.client.query(sqlGetComments).then(result => {
				let mapTables = {definitions: {}};

				for (let rec of result.rows) {
					let typeIndex = this.sqlTypes.indexOf(rec.dataType);

					if (typeIndex >= 0) {
						const tableName = CaseConvert.underscoreToCamel(rec.tableName, false);
						let entityClass;

						if (mapTables.definitions[tableName] != undefined) {
							entityClass = mapTables.definitions[tableName];
						} else {
							entityClass = {};
							entityClass.properties = {};
							mapTables.definitions[tableName] = entityClass;
						}

						const fieldName = CaseConvert.underscoreToCamel(rec.columnName, false);
						let field = {}
						field.primaryKey = undefined;
						field.unique = undefined;
						field.type = this.rufsTypes[typeIndex]; // LocalDateTime,ZonedDateTime,Date,Time
						field.notNull = rec.isNullable == "NO"; // true,false
						field.updatable = rec.isUpdatable == "YES"; // true,false
						field.scale = rec.numericScale; // > 0 // 3,2,1
						field.length = rec.characterMaximumLength; // > 0 // 255
						field.precision = rec.numericPrecision; // > 0
						field.default = rec.columnDefault; // 'pt-br'::character varying
						field.description = rec.description;
						// adjusts
						if (field.type == "numeric" && field.scale == 0) field.type = "integer";

						if (field.default != undefined && field.default[0] == "'" && field.default.length > 2) {
							if (field.type == "string") {
								field.default = field.default.substring(1, field.default.indexOf("'", 1));
							} else {
								field.default = undefined;
							}
						}

						if ((field.type == "integer" || field.type == "numeric") && isNaN(field.default) == true) field.default = undefined;
						field.identityGeneration = rec.identityGeneration; // BY DEFAULT,ALWAYS
						// SERIAL TYPE
						if (rec.default != undefined && rec.default.startsWith("nextval")) field.identityGeneration = "BY DEFAULT";
						entityClass.properties[fieldName] = field;
					} else {
						console.error(`DbClientPostgres.getTablesInfo().processColumns() : Invalid Database Type : ${rec.dataType}, full rec : ${JSON.stringify(rec)}`);
					}
				}

				return mapTables;
			});
		};

		return processColumns().
		then(mapTables => processConstraints(mapTables));
	}

}

export {DbClientPostgres}
