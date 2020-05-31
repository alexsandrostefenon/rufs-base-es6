import pg from "pg";
import pgCamelCase from "pg-camelcase";
import Firebird from "node-firebird";
//import FirebirdNative from "node-firebird";//firebird
import {CaseConvert} from "./webapp/es6/CaseConvert.js";

var revertCamelCase = pgCamelCase.inject(pg);

// Fix for parsing of numeric fields
var types = pg.types
types.setTypeParser(1700, 'text', parseFloat);
types.setTypeParser(1114, str => new Date(str + "+0000"));

if (pg.Query != undefined) {
	const submit = pg.Query.prototype.submit;

	pg.Query.prototype.submit = function () {
		const text = this.text;
		const values = this.values || [];

		if (text != undefined) {
			if (values.length > 0) {
				const query = text.replace(/\$([0-9]+)/g, (m, v) => JSON.stringify(values[parseInt(v) - 1]).replace(/"/g, "'"));
				console.log(query);
			} else {
				console.log(text);
			}
		}

		submit.apply(this, arguments);
	};
}

class SqlAdapterNodeFirebird {

	constructor(config) {
		this.config = config;
		this.enableParams = false;
/*
SELECT
  RF.RDB$FIELD_NAME FIELD_NAME,
  CASE F.RDB$FIELD_TYPE
    WHEN 7 THEN
      CASE F.RDB$FIELD_SUB_TYPE
        WHEN 0 THEN 'SMALLINT'
        WHEN 1 THEN 'NUMERIC(' || F.RDB$FIELD_PRECISION || ', ' || (-F.RDB$FIELD_SCALE) || ')'
        WHEN 2 THEN 'DECIMAL'
      END
    WHEN 8 THEN
      CASE F.RDB$FIELD_SUB_TYPE
        WHEN 0 THEN 'INTEGER'
        WHEN 1 THEN 'NUMERIC('  || F.RDB$FIELD_PRECISION || ', ' || (-F.RDB$FIELD_SCALE) || ')'
        WHEN 2 THEN 'DECIMAL'
      END
    WHEN 9 THEN 'QUAD'
    WHEN 10 THEN 'FLOAT'
    WHEN 12 THEN 'DATE'
    WHEN 13 THEN 'TIME'
    WHEN 14 THEN 'CHAR(' || (TRUNC(F.RDB$FIELD_LENGTH / CH.RDB$BYTES_PER_CHARACTER)) || ') '
    WHEN 16 THEN
      CASE F.RDB$FIELD_SUB_TYPE
        WHEN 0 THEN 'BIGINT'
        WHEN 1 THEN 'NUMERIC(' || F.RDB$FIELD_PRECISION || ', ' || (-F.RDB$FIELD_SCALE) || ')'
        WHEN 2 THEN 'DECIMAL'
      END
    WHEN 27 THEN 'DOUBLE'
    WHEN 35 THEN 'TIMESTAMP'
    WHEN 37 THEN 'VARCHAR(' || (TRUNC(F.RDB$FIELD_LENGTH / CH.RDB$BYTES_PER_CHARACTER)) || ')'
    WHEN 40 THEN 'CSTRING' || (TRUNC(F.RDB$FIELD_LENGTH / CH.RDB$BYTES_PER_CHARACTER)) || ')'
    WHEN 45 THEN 'BLOB_ID'
    WHEN 261 THEN 'BLOB SUB_TYPE ' || F.RDB$FIELD_SUB_TYPE
    ELSE 'RDB$FIELD_TYPE: ' || F.RDB$FIELD_TYPE || '?'
  END FIELD_TYPE,
  IIF(COALESCE(RF.RDB$NULL_FLAG, 0) = 0, NULL, 'NOT NULL') FIELD_NULL,
  CH.RDB$CHARACTER_SET_NAME FIELD_CHARSET,
  DCO.RDB$COLLATION_NAME FIELD_COLLATION,
  COALESCE(RF.RDB$DEFAULT_SOURCE, F.RDB$DEFAULT_SOURCE) FIELD_DEFAULT,
  F.RDB$VALIDATION_SOURCE FIELD_CHECK,
  RF.RDB$DESCRIPTION FIELD_DESCRIPTION
FROM RDB$RELATION_FIELDS RF
JOIN RDB$FIELDS F ON (F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE)
LEFT OUTER JOIN RDB$CHARACTER_SETS CH ON (CH.RDB$CHARACTER_SET_ID = F.RDB$CHARACTER_SET_ID)
LEFT OUTER JOIN RDB$COLLATIONS DCO ON ((DCO.RDB$COLLATION_ID = F.RDB$COLLATION_ID) AND (DCO.RDB$CHARACTER_SET_ID = F.RDB$CHARACTER_SET_ID))
WHERE (COALESCE(RF.RDB$SYSTEM_FLAG, 0) = 0)
ORDER BY RF.RDB$FIELD_POSITION;
*/
	}

	connect() {
		return new Promise((resolve, reject) => {
			Firebird.attach({database: "/var/CLIPP-3.fdb", user: "SYSDBA", password: "masterkey"}, (err, db) => {
				if (err) {
					reject(err);
				} else {
					resolve(db);
				}
			});
		}).
		then(db => this.client = db);
	}

	end() {
		return this.client.detach();
	}

	query(sql, params){
		sql = sql.replace(/\$\d+/g, "?");
		return new Promise((resolve, reject) => {
			this.client.query(sql, params, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		}).
		then(result => {
			ret = {rowCount: result.length, rows: result};
			return ret;
		});
	}

}

class SqlAdapterFirebirdNative {

	constructor(config) {
		this.config = config;
		this.enableParams = false;
	}

	connect() {
		return new Promise((resolve, reject) => {
			const con = FirebirdNative.createConnection();
			con.connect(this.config.database, this.config.user, this.config.password, "", (err) => {
				if (err) {
					reject(err);
				} else {
					resolve(con);
				}
			});
		}).
		then(db => this.client = db);
	}

	end() {
		return this.client.disconnect();
	}

	query(sql, params){
		return new Promise((resolve, reject) => {
			this.client.query(sql, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		}).
		then(result => {
			const rows = result.fetchSync("all", true);
			return {rowCount: rows.length, rows: rows};
		});
	}

}

class SqlAdapterPostgres {

	constructor(config) {
		config.max = 10; // max number of clients in the pool
		config.idleTimeoutMillis = 30000; // how long a client is allowed to remain idle before being closed
		this.client = new pg.Client(config);
		this.enableParams = true;
	}

	connect() {
		return this.client.connect();
	}

	end() {
		return this.client.end();
	}

	query(sql, params){
		return this.client.query(sql, params);
	}

}

class DbClientPostgres {

	constructor(dbConfig) {
		this.limitQuery = 10 * 1000;
		this.dbConfig = {};

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
		if (this.dbConfig.database != undefined && this.dbConfig.database.endsWith(".fdb")) {
			this.client = new SqlAdapterNodeFirebird(this.dbConfig);
//			this.client = new SqlAdapterFirebirdNative(this.dbConfig);
		} else {
			this.client = new SqlAdapterPostgres(this.dbConfig);
		}

		this.sqlTypes  = ["boolean","character varying","character","integer","jsonb", "numeric", "timestamp without time zone", "timestamp with time zone", "time without time zone", "bigint" , "smallint", "text"  , "date", "double precision", "bytea"];
		this.rufsTypes = ["boolean","string"           ,"string"   ,"integer","json" , "number" , "datetime-local"             , "datetime-local"          , "datetime-local"        , "integer", "integer" , "string", "date", "number"          , "string"];
	}

	connect() {
		return this.client.connect();
	}

	disconnect() {
		return this.client.end();
	}

	static buildQuery(queryParams, params, orderBy) {
		const buildConditions = (queryParams, params, operator, conditions) => {
			for (let fieldName in queryParams) {
				let field = queryParams[fieldName];
				let condition;

				if (Array.isArray(field)) {
					condition = CaseConvert.camelToUnderscore(fieldName) + operator + " ANY ($" + (params.length + 1) + ")";
				} else {
					condition = CaseConvert.camelToUnderscore(fieldName) + operator + "$" + (params.length + 1);
				}

				conditions.push(condition);
				params.push(field);
			}

			return conditions;
		}

		if (queryParams == undefined || queryParams == null)
			return "";

		let conditions = [];

		if (queryParams.filter || queryParams.filterRangeMin || queryParams.filterRangeMax) {
			if (queryParams.filter) buildConditions(queryParams.filter, params, "=", conditions);
			if (queryParams.filterRangeMin) buildConditions(queryParams.filterRangeMin, params, ">", conditions);
			if (queryParams.filterRangeMax) buildConditions(queryParams.filterRangeMax, params, "<", conditions);
		} else {
			buildConditions(queryParams, params, "=", conditions);
		}

		let str = "";

		if (conditions.length > 0) {
			str = " WHERE " + conditions.join(" AND ");
		}

		if (orderBy != undefined && Array.isArray(orderBy) && orderBy.length > 0) {
			str = str + " ORDER BY " + CaseConvert.camelToUnderscore(orderBy.join(","));
		}

		return str;
	}

	buildInsertSql(tableName, obj, params) {
		const sqlStringify = value => {
			if (typeof value == "string") value = "'" + value + "'";
			if (value instanceof Date) value = "'" + value.toISOString() + "'";
			return value;
		}

		tableName = CaseConvert.camelToUnderscore(tableName);
		var i = 1;
		const strFields = [];
		const strValues = [];

		for (let [fieldName, value] of Object.entries(obj)) {
			strFields.push(CaseConvert.camelToUnderscore(fieldName));
			strValues.push(params != undefined ? "$" + i : sqlStringify(value));

			if (params != undefined) {
				if (Array.isArray(value) == true) {
					var strArray = JSON.stringify(value);
					params.push(strArray);
				} else {
					if (typeof(value) === "string" && value.length > 30000) console.error(`dbClientPostgres.insert: too large value of field ${fieldName}:\n${value}`);
					params.push(value);
				}

				i++;
			}
		}

		return `INSERT INTO ${tableName} (${strFields.join(",")}) VALUES (${strValues.join(",")}) RETURNING *;`;
	}

	insert(tableName, createObj) {
		const params = this.client.enableParams ? [] : undefined;
		const sql = this.buildInsertSql(tableName, createObj, params);
		return this.client.query(sql, params).
		then(result => {
			console.log(`[${this.constructor.name}.insert(${tableName})]\n${sql}\n`, createObj, "\n", result.rows[0]);
			return result.rows[0];
		}).
		catch(err => {
			err.message = err.message + `\nsql : ${sql}\nparams : ${JSON.stringify(params)}`;
			console.error(`[${this.constructor.name}.insert(${tableName}, ${JSON.stringify(createObj)})] :`, err.message);
			throw err;
		});
	}

	find(tableName, queryParams, orderBy) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = this.client.enableParams ? [] : undefined;
		const sqlQuery = DbClientPostgres.buildQuery(queryParams, params, orderBy);
		const sql = `SELECT * FROM ${tableName} ${sqlQuery} LIMIT ${this.limitQuery}`;
		console.log(sql);
		return this.client.query(sql, params).then(result => result.rows);
	}

	findOne(tableName, queryParams) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = this.client.enableParams ? [] : undefined;
		const sql = "SELECT * FROM " + tableName + DbClientPostgres.buildQuery(queryParams, params);
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error(`NoResultException for ${tableName} : ${sql} : ${params}`);
			}

			return result.rows[0]
		});
	}

	findMax(tableName, fieldName, queryParams) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = this.client.enableParams ? [] : undefined;
		const sql = "SELECT MAX(" + fieldName + ") FROM " + tableName + DbClientPostgres.buildQuery(queryParams, params);
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0].max;
		});
	}

	update(tableName, primaryKey, obj) {
		tableName = CaseConvert.camelToUnderscore(tableName);
		const params = this.client.enableParams ? [] : undefined;
		var i = 1;
		const list = [];

		for (let [fieldName, value] of Object.entries(obj)) {
			list.push(CaseConvert.camelToUnderscore(fieldName)+ "=" + (params != undefined ? "$" + i : this.sqlStringify(value)));

			if (params != undefined) {
				if (Array.isArray(value) == true) {
					var strArray = JSON.stringify(value);
					params.push(strArray);
				} else {
					if (typeof(value) === "string" && value.length > 30000) console.error(`dbClientPostgres.insert: too large value of field ${fieldName}:\n${value}`);
					params.push(value);
				}

				i++;
			}
		}

		const sql = `UPDATE ${tableName} SET ${list.join(",")}` + DbClientPostgres.buildQuery(primaryKey, params) + " RETURNING *";
		
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
		const params = this.client.enableParams ? [] : undefined;
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
/*
SELECT rc.RDB$CONSTRAINT_NAME AS constraint_name,
i.RDB$RELATION_NAME AS table_name,
s.RDB$FIELD_NAME AS field_name,
i2.RDB$RELATION_NAME AS references_table,
s2.RDB$FIELD_NAME AS references_field,
(s.RDB$FIELD_POSITION + 1) AS field_position
FROM RDB$INDEX_SEGMENTS s
LEFT JOIN RDB$INDICES i ON i.RDB$INDEX_NAME = s.RDB$INDEX_NAME
LEFT JOIN RDB$RELATION_CONSTRAINTS rc ON rc.RDB$INDEX_NAME = s.RDB$INDEX_NAME
LEFT JOIN RDB$REF_CONSTRAINTS refc ON rc.RDB$CONSTRAINT_NAME = refc.RDB$CONSTRAINT_NAME
LEFT JOIN RDB$RELATION_CONSTRAINTS rc2 ON rc2.RDB$CONSTRAINT_NAME = refc.RDB$CONST_NAME_UQ
LEFT JOIN RDB$INDICES i2 ON i2.RDB$INDEX_NAME = rc2.RDB$INDEX_NAME
--LEFT JOIN RDB$INDEX_SEGMENTS s2 ON i2.RDB$INDEX_NAME = s2.RDB$INDEX_NAME
LEFT JOIN RDB$INDEX_SEGMENTS s2 ON i2.RDB$INDEX_NAME = s2.RDB$INDEX_NAME AND s.RDB$FIELD_POSITION = s2.RDB$FIELD_POSITION
WHERE rc.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'
ORDER BY constraint_name,s.RDB$FIELD_POSITION
*/
			return this.client.query("SELECT table_name,constraint_name,constraint_type FROM information_schema.table_constraints ORDER BY table_name").
			then(result => {
				return this.client.query("SELECT table_name,constraint_name,column_name,ordinal_position FROM information_schema.key_column_usage ORDER BY constraint_name,ordinal_position").
				then(resultFields => {
					return this.client.query("SELECT table_name,constraint_name,column_name FROM information_schema.constraint_column_usage").
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
									const foreignKey = {fields: [], fieldsRef: []};
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

										if (field != undefined) {
											if (field.foreignKeysImport == undefined) field.foreignKeysImport = [];
											field.foreignKeysImport.push({name: name, table: foreignKey.tableRef, field: foreignKey.fieldsRef[i]});
										} else {
											console.error(`${this.constructor.name}.getTablesInfo.processConstraints : field ${foreignKey.fields[i]} not exists in schema ${schemaName}`);
										}
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
								if (field.foreignKeysImport != undefined && Array.isArray(field.foreignKeysImport)) {
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
				console.error(`${this.constructor.name}.getTablesInfo.processConstraints : ${err.message}`);
				throw err;
			});
		}

		const processColumns = () => {
/*
SELECT
	RF.RDB$RELATION_NAME table_name,RF.RDB$FIELD_POSITION pos,
	RF.RDB$FIELD_NAME column_name,F.RDB$FIELD_TYPE data_type,F.RDB$FIELD_SUB_TYPE subType,
	F.RDB$FIELD_PRECISION numeric_precision,F.RDB$FIELD_SCALE numeric_scale,
	F.RDB$FIELD_LENGTH character_maximum_length,
	RF.RDB$NULL_FLAG is_nullable, RF.RDB$UPDATE_FLAG is_updatable,
	COALESCE(RF.RDB$DEFAULT_SOURCE, F.RDB$DEFAULT_SOURCE) column_default,
	RF.RDB$DESCRIPTION description,
	RF.RDB$IDENTITY_TYPE identity_generation, RF.RDB$GENERATOR_NAME
FROM RDB$RELATION_FIELDS RF
JOIN RDB$FIELDS F ON (F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE)
WHERE (COALESCE(RF.RDB$SYSTEM_FLAG, 0) = 0)
ORDER BY table_name,pos;
*/
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
						field.unique = undefined;
						field.type = this.rufsTypes[typeIndex]; // LocalDateTime,ZonedDateTime,Date,Time
						field.notNull = rec.isNullable != "YES" && rec.isNullable != 1; // true,false
						field.updatable = rec.isUpdatable == "YES" || rec.isUpdatable == 1; // true,false
						field.scale = rec.numericScale; // > 0 // 3,2,1
						field.length = rec.characterMaximumLength; // > 0 // 255
						field.precision = rec.numericPrecision; // > 0
						field.default = rec.columnDefault; // 'pt-br'::character varying
						field.description = rec.description;
						// adjusts
						// TODO : check
						if (field.type == "number" && (field.scale == undefined || field.scale == 0)) field.type = "integer";

						if (field.default != undefined && field.default[0] == "'" && field.default.length > 2) {
							if (field.type == "string") {
								field.default = field.default.substring(1, field.default.indexOf("'", 1));
							} else {
								field.default = undefined;
							}
						}

						if ((field.type == "integer" || field.type == "number") && isNaN(field.default) == true) field.default = undefined;
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
