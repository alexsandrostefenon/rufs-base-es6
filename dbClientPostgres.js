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
		this.sqlInfoTables =
`
SELECT
	RF.RDB$RELATION_NAME table_name,RF.RDB$FIELD_POSITION pos,
	RF.RDB$FIELD_NAME column_name,
	CASE F.RDB$FIELD_TYPE
		WHEN 7 THEN
		  CASE F.RDB$FIELD_SUB_TYPE
			WHEN 0 THEN 'smallint'
			WHEN 1 THEN 'numeric'
			WHEN 2 THEN 'DECIMAL'
		  END
		WHEN 8 THEN
		  CASE F.RDB$FIELD_SUB_TYPE
			WHEN 0 THEN 'integer'
			WHEN 1 THEN 'numeric'
			WHEN 2 THEN 'DECIMAL'
		  END
		WHEN 9 THEN 'QUAD'
		WHEN 10 THEN 'FLOAT'
		WHEN 12 THEN 'date'
		WHEN 13 THEN 'timestamp with time zone'
		WHEN 14 THEN 'character'
		WHEN 16 THEN
		  CASE F.RDB$FIELD_SUB_TYPE
			WHEN 0 THEN 'bigint'
			WHEN 1 THEN 'numeric'
			WHEN 2 THEN 'DECIMAL'
		  END
		WHEN 27 THEN 'double precision'
		WHEN 35 THEN 'timestamp with time zone'
		WHEN 37 THEN 'character varying'
		WHEN 40 THEN 'CSTRING'
		WHEN 45 THEN 'BLOB_ID'
		WHEN 261 THEN
		  CASE F.RDB$FIELD_SUB_TYPE
			WHEN 0 THEN 'bytea'
			WHEN 1 THEN 'text'
			ELSE 'BLOB: ' || F.RDB$FIELD_TYPE
		  END
		ELSE 'RDB$FIELD_TYPE: ' || F.RDB$FIELD_TYPE || '?'
	END data_type,
	F.RDB$FIELD_PRECISION numeric_precision,-F.RDB$FIELD_SCALE numeric_scale,
	F.RDB$FIELD_LENGTH character_maximum_length,
	RF.RDB$NULL_FLAG is_nullable, RF.RDB$UPDATE_FLAG is_updatable,
	COALESCE(RF.RDB$DEFAULT_SOURCE, F.RDB$DEFAULT_SOURCE) column_default,
	RF.RDB$DESCRIPTION description,
	RF.RDB$IDENTITY_TYPE identity_generation, RF.RDB$GENERATOR_NAME
FROM RDB$RELATION_FIELDS RF
JOIN RDB$FIELDS F ON (F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE)
WHERE (COALESCE(RF.RDB$SYSTEM_FLAG, 0) = 0)
ORDER BY table_name,pos;
`;
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
		this.sqlInfoConstraints =
		`
SELECT
	rc.RDB$RELATION_NAME table_name,rc.RDB$INDEX_NAME constraint_name,rc.RDB$CONSTRAINT_TYPE constraint_type
FROM RDB$RELATION_CONSTRAINTS rc
ORDER BY table_name,constraint_name
		`;
		this.sqlInfoConstraintsFields =
		`
SELECT s.RDB$INDEX_NAME constraint_name,s.RDB$FIELD_NAME column_name,s.RDB$FIELD_POSITION ordinal_position
FROM RDB$INDEX_SEGMENTS s ORDER BY constraint_name,ordinal_position
		`;
		this.sqlInfoConstraintsFieldsRef = 
		`
SELECT
refc.RDB$CONSTRAINT_NAME constraint_name,
rc.RDB$RELATION_NAME table_name,
s.RDB$FIELD_NAME column_name,
s.RDB$FIELD_POSITION ordinal_position
FROM RDB$INDEX_SEGMENTS s
INNER JOIN RDB$REF_CONSTRAINTS refc ON s.RDB$INDEX_NAME = refc.RDB$CONST_NAME_UQ
INNER JOIN RDB$RELATION_CONSTRAINTS rc ON rc.RDB$INDEX_NAME = s.RDB$INDEX_NAME
ORDER BY constraint_name,ordinal_position
		`;
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
			if (params && params.length > 0) {
				const query = sql.replace(/\$(\?)/g, (m, v) => JSON.stringify(params[parseInt(v) - 1]).replace(/"/g, "'"));
				console.log(query);
			} else {
				console.log(sql);
			}

			this.client.query(sql, params, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		}).
		then(result => {
			console.log(result.length);
			const ret = {rowCount: result.length, rows: result};
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
		this.sqlInfoTables = 
			"select c.*,left(pgd.description,100) as description " +
			"from pg_catalog.pg_statio_all_tables as st " +
			"inner join pg_catalog.pg_description pgd on (pgd.objoid=st.relid) " +
			"right outer join information_schema.columns c on (pgd.objsubid=c.ordinal_position and  c.table_schema=st.schemaname and c.table_name=st.relname) " +
			"where table_schema = 'public' order by c.table_name,c.ordinal_position";
		this.sqlInfoConstraints =
			"SELECT table_name,constraint_name,constraint_type FROM information_schema.table_constraints ORDER BY table_name,constraint_name";
		this.sqlInfoConstraintsFields =
			"SELECT constraint_name,column_name,ordinal_position FROM information_schema.key_column_usage ORDER BY constraint_name,ordinal_position";
		this.sqlInfoConstraintsFieldsRef =
			"SELECT constraint_name,table_name,column_name FROM information_schema.constraint_column_usage";
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

		this.sqlTypes  = ["boolean","character varying","character","integer","jsonb", "numeric", "timestamp without time zone", "timestamp with time zone", "time without time zone", "bigint" , "smallint", "text"  , "date"          , "double precision", "bytea"];
		this.rufsTypes = ["boolean","string"           ,"string"   ,"integer","json" , "number" , "date-time"                  , "date-time"               , "date-time"             , "integer", "integer" , "string", "date-time"     , "number"          , "string"];
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
		const setRef = (schema, fieldName, tableRef) => {
			const field = schema.properties[fieldName];

			if (field != undefined) {
				field.$ref = "#/components/schemas/" + tableRef;
			} else {
				console.error(`${this.constructor.name}.getTablesInfo.processConstraints.setRef : field ${fieldName} not exists in schema ${schema.name}`);
			}
		}

		const processConstraints = openapi => {
			return this.client.query(this.client.sqlInfoConstraints).
			then(result => {
				return this.client.query(this.client.sqlInfoConstraintsFields).
				then(resultFields => {
					return this.client.query(this.client.sqlInfoConstraintsFieldsRef).
					then(resultFieldsRef => {
						for (let [schemaName, schema] of Object.entries(openapi.components.schemas)) {
							schema.primaryKeys = [];
							schema.foreignKeys = {};
							schema.uniqueKeys = {};
							const tableName = CaseConvert.camelToUnderscore(schemaName);
							const constraints = result.rows.filter(item => item.tableName.trim().toLowerCase() == tableName);

							for (let constraint of constraints) {
								if (constraint.constraintName == null) continue;
								const constraintName = constraint.constraintName.trim();
								const name = CaseConvert.underscoreToCamel(constraintName.trim().toLowerCase(), false);
								const list = resultFields.rows.filter(item => item.constraintName.trim() == constraintName);
								const listRef = resultFieldsRef.rows.filter(item => item.constraintName.trim() == constraintName);

								if (constraint.constraintType.toString().trim() == "FOREIGN KEY") {
									const foreignKey = {fields: [], fieldsRef: []};

									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName.trim().toLowerCase(), false);
										foreignKey.fields.push(columnName);
									}

									for (let itemRef of listRef) {
										const columnName = CaseConvert.underscoreToCamel(itemRef.columnName.trim().toLowerCase(), false);
										foreignKey.fieldsRef.push(columnName);
										const tableRef = CaseConvert.underscoreToCamel(itemRef.tableName.trim().toLowerCase(), false);

										if (foreignKey.tableRef == undefined || foreignKey.tableRef == tableRef)
											foreignKey.tableRef = tableRef;
										else 
											console.error(`[${this.constructor.name}.getOpenApi().processConstraints()] : tableRef already defined : new (${tableRef}, old (${foreignKey.tableRef}))`);
									}

									if (foreignKey.fields.length != foreignKey.fieldsRef.length) {
										console.error(`[${this.constructor.name}.getOpenApi().processConstraints()] : fields and fieldsRef length don't match : fields (${foreignKey.fields.toString()}, fieldsRef (${foreignKey.fieldsRef.toString()}))`);
										continue;
									}

									if (foreignKey.fields.length == 1) {
										setRef(schema, foreignKey.fields[0], foreignKey.tableRef);
										continue;
									}

									if (foreignKey.fields.length > 1 && foreignKey.fields.indexOf(foreignKey.tableRef) >= 0) {
										setRef(schema, foreignKey.tableRef, foreignKey.tableRef);
									}

									schema.foreignKeys[name] = foreignKey;
								} else if (constraint.constraintType.toString().trim() == "UNIQUE") {
									schema.uniqueKeys[name] = [];

									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName.trim().toLowerCase(), false);
										schema.uniqueKeys[name].push(columnName);
									}
								} else if (constraint.constraintType.toString().trim() == "PRIMARY KEY") {
									for (let item of list) {
										const columnName = CaseConvert.underscoreToCamel(item.columnName.trim().toLowerCase(), false);
										schema.primaryKeys.push(columnName);
										if (schema.required.indexOf(columnName) < 0) schema.required.push(columnName);
									}
								}
							}

							for (let [name, foreignKey] of Object.entries(schema.foreignKeys)) {
								const candidates = [];

								for (const fieldName of foreignKey.fields) {
									const field = schema.properties[fieldName];

									if (field != undefined && field.$ref == undefined) {
										candidates.push(fieldName);
									}
								}

								if (candidates.length == 1) {
									setRef(schema, candidates[0], foreignKey.tableRef);
									delete schema.foreignKeys[name];
								}
							}

							if (schema.required.length == 0) {
								console.error(`[${this.constructor.name}.getOpenApi().processColumns()] missing required fields of table ${schemaName}`);
								delete openapi.components.schemas[schemaName];
							}
						}

						return openapi;
					});
				});
			}).
			catch(err => {
				console.error(`${this.constructor.name}.getTablesInfo.processConstraints : ${err.message}`);
				throw err;
			});
		}

		const processColumns = () => {
			return this.client.query(this.client.sqlInfoTables).then(result => {
				let openapi = {"components": {"schemas": {}}};

				for (let rec of result.rows) {
					let typeIndex = this.sqlTypes.indexOf(rec.dataType.trim().toLowerCase());

					if (typeIndex >= 0) {
						const tableName = CaseConvert.underscoreToCamel(rec.tableName.trim().toLowerCase(), false);
						let schema;

						if (openapi.components.schemas[tableName] != undefined) {
							schema = openapi.components.schemas[tableName];
						} else {
							schema = {};
							schema.type = "object";
							schema.properties = {};
							openapi.components.schemas[tableName] = schema;
						}

						if (schema.required == undefined) schema.required = [];

						const fieldName = CaseConvert.underscoreToCamel(rec.columnName.trim().toLowerCase(), false);
						let field = {}
						field.unique = undefined;
						field.type = this.rufsTypes[typeIndex]; // LocalDateTime,ZonedDateTime,Date,Time
						field.notNull = rec.isNullable != "YES" && rec.isNullable != 1; // true,false
						field.updatable = rec.isUpdatable == "YES" || rec.isUpdatable == 1; // true,false
						field.scale = rec.numericScale; // > 0 // 3,2,1
						field.precision = rec.numericPrecision; // > 0
						field.default = rec.columnDefault; // 'pt-br'::character varying
						field.description = rec.description;

						if (field.notNull == true) schema.required.push(fieldName);

						if (rec.dataType.trim().toLowerCase().startsWith("character") == true)
							field.maxLength = rec.characterMaximumLength; // > 0 // 255
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
						field.identityGeneration = rec.identityGeneration;//.trim().toLowerCase(); // BY DEFAULT,ALWAYS
						// SERIAL TYPE
						if (rec.default != undefined && rec.default.startsWith("nextval")) field.identityGeneration = "BY DEFAULT";
						schema.properties[fieldName] = field;
					} else {
						console.error(`DbClientPostgres.getTablesInfo().processColumns() : Invalid Database Type : ${rec.dataType.trim().toLowerCase()}, full rec : ${JSON.stringify(rec)}`);
					}
				}

				return openapi;
			});
		};

		return processColumns().
		then(openapi => processConstraints(openapi));
	}

}

export {DbClientPostgres}
