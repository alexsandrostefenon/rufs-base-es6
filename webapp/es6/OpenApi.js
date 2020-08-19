import {CaseConvert} from "./CaseConvert.js";

class OpenApi {

	static create(openapi, security) {
		if (openapi.openapi == undefined) openapi.openapi = "3.0.3";
		if (openapi.info == undefined) {
			openapi.info = {"title": "rufs-base-es6 openapi genetator", "version": "1.0.0", "description": "CRUD operations"};
			openapi.info.contact = {
			  "name": "API Support",
			  "url": "http://www.example.com/support",
			  "email": "support@example.com"
			};
		}

		if (openapi.servers == undefined) {
			openapi.servers = [];
		}

		if (openapi.paths == undefined) openapi.paths = {};
		if (openapi.components == undefined) openapi.components = {};
		if (openapi.components.schemas == undefined) openapi.components.schemas = {};
		if (openapi.components.parameters == undefined) openapi.components.parameters = {};
		if (openapi.components.requestBodies == undefined) openapi.components.requestBodies = {};
		if (openapi.components.responses == undefined) openapi.components.responses = {};

		if (openapi.components.securitySchemes == undefined) {
			const securitySchemes = {};
			securitySchemes.jwt = {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"};
			securitySchemes.apiKey = {"type": "apiKey", "in": "header", "name": "X-API-KEY"};
			securitySchemes.basic = {"type": "http", "scheme": "basic"};
			openapi.components.securitySchemes = securitySchemes;
		}

		if (openapi.security == undefined) {
			const securityItem = {};
			if (security != undefined) securityItem[security] = [];
			openapi.security = [securityItem];
		}

		if (openapi.tags == undefined) openapi.tags = [];
		return openapi;
	}

	static copy(dest, source, roles) {
		dest.openapi = source.openapi;
		dest.info = source.info;
		dest.servers = source.servers;
		dest.components.securitySchemes = source.components.securitySchemes;
		dest.security = source.security;
		dest.tags = source.tags;

		for (let [schemaName, role] of Object.entries(roles)) {
			const pathIn = source.paths["/"+schemaName];
			const pathOut = dest.paths["/"+schemaName] = {};
			// TODO : alterar UserController para não usar valores default
			const defaultAccess = {get: true, post: false, patch: false, put: false, delete: false};

			for (const [method, value] of Object.entries(defaultAccess)) {
				if (role[method] == undefined) role[method] = value;
			}

			for (let [method, value] of Object.entries(role)) {
				if (value == true) pathOut[method] = pathIn[method];
			}

			dest.components.schemas[schemaName] = source.components.schemas[schemaName];
			dest.components.responses[schemaName] = source.components.responses[schemaName];
			dest.components.parameters[schemaName] = source.components.parameters[schemaName];
			dest.components.requestBodies[schemaName] = source.components.requestBodies[schemaName];
		}

		if (dest.components.responses.Error == undefined) dest.components.responses.Error = source.components.responses.Error;
	}

	static mergeSchemas(schemaName, schemaNew, schemaOld) {
		schemaOld = schemaOld != undefined && schemaOld != null ? schemaOld : {};
//		console.log(`[${this.constructor.name}.updateJsonSchema(schemaName: ${schemaName}, schemaNew.properties: ${schemaNew.properties}, schemaOld.properties: ${schemaOld.properties})]`);
		const jsonSchemaTypes = ["boolean", "string", "integer", "number", "date-time", "date"];
		if (schemaNew.properties == undefined) schemaNew.properties = {};
		if (schemaOld.properties == undefined) schemaOld.properties = {};
		let newFields = schemaNew.properties;
		let oldFields = schemaOld.properties;
		if (newFields == undefined) throw new Error(`rufsServiceDbSync.generateJsonSchema(${schemaName}, ${newFields}) : newFields : Invalid Argument Exception`);
		if (typeof(newFields) == "string") newFields = Object.entries(JSON.parse(newFields));
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		if (newFields instanceof Map == false) newFields = Object.entries(newFields);
		let jsonBuilder = {}; 

		for (let [fieldName, field] of newFields) {
			if (field.type == undefined) field.type = "string";

			if (field.hiden == undefined && field.identityGeneration != undefined) {
				field.hiden = true;
			}

			if (field.readOnly == undefined && field.identityGeneration != undefined) field.readOnly = true;

			if (jsonSchemaTypes.indexOf(field.type) < 0) {
				console.error(`${schemaName} : ${fieldName} : Unknow type : ${field.type}`);
				continue;
			}
			// type (columnDefinition), readOnly, hiden, primaryKey, required (insertable), updatable, default, length, precision, scale 
			let jsonBuilderValue = {};
			// registra conflitos dos valores antigos com os valores detectados do banco de dados
			jsonBuilderValue["type"] = field.type;
			jsonBuilderValue["format"] = field.format;

			if (field.updatable == false) {
				jsonBuilderValue["updatable"] = false;
			}

			if (field.maxLength > 0) {
				jsonBuilderValue["maxLength"] = field.maxLength;
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
			if (field.$ref != undefined) {
				jsonBuilderValue["$ref"] = field.$ref;
			}

			jsonBuilderValue["default"] = field.default;
			jsonBuilderValue["unique"] = field.unique;
			jsonBuilderValue["identityGeneration"] = field.identityGeneration;
			jsonBuilderValue["isClonable"] = field.isClonable;
			jsonBuilderValue["hiden"] = field.hiden;
			jsonBuilderValue["readOnly"] = field.readOnly;
			jsonBuilderValue["description"] = field.description;
			// oculta tipos incompatíveis
			if (jsonBuilderValue["type"] != "string") {
				delete jsonBuilderValue["length"];
			}

			if (jsonBuilderValue["type"] != "number") {
				delete jsonBuilderValue["precision"];
				delete jsonBuilderValue["scale"];
			}
			// habilita os campos PLENAMENTE não SQL
			jsonBuilderValue.title = field.title;
			jsonBuilderValue.document = field.document;
			jsonBuilderValue.enum = field.enum;
			jsonBuilderValue.enumLabels = field.enumLabels;
			jsonBuilderValue.sortType = field.sortType;
			jsonBuilderValue.orderIndex = field.orderIndex;
			jsonBuilderValue.tableVisible = field.tableVisible;
			jsonBuilderValue.shortDescription = field.shortDescription;
			// exceções
			if (oldFields != undefined && oldFields[fieldName] != undefined) {
				let fieldOriginal = oldFields[fieldName];
				// copia do original os campos PLENAMENTE não SQL
				jsonBuilderValue.title = fieldOriginal.title;
				jsonBuilderValue.document = fieldOriginal.document;
				jsonBuilderValue.enum = fieldOriginal.enum;
				jsonBuilderValue.enumLabels = fieldOriginal.enumLabels;
				jsonBuilderValue.sortType = fieldOriginal.sortType;
				jsonBuilderValue.orderIndex = fieldOriginal.orderIndex;
				jsonBuilderValue.tableVisible = fieldOriginal.tableVisible;
				jsonBuilderValue.shortDescription = fieldOriginal.shortDescription;
				// registra conflitos dos valores antigos com os valores detectados do banco de dados
				const exceptions = ["service", "isClonable", "hiden", "$ref"];

				for (let subFieldName in fieldOriginal) {
					if (exceptions.indexOf(subFieldName) < 0 && fieldOriginal[subFieldName] != jsonBuilderValue[subFieldName]) {
						console.warn(`rufsServiceDbSync.generateJsonSchema() : table [${schemaName}], field [${fieldName}], property [${subFieldName}] conflict previous declared [${fieldOriginal[subFieldName]}] new [${jsonBuilderValue[subFieldName]}]\nold:\n`, fieldOriginal, "\nnew:\n", jsonBuilderValue);
					}
				}
				// copia do original os campos PARCIALMENTE não SQL
				if (fieldOriginal.isClonable != undefined) jsonBuilderValue.isClonable = fieldOriginal.isClonable;
				if (fieldOriginal.readOnly != undefined) jsonBuilderValue.readOnly = fieldOriginal.readOnly;
				if (fieldOriginal.hiden != undefined) jsonBuilderValue.hiden = fieldOriginal.hiden;
			}
			// oculta os valores dafault
			const defaultValues = {updatable: true, maxLength: 255, precision: 9, scale: 3, hiden: false, primaryKey: false, required: false};

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

		const schema = {};
		schema.properties = jsonBuilder;
		schema.primaryKeys = schemaNew.primaryKeys;
		schema.uniqueKeys = schemaNew.uniqueKeys;
		schema.foreignKeys = schemaNew.foreignKeys;
		return schema;
	}

	static convertRufsToStandartSchema(schema) {
		const standartSchema = {};
		standartSchema.type = schema.type || "object";

		if (Array.isArray(schema.required) == true) {
			standartSchema.required = schema.required;
		} else {
			standartSchema.required = [];
		}

		if (schema.primaryKeys && schema.primaryKeys.length > 0) standartSchema["x-primaryKeys"] = schema.primaryKeys;
		standartSchema["x-uniqueKeys"] = schema.uniqueKeys;
		standartSchema["x-foreignKeys"] = schema.foreignKeys;
		standartSchema.properties = {};

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			let property = {};
			const type = field.type;

			if (type == "date-time" || type == "date") {
				property.type = "string";
				property.format = type;
			} else {
				property.type = type;
			}

			if (field.description) property.description = field.description;
			if (field.default) property.default = field.default;
			if (field.enum) property.enum = field.enum;

			if (type == "object") {
				if (field.$ref) {
					property.$ref = field.$ref;
				} else {
					if (field.properties != undefined) {
						property = this.convertRufsToStandartSchema(field);
					} else {
						console.error(`[${this.constructor.name}.convertRufsToStandartSchema()] : missing "properties" in field ${fieldName} from schema :`, schema);
					}
				}
			} else if (type == "array") {
				if (field.items) {
					if (field.items.type == "object") {
						if (field.items.$ref) {
							property.items = {};
							property.items.$ref = field.items.$ref;
						} else {
							if (field.items.properties != undefined) {
								property.items = this.convertRufsToStandartSchema(field.items);
							} else {
								console.error(`[${this.constructor.name}.convertRufsToStandartSchema()] : missing "properties" in field ${fieldName} from schema :`, schema);
							}
						}
					} else {
						property.items = field.items;
					}
				}

				if (field.hiden) property["x-hiden"] = field.hiden;
				if (field.internalName) property["x-internalName"] = field.internalName;
			} else {
				if (field.example) property.example = field.example;
				if (field.required) property["x-required"] = field.required;
				if (field.$ref) property["x-$ref"] = field.$ref;
				if (field.hiden) property["x-hiden"] = field.hiden;
				if (field.internalName) property["x-internalName"] = field.internalName;
				if (field.identityGeneration) property["x-identityGeneration"] = field.identityGeneration;
				if (field.notNull) property["x-notNull"] = field.notNull;
				if (field.updatable) property["x-updatable"] = field.updatable;
				if (field.scale) property["x-scale"] = field.scale;
				if (field.precision) property["x-precision"] = field.precision;
				if (field.maxLength) property.maxLength = field.maxLength;
				if (field.pattern) property.pattern = field.pattern;
				if (field.format) property.format = field.format;
			}

			if (field.required == true && standartSchema.required.indexOf(fieldName) < 0)
				standartSchema.required.push(fieldName);

			standartSchema.properties[fieldName] = property;
		}

		return standartSchema;
	}

	static convertRufsToStandart(openapi) {
		const standartSchemas = {};

		for (let [name, schema] of Object.entries(openapi.components.schemas)) {
			standartSchemas[name] = this.convertRufsToStandartSchema(schema);
		}

		const standartOpenApi = {};
		standartOpenApi.openapi = openapi.openapi;
		standartOpenApi.info = openapi.info;
		standartOpenApi.servers = openapi.servers;
		standartOpenApi.paths = openapi.paths;
		standartOpenApi.components = {};
		standartOpenApi.components.schemas = standartSchemas;
		standartOpenApi.components.parameters = openapi.components.parameters;
		standartOpenApi.components.requestBodies = {};

		for (let [name, requestBodyObject] of Object.entries(openapi.components.requestBodies)) {
			const standartRequestBodyObject = standartOpenApi.components.requestBodies[name] = {"required": true, "content": {}};

			for (let [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
				standartRequestBodyObject.content[mediaTypeName] = {};

				if (mediaTypeObject.schema.properties != undefined) {
					standartRequestBodyObject.content[mediaTypeName].schema = this.convertRufsToStandartSchema(mediaTypeObject.schema);
				} else {
					standartRequestBodyObject.content[mediaTypeName].schema = mediaTypeObject.schema;
				}
			}
		}

		standartOpenApi.components.responses = openapi.components.responses;
		standartOpenApi.components.securitySchemes = openapi.components.securitySchemes;
		standartOpenApi.security = openapi.security;
		standartOpenApi.tags = openapi.tags;
		return standartOpenApi;
	}

	static convertStandartToRufs(openapi) {
		const convertSchema = schema => {
			if (schema["x-primaryKeys"] != undefined) {
				schema.primaryKeys = schema["x-primaryKeys"];
				delete schema["x-primaryKeys"];
			}

			if (schema["x-uniqueKeys"] != undefined) {
				schema.uniqueKeys = schema["x-uniqueKeys"];
				delete schema["x-uniqueKeys"];
			}

			if (schema["x-foreignKeys"] != undefined) {
				schema.foreignKeys = schema["x-foreignKeys"];
				delete schema["x-foreignKeys"];
			}

			if (schema.required == undefined) schema.required = [];
			const skypes = ["x-$ref", "x-hiden", "x-internalName", "x-identityGeneration", "x-notNull", "x-updatable", "x-scale", "x-precision"];

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				delete field["x-required"];
				if (schema.required.indexOf(fieldName) >= 0) field.required = true;

				if (field.format == "date-time" || field.format == "date") {
					field.type = field.format;
				}

				for (let skypeName of skypes) {
					if (field[skypeName] != undefined) {
						field[skypeName.substring(2)] = field[skypeName];
						delete field[skypeName];
					}
				}

				if (field.type == "object" && field.properties != undefined) {
					convertSchema(field);
				} else if (field.type == "array" && field.items && field.items.type == "object" && field.items.properties != undefined) {
					convertSchema(field.items);
				}
			}
		}

		for (let [name, schema] of Object.entries(openapi.components.schemas)) convertSchema(schema);

		for (let [name, requestBodyObject] of Object.entries(openapi.components.requestBodies)) {
			for (let [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
				if (mediaTypeObject.schema.properties != undefined) convertSchema(mediaTypeObject.schema);
			}
		}

		return openapi;
	}

	static copyValue(field, value) {
		let ret;
		const type = field["type"];

		if (type == undefined || type == "string") {
			ret = value;
		} else if (type == "number" || type == "integer") {
			if (typeof value == "string") {
				ret = new Number(value).valueOf();
			} else {
				ret = value;
			}
		} else if (type == "boolean") {
			if (value == true)
				ret = true;
			else if (value == false)
				ret = false;
			else
				ret = (value == "true");
		} else if (type == "date" || type == "date-time") {
			ret = new Date(value);
		} else {
			ret = value;
		}

		return ret;
	}

	static copyToInternalName(schema, dataIn) {
		const copy = (property, valueIn) => {
			if (property.type == "object" && property.properties != undefined) {
				return this.copyToInternalName(property, valueIn);
			} else if (property.type == "array" && property.items != undefined && property.items.properties != undefined) {
				const valueOut = [];
				for (const val of valueIn) valueOut.push(this.copyToInternalName(property.items, val));
				return valueOut;
			} else {
				return this.copyValue(property, valueIn);
			}
		}

		const dataOut = {};

		for (let [name, property] of Object.entries(schema.properties)) {
			if (property.internalName != undefined) {
				dataOut[property.internalName] = copy(property, dataIn[name]);
			} else {
				dataOut[name] = copy(property, dataIn[name]);
			}
		}

		return dataOut;
	}

	static copyFromInternalName(schema, dataIn, caseInsensitive) {
		const copy = (property, valueIn) => {
			if (property.type == "object" && property.properties != undefined) {
				return this.copyFromInternalName(property, valueIn, caseInsensitive);
			} else if (property.type == "array" && property.items != undefined && property.items.properties != undefined && Array.isArray(valueIn)) {
				const valueOut = [];
				for (const val of valueIn) valueOut.push(this.copyFromInternalName(property.items, val, caseInsensitive));
				return valueOut;
			} else {
				return this.copyValue(property, valueIn);
			}
		}

		const dataOut = {};
		console.log(`[${this.constructor.name}.copyFromInternalName] dataIn :`, dataIn);

		for (let [name, property] of Object.entries(schema.properties)) {
			if (property.internalName != undefined) {
				if (caseInsensitive == true) {
					for (let fieldName in dataIn) {
						if (fieldName.toLowerCase() == property.internalName.toLowerCase()) {
							dataOut[name] = copy(property, dataIn[fieldName]);
						}
					}
				} else {
					dataOut[name] = copy(property, dataIn[property.internalName]);
				}
			} else {
				if (caseInsensitive == true) {
					for (let fieldName in dataIn) if (fieldName.toLowerCase() == name.toLowerCase()) dataOut[name] = copy(property, dataIn[fieldName]);
				} else {
					dataOut[name] = copy(property, dataIn[name]);
				}
			}
		}

		console.log(`[${this.constructor.name}.copyFromInternalName] dataOut :`, dataOut);
		return dataOut;
	}
	// public
	static copyFields(dataIn, schema) {
		const ret = {};

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			const value = dataIn[fieldName];
			if (value != undefined) ret[fieldName] = this.copyValue(field, value);
		}

		return ret;
	}
//{"methods": ["get", "post"], "schemas": responseSchemas, parameterSchemas, requestSchemas}
	static fillOpenApi(openapi, options) {
		if (openapi.paths == undefined) openapi.paths = {};
		if (openapi.components == undefined) openapi.components = {};
		if (openapi.components.schemas == undefined) openapi.components.schemas = {};
		if (openapi.components.responses == undefined) openapi.components.responses = {};
		if (openapi.components.parameters == undefined) openapi.components.parameters = {};
		if (openapi.components.requestBodies == undefined) openapi.components.requestBodies = {};
		if (openapi.tags == undefined) openapi.tags = [];
		//
		if (options == undefined) options = {};
		if (options.requestBodyContentType == undefined) options.requestBodyContentType = "application/json"
		if (options.methods == undefined) options.methods = ["get", "put", "post", "delete", "patch"];
		if (options.parameterSchemas == undefined) options.parameterSchemas = {};
		if (options.requestSchemas == undefined) options.requestSchemas = {};
		if (options.responseSchemas == undefined) options.responseSchemas = {};

		if (options.schemas == undefined) {
			options.schemas = openapi.components.schemas;
		} else {
			for (let [schemaName, schema] of Object.entries(options.schemas)) {
				openapi.components.schemas[schemaName] = schema;
			}
		}
		// add components/responses with error schema
		const schemaError = {"type": "object", "properties": {"code": {"type": "integer"}, "description": {"type": "string"}}, "required": ["code", "description"]};
		openapi.components.responses["Error"] = {"description": "Error response", "content": {"application/json": {"schema": schemaError}}};

		for (let [schemaName, schema] of Object.entries(options.schemas)) {
			if (schema.primaryKeys == undefined) schema.primaryKeys = [];
			openapi.tags.push({"name": schemaName});
			const referenceToSchema = {"$ref": `#/components/schemas/${schemaName}`};
			// fill components/requestBody with schemas
			openapi.components.requestBodies[schemaName] = {"required": true, "content": {}};
			openapi.components.requestBodies[schemaName].content[options.requestBodyContentType] = {"schema": options.requestSchemas[schemaName] || referenceToSchema};
			// fill components/responses with schemas
			openapi.components.responses[schemaName] = {"description": "response", "content": {}};
			openapi.components.responses[schemaName].content[options.responseContentType] = {"schema": options.responseSchemas[schemaName] || referenceToSchema};
			// fill components/parameters with primaryKeys
			if (options.parameterSchemas[schemaName] != undefined) {
				openapi.components.parameters[schemaName] = {"name": "main", "in": "query", "required": true, "schema": OpenApi.convertRufsToStandartSchema(options.parameterSchemas[schemaName])};
			} else if (schema.primaryKeys.length > 0) {
				const schemaPrimaryKey = {"type": "object", "properties": {}, "required": schema.primaryKeys};

				for (const primaryKey of schema.primaryKeys) {
					schemaPrimaryKey.properties[primaryKey] = schema.properties[primaryKey];
				}

				openapi.components.parameters[schemaName] = {"name": "primaryKey", "in": "query", "required": true, "schema": OpenApi.convertRufsToStandartSchema(schemaPrimaryKey)};
			}
			// path
			const pathName = `/${schemaName}`;
			const pathItemObject = openapi.paths[pathName] = {};
			const responsesRef = {"200": {"$ref": `#/components/responses/${schemaName}`}, "default": {"$ref": `#/components/responses/Error`}};
			const parametersRef = [{"$ref": `#/components/parameters/${schemaName}`}];
			const requestBodyRef = {"$ref": `#/components/requestBodies/${schemaName}`};

			const methods =                ["get", "put", "post", "delete", "patch"];
			const methodsHaveParameters =  [true , true , false , true    , true   ];
			const methodsHaveRequestBody = [false, true , true  , false   , true   ];

			for (let i = 0; i < methods.length; i++) {
				const method = methods[i];
				if (options.methods.includes(method) == false) continue;
				const operationObject = {"operationId": `${method}_${schemaName}`};

				if (methodsHaveParameters[i] == true && openapi.components.parameters[schemaName] != undefined) operationObject.parameters = parametersRef;
				if (methodsHaveRequestBody[i] == true) operationObject.requestBody = requestBodyRef;
				operationObject.responses = responsesRef;
				operationObject.tags = [schemaName];
				operationObject.description = `CRUD ${method} operation over ${schemaName}`;

				if (methodsHaveParameters[i] == false || operationObject.parameters != undefined) {
					pathItemObject[method] = operationObject;
				}
			}
		}
	}

	static getSchemaName($ref) {
		if ($ref.startsWith("#") == false) return $ref;
		let ret = $ref;
		const pos = $ref.lastIndexOf("/");

		if (pos >= 0) {
			ret = $ref.substring(pos+1);
		}

		return ret;
	}

	static getSchemaFromSchemas(openapi, schemaName) {
		schemaName = this.getSchemaName(schemaName);
		return openapi.components.schemas[schemaName];
	}

	static getSchemaFromRequestBodies(openapi, schemaName) {
		schemaName = this.getSchemaName(schemaName);
		const requestBodyObject = openapi.components.requestBodies[schemaName];

		if (requestBodyObject == undefined)
			return undefined;

		let schema;

		for (const [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
			if (mediaTypeObject.schema.properties != undefined) {
				schema = mediaTypeObject.schema;
				break;
			}
		}

		return schema;
	}

	static getPropertyFromSchemas(openapi, schemaName, propertyName) {
		let field;
		const schema = this.getSchemaFromSchemas(openapi, schemaName);

		if (schema != undefined)
			field = schema.properties[propertyName];

		return field;
	}

	static getPropertyFromRequestBodies(openapi, schemaName, propertyName) {
		let field;
		const schema = this.getSchemaFromRequestBodies(openapi, schemaName);

		if (schema != undefined)
			field = schema.properties[propertyName];

		return field;
	}

	static getProperty(openapi, schemaName, propertyName, localSchemas) {
		schemaName = this.getSchemaName(schemaName);
		let field;

		if (localSchemas && localSchemas[schemaName] && localSchemas[schemaName].properties)
			field = localSchemas[schemaName].properties[propertyName];

		if (field == undefined) {
			field = OpenApi.getPropertyFromSchemas(openapi, schemaName, propertyName);

			if (field == undefined)
				field = OpenApi.getPropertyFromRequestBodies(openapi, schemaName, propertyName);
		}

		return field;
	}

	static getPropertiesWithRef(openapi, schemaName, $ref, localSchemas) {
		schemaName = this.getSchemaName(schemaName);
		let list = [];

		const processSchema = (schema, $ref, list) => {
			if (schema == undefined || schema.properties == undefined) return;

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.$ref != undefined) {
					if (field.$ref == $ref && list.find(item => item.fieldName == fieldName) == undefined)
						list.push({fieldName, field});
				}
			}
		}

		if (localSchemas != undefined && localSchemas[schemaName])
			processSchema(localSchemas[schemaName], $ref, list);

		let schema = this.getSchemaFromSchemas(openapi, schemaName);

		if (schema != undefined)
			processSchema(schema, $ref, list);

		schema = this.getSchemaFromRequestBodies(openapi, schemaName);

		if (schema != undefined)
			processSchema(schema, $ref, list);

		return list;
	}

	static getDependencies(openapi, schemaName, list, localSchemas) {
		const processDependency = (schemaName, list) => {
			if (list.includes(schemaName) == false) {
				list.unshift(schemaName);
				this.getDependencies(openapi, schemaName, list, localSchemas);
			}
		}

		const processDependenciesFromSchema = (schema, list) => {
			if (schema == undefined || schema.properties == undefined) return;

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.$ref != undefined) {
					processDependency(this.getSchemaName(field.$ref), list);
				}
			}
		}

		schemaName = this.getSchemaName(schemaName);

		if (list == undefined)
			list = [];

		if (localSchemas != undefined && localSchemas[schemaName] != undefined)
			processDependenciesFromSchema(localSchemas[schemaName], list);

		let schema = this.getSchemaFromRequestBodies(openapi, schemaName);

		if (schema != undefined && schema.properties != undefined)
			processDependenciesFromSchema(schema, list);

		return list;
	}

	static getDependents(openapi, schemaNameTarget, onlyInDocument, localSchemas) {
		const processSchema = (schema, schemaName, schemaNameTarget, onlyInDocument, list) => {
			if (schema == undefined || schema.properties == undefined) return;

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.$ref != undefined) {
					let found = false;
					if (field.$ref == schemaNameTarget || this.getSchemaName(field.$ref) == schemaNameTarget) found = true;

					if (found == true && (onlyInDocument != true || field.type == "object")) {
						if (list.find(item => item.table == schemaName && item.field == fieldName) == undefined) {
							list.push({"table": schemaName, "field": fieldName})
						}
					}
				}
			}
		}

		schemaNameTarget = this.getSchemaName(schemaNameTarget);
		const list = [];

		if (localSchemas) {
			for (let [schemaName, schema] of Object.entries(localSchemas)) {
				processSchema(schema, schemaName, schemaNameTarget, onlyInDocument, list);
			}
		}

		for (let [schemaName, requestBodyObject] of Object.entries(openapi.components.requestBodies)) {
			for (const [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
				processSchema(mediaTypeObject.schema, schemaName, schemaNameTarget, onlyInDocument, list);
			}
		}

		return list;
	}
	// (service, (service.field|foreignTableName)
	static getForeignKeyDescription(openapi, schema, fieldName, localSchemas) {
		let foreignKey = undefined;
		let field = undefined;
		let schemaName = "";

		if (typeof(schema) == "string") {
			schemaName = schema;
			field = OpenApi.getProperty(openapi, schemaName, fieldName, localSchemas);
		} else if (schema.properties != undefined) {
			field = schema.properties[fieldName];
		}

		if (field != undefined) {
			if (field.$ref != undefined) {
				const serviceRef = this.getSchemaFromSchemas(openapi, field.$ref);

				if (serviceRef == undefined) {
					console.log(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : missing service ${field.$ref}`);
					return undefined;
				}

				const fieldsRef = serviceRef.primaryKeys;
				let fields = []

				if (fieldsRef.length == 1) {
					fields = [fieldName];
				} else if (fieldsRef.length > 1) {
					for (let fieldRef of fieldsRef) {
						if (OpenApi.getProperty(openapi, field.$ref, fieldRef, localSchemas) != undefined) {
							fields.push(fieldRef);
						}
					}

					if (fields.length == fieldsRef.length) {
						const pos = fields.indexOf("id");

						if (pos >= 0) fields[pos] = fieldName;
					}
				}

				if (fields.length != fieldsRef.length)
					console.error(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : broken length :`, fields, fieldsRef);

				foreignKey = {fields: fields, tableRef: field.$ref, fieldsRef: fieldsRef};
			}
		} else {
			console.log(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : missing field`);
		}

		return foreignKey;
	}

	static getPrimaryKeyForeign(openapi, schema, fieldName, obj, localSchemas) {
		const process = (openapi, schema, fieldName, obj) => {
			if (schema == undefined || schema.properties == undefined) return;

			const foreignKeyDescription = this.getForeignKeyDescription(openapi, schema, fieldName, localSchemas);

			if (foreignKeyDescription == undefined)
				return undefined;

			const key = {};
			let valid = true;

			if (obj != undefined) {
				for (let i = 0; i < foreignKeyDescription.fields.length; i++) {
					const field = foreignKeyDescription.fields[i];
					const fieldRef = foreignKeyDescription.fieldsRef[i];
					const value = obj[field];
					key[fieldRef] = value;
					if (value == undefined || value == "") valid = false;
				}
			}

			return {"table": foreignKeyDescription.tableRef, "primaryKey": key, "valid": valid};
		}

		let ret = undefined;

		if (typeof schema == "string") {
			schema = this.getSchemaName(schema);

			if (localSchemas && localSchemas[schema])
				ret = process(openapi, localSchemas[schema], fieldName, obj);

			if (ret == undefined)
				ret = process(openapi, this.getSchemaFromRequestBodies(openapi, schema), fieldName, obj);

			if (ret == undefined)
				ret = process(openapi, this.getSchemaFromSchemas(openapi, schema), fieldName, obj);
		} else {
			ret = process(openapi, schema, fieldName, obj);
		}

		return ret;
	}

	static getPrimaryKeyForeignList(openapi, schemaName, obj, localSchemas) {
		const processSchema = (openapi, schema, obj, list) => {
			if (schema == undefined || schema.properties == undefined) return;

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.$ref != undefined) {
					const item = this.getPrimaryKeyForeign(openapi, schemaName, fieldName, obj);

					if (item.valid == true && list.find(candidate => candidate.fieldName == fieldName) == undefined) {
						list.push({"fieldName": fieldName, item});
					}
				}
			}
		}

		schemaName = this.getSchemaName(schemaName);
		const list = [];

		if (localSchemas && localSchemas[schemaName])
			processSchema(openapi, localSchemas[schemaName], obj, list);

		processSchema(openapi, this.getSchemaFromRequestBodies(openapi, schemaName), obj, list);
		processSchema(openapi, this.getSchemaFromSchemas(openapi, schemaName), obj, list);
		return list;
	}

}

export {OpenApi}
