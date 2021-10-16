import pg from "pg";
import pgCamelCase from "pg-camelcase";
import Firebird from "node-firebird";
//import FirebirdNative from "node-firebird";//firebird
import {OpenApi} from "./webapp/es6/OpenApi.js";
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
				const query = text.replace(/\$([0-9]+)/g, (m, v) => {
					const index = parseInt(v) - 1;
//					console.log(index);
//					console.log(values[index]);
					return JSON.stringify(values[index]).replace(/"/g, "'");
				});
//				console.log(query);
			} else {
//				console.log(text);
			}
		}

		submit.apply(this, arguments);
	};
}

class SqlAdapterNodeFirebird {

	constructor(config) {
		this.config = config;
		this.enableParams = true;
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
/*
sudo su -
echo 'AuthServer = Srp, Legacy_Auth' >> /etc/firebird/3.0/firebird.conf;
echo 'WireCrypt = Disabled' >> /etc/firebird/3.0/firebird.conf;
echo 'UserManager = Legacy_UserManager' >> /etc/firebird/3.0/firebird.conf;
exit;

sudo cp *.fdb /var/lib/firebird/3.0/data/;
sudo chown firebird:firebird /var/lib/firebird/3.0/data/*.fdb;
sudo chmod ugo+rw /var/lib/firebird/3.0/data/*.fdb;

sudo systemctl restart firebird3.0
sudo tail -s 1 -f /var/log/firebird/firebird3.0.log

sed data.fcols.push(lowercase_keys ? underscoreToCamel(output[i].alias.toLowerCase()) : output[i].alias);

*/
	connect() {
		return new Promise((resolve, reject) => {
			const options = {
				host: this.config.host, 
				port: Number.parseInt(this.config.port), 
				database: this.config.database, 
				user: this.config.user, 
				lowercase_keys: true,
				password: this.config.password
			};

			Firebird.attach(options, (err, db) => {
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

			this.client.query(sql, params, (err, result, meta, isSelect) => {
				if (err) {
					reject(err);
				} else {
					const listFiledNamesString = [];

					for (const field of meta) {
						if ([14, 37, 448, 452].includes(field.type)) {
							listFiledNamesString.push(CaseConvert.underscoreToCamel(field.alias.toLowerCase()));
						}
					}

					for (const obj of result) {
						for (let fieldName of listFiledNamesString) {
							let value = obj[fieldName];
							if (value == null) continue;
							obj[fieldName] = value.toString().trim();
						}
					}

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
		config.idleTimeoutMillis = 86400; // how long a client is allowed to remain idle before being closed
		console.log(`[${this.constructor.name}.constructor(${JSON.stringify(config)})]`);
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
		return this.client.connect().then(res => {
			this.client.on('error', e => {
				console.error(`[${this.constructor.name}.connect()] :`, e);
				// TODO : verificar se deve reconectar
				// this.connect();
			});
			return res;
		});
	}

	end() {
		return this.client.end();
	}

	query(sql, params){
		return this.client.query(sql, params);
	}

}

class DbClientPostgres {

	constructor(dbConfig, options) {
		this.limitQuery = 1000;
		this.limitQueryExceptions = [];
		this.dbConfig = {};
		this.options = options || {};
		if (this.options.missingPrimaryKeys == null) this.options.missingPrimaryKeys = {};
		if (this.options.missingForeignKeys == null) this.options.missingForeignKeys = {};
		if (this.options.aliasMap == null) this.options.aliasMap = {};
		this.options.aliasMapExternalToInternal = {};

		if (dbConfig != undefined) {
			if (dbConfig.host != undefined) this.dbConfig.host = dbConfig.host;
			if (dbConfig.port != undefined) this.dbConfig.port = dbConfig.port;
			if (dbConfig.database != undefined) this.dbConfig.database = dbConfig.database;
			if (dbConfig.user != undefined) this.dbConfig.user = dbConfig.user;
			if (dbConfig.password != undefined) this.dbConfig.password = dbConfig.password;
			// const connectionString = 'postgresql://dbuser:secretpassword@database.server.com:3211/mydb'
			if (dbConfig.connectionString != undefined) this.dbConfig.connectionString = dbConfig.connectionString;
			if (dbConfig.limitQuery != undefined) this.limitQuery = dbConfig.limitQuery;
			if (dbConfig.limitQueryExceptions != undefined) this.limitQueryExceptions = Array.isArray(dbConfig.limitQueryExceptions) == true ? dbConfig.limitQueryExceptions : dbConfig.limitQueryExceptions.split(",");
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
		this.rufsTypes = ["boolean","string"           ,"string"   ,"integer","object", "number" , "date-time"                  , "date-time"               , "date-time"             , "integer", "integer" , "string", "date-time"     , "number"          , "string"];
	}

	connect() {
		return this.client.connect();
	}

	disconnect() {
		return this.client.end();
	}

	buildQuery(queryParams, params, orderBy) {
		if (queryParams == null) return "";

		const buildConditions = (queryParams, params, operator, conditions) => {
			for (let [fieldName, field] of Object.entries(queryParams)) {
				if (this.options.aliasMapExternalToInternal[fieldName] != null) fieldName = this.options.aliasMapExternalToInternal[fieldName];
				let condition;
				const paramId = this.client instanceof SqlAdapterNodeFirebird ? `?` : `$${params.length+1}`;

				if (Array.isArray(field)) {
					condition = CaseConvert.camelToUnderscore(fieldName, false) + operator + " ANY (" + paramId + ")";
				} else {
					condition = CaseConvert.camelToUnderscore(fieldName, false) + operator + paramId;
				}

				conditions.push(condition);
				params.push(field);
			}

			return conditions;
		}

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
			const orderByInternal = [];
//			console.log(orderBy);
//			console.log(this.options.aliasMapExternalToInternal);

			for (let fieldName of orderBy) {
				const pos = fieldName.indexOf(" ");
				let extra = "";

				if (pos >= 0) {
					extra = fieldName.substring(pos);
					fieldName = fieldName.substring(0, pos);
				}

				if (this.options.aliasMapExternalToInternal[fieldName] != null) fieldName = this.options.aliasMapExternalToInternal[fieldName];
				orderByInternal.push(CaseConvert.camelToUnderscore(fieldName, false) + extra);
			}

			str = str + " ORDER BY " + orderByInternal.join(",");
		}

		return str;
	}

	buildInsertSql(tableName, obj, params) {
		const sqlStringify = value => {
			if (typeof value == "string") value = "'" + value + "'";
			if (value instanceof Date) value = "'" + value.toISOString() + "'";
			return value;
		}

		tableName = CaseConvert.camelToUnderscore(tableName, false);
		var i = 1;
		const strFields = [];
		const strValues = [];

		for (let [fieldName, value] of Object.entries(obj)) {
			if (this.options.aliasMapExternalToInternal[fieldName] != null) fieldName = this.options.aliasMapExternalToInternal[fieldName];
			strFields.push(CaseConvert.camelToUnderscore(fieldName, false));
			const paramId = this.client instanceof SqlAdapterNodeFirebird ? `?` : `$${i}`;
			strValues.push(params != undefined ? paramId : sqlStringify(value));

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

	find(schemaName, queryParams, orderBy) {
		const tableName = CaseConvert.camelToUnderscore(schemaName, false);
		const params = this.client.enableParams ? [] : null;
		const sqlQuery = this.buildQuery(queryParams, params, orderBy);
		let fieldsOut = "*";

		if (this.openapi != null) {
			const schema = OpenApi.getSchemaFromSchemas(this.openapi, schemaName);

			if (schema != null && schema.properties != null) {
				let count = 0;
				const names = [];

				for (let [fieldName, property] of Object.entries(schema.properties)) {
					if (property.internalName != null) {
						count++;
						names.push(CaseConvert.camelToUnderscore(property.internalName, false) + " as " + CaseConvert.camelToUnderscore(fieldName, false));
					} else {
						names.push(CaseConvert.camelToUnderscore(fieldName, false));
					}
				}

				if (count > 0) fieldsOut = names.join(",");
			}
		}

		let sqlFirst = "";
		let sqlLimit = "";

		if (this.limitQueryExceptions.includes(tableName) == false) {
			if (this.client instanceof SqlAdapterNodeFirebird) {
				sqlFirst =  `FIRST ${this.limitQuery}`;
			} else {
				sqlLimit =  `LIMIT ${this.limitQuery}`;
			}
		}

		const sql = `SELECT ${sqlFirst} ${fieldsOut} FROM ${tableName} ${sqlQuery} ${sqlLimit}`;
		console.log(sql);
		return this.client.query(sql, params).then(result => {
//			if (result.rows.length > 0) console.log(result.rows[0]);
			return result.rows;
		});
	}

	findOne(tableName, queryParams) {
		return this.find(tableName, queryParams).
		then(rows => {
			if (rows.length == 0) {
				throw new Error(`NoResultException for ${tableName} : ${JSON.stringify(queryParams)}`);
			}

			return rows[0]
		});
	}

	findMax(tableName, fieldName, queryParams) {
		tableName = CaseConvert.camelToUnderscore(tableName, false);
		const params = this.client.enableParams ? [] : undefined;
		const sql = "SELECT MAX(" + fieldName + ") FROM " + tableName + this.buildQuery(queryParams, params);
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0].max;
		});
	}

	update(tableName, primaryKey, obj) {
		tableName = CaseConvert.camelToUnderscore(tableName, false);
		const params = this.client.enableParams ? [] : undefined;
		var i = 1;
		const list = [];

		for (let [fieldName, value] of Object.entries(obj)) {
			const paramId = this.client instanceof SqlAdapterNodeFirebird ? `?` : `$${i}`;
			list.push(CaseConvert.camelToUnderscore(fieldName, false)+ "=" + (params != undefined ? paramId : this.sqlStringify(value)));

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

		const sql = `UPDATE ${tableName} SET ${list.join(",")}` + this.buildQuery(primaryKey, params) + " RETURNING *";
		
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
		tableName = CaseConvert.camelToUnderscore(tableName, false);
		const params = this.client.enableParams ? [] : undefined;
		const sql = "DELETE FROM " + tableName + this.buildQuery(primaryKey, params) + " RETURNING *";
		return this.client.query(sql, params).then(result => {
			if (result.rowCount == 0) {
				throw new Error("NoResultException");
			}

			return result.rows[0]
		});
	}

	getOpenApi(openapi, options) {
		const getFieldName = (columnName, field) => {
			let fieldName = CaseConvert.underscoreToCamel(columnName.trim().toLowerCase(), false);
			const fieldNameLowerCase = fieldName.toLowerCase();

			for (let [aliasMapName, value] of Object.entries(this.options.aliasMap)) {
				if (aliasMapName.toLowerCase() == fieldNameLowerCase) {
					if (field != null) {
						field.internalName = fieldName;

						if (value != null && value.length > 0) {
							this.options.aliasMapExternalToInternal[value] = fieldName;
						}
					}

					fieldName = value != null && value.length > 0 ? value : aliasMapName;
					break;
				}
			}

			return fieldName;
		}

		const setRef = (schema, fieldName, tableRef) => {
			const field = schema.properties[fieldName];

			if (field != undefined) {
				field.$ref = "#/components/schemas/" + tableRef;
			} else {
				console.error(`${this.constructor.name}.getTablesInfo.processConstraints.setRef : field ${fieldName} not exists in schema ${schema.name}`);
			}
		}

		const processConstraints = schemas => {
			return this.client.query(this.client.sqlInfoConstraints).
			then(result => {
				return this.client.query(this.client.sqlInfoConstraintsFields).
				then(resultFields => {
					return this.client.query(this.client.sqlInfoConstraintsFieldsRef).
					then(resultFieldsRef => {
						for (let [schemaName, schema] of Object.entries(schemas)) {
							schema.primaryKeys = [];
							schema.foreignKeys = {};
							schema.uniqueKeys = {};
							const tableName = CaseConvert.camelToUnderscore(schemaName, false);
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
										foreignKey.fields.push(getFieldName(item.columnName));
									}

									for (let itemRef of listRef) {
										foreignKey.fieldsRef.push(getFieldName(itemRef.columnName));
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
										schema.uniqueKeys[name].push(getFieldName(item.columnName));
									}
								} else if (constraint.constraintType.toString().trim() == "PRIMARY KEY") {
									for (let item of list) {
										const fieldName = getFieldName(item.columnName);
										schema.primaryKeys.push(fieldName);
										if (schema.required.indexOf(fieldName) < 0) schema.required.push(fieldName);
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

							if (this.options.missingPrimaryKeys != null && Array.isArray(this.options.missingPrimaryKeys[schemaName]) == true) {
								for (const columnName of this.options.missingPrimaryKeys[schemaName]) {
									schema.primaryKeys.push(columnName);
									if (schema.required.indexOf(columnName) < 0) schema.required.push(columnName);
								}
							}

							if (this.options.missingForeignKeys != null && this.options.missingForeignKeys[schemaName] != null) {
								for (let [fieldName, tableRef] of Object.entries(this.options.missingForeignKeys[schemaName])) {
									setRef(schema, fieldName, tableRef);
								}
							}

							if (schema.required.length == 0) {
								console.error(`[${this.constructor.name}.getOpenApi().processColumns()] missing required fields of table ${schemaName}`);
//								delete openapi.components.schemas[schemaName];
							}
						}

						return schemas;
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
				const schemas = {};

				for (let rec of result.rows) {
					let typeIndex = this.sqlTypes.indexOf(rec.dataType.trim().toLowerCase());

					if (typeIndex >= 0) {
						const tableName = CaseConvert.underscoreToCamel(rec.tableName.trim().toLowerCase(), false);
						let schema;

						if (schemas[tableName] != undefined) {
							schema = schemas[tableName];
						} else {
							schemas[tableName] = schema = {};
							schema.type = "object";
							schema.properties = {};
						}

						if (schema.required == undefined) schema.required = [];

						let field = {}
						const fieldName = getFieldName(rec.columnName, field);
						field.unique = undefined;
						field.type = this.rufsTypes[typeIndex]; // LocalDateTime,ZonedDateTime,Date,Time
						if (field.type == "date-time") field.format = "date-time";
						field.nullable = rec.isNullable == "YES" || rec.isNullable == 1; // true,false
						field.updatable = rec.isUpdatable == "YES" || rec.isUpdatable == 1; // true,false
						field.scale = rec.numericScale; // > 0 // 3,2,1
						field.precision = rec.numericPrecision; // > 0
						field.default = rec.columnDefault; // 'pt-br'::character varying
						field.description = rec.description;

						if (field.nullable != true) {
							schema.required.push(fieldName);
							field.essential = true;
						}

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

				return schemas;
			});
		};

		return processColumns().
		then(schemas => processConstraints(schemas)).
		then(schemas => {
			if (options == null) options = {};
			options.schemas = schemas;
			if (openapi == null) openapi = {};
			this.openapi = openapi;
			return OpenApi.fillOpenApi(openapi, options);
		});
	}

}

export {DbClientPostgres}
