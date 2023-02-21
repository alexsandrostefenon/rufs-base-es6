import {CaseConvert} from "./CaseConvert.js";

class OpenApi {

	static create(openapi, security) {
		if (openapi.openapi == undefined) openapi.openapi = "3.0.3";
		if (openapi.info == undefined) {
			openapi.info = {"title": "rufs-base-es6 openapi genetator", "version": "0.0.0", "description": "CRUD operations"};
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

		if (openapi.components.securitySchemes == null) {
			openapi.components.securitySchemes = {}
		}

		if (openapi.components.securitySchemes.jwt == null) {
			openapi.components.securitySchemes.jwt = {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
		}

		if (openapi.components.securitySchemes.apiKey == null) {
			openapi.components.securitySchemes.apiKey = {"type": "apiKey", "in": "header", "name": "X-API-KEY"}
		}

		if (openapi.components.securitySchemes.basic == null) {
			openapi.components.securitySchemes.basic = {"type": "http", "scheme": "basic"}
		}

		if (openapi.security == null) {
			openapi.security = []
		}
		
		if (security != null) {
			if (security == "jwt" && openapi.security.find(item => item["jwt"] != null) == null) {
				openapi.security.push({"jwt": []})
			}
		}

		if (openapi.tags == undefined) openapi.tags = [];
		return openapi;
	}
/*
	static copy(dest, source, roles) {
		dest.openapi = source.openapi;
		dest.info = source.info;
		dest.servers = source.servers;
		dest.components.securitySchemes = source.components.securitySchemes;
		dest.security = source.security;
		dest.tags = source.tags;

		for (let role of roles) {
			const schemaName = CaseConvert.underscoreToCamel(role.path)
			if (source.components.schemas[schemaName] != undefined) dest.components.schemas[schemaName] = source.components.schemas[schemaName];
			if (source.components.responses[schemaName] != undefined) dest.components.responses[schemaName] = source.components.responses[schemaName];
			if (source.components.parameters[schemaName] != undefined) dest.components.parameters[schemaName] = source.components.parameters[schemaName];
			if (source.components.requestBodies[schemaName] != undefined) dest.components.requestBodies[schemaName] = source.components.requestBodies[schemaName];

			const pathIn = source.paths[role.path];
			if (pathIn == undefined) continue;
			const pathOut = dest.paths[role.path] = {};

			for (let i = 0; i < OpenApi.methods.length; i++) {
				if (role.mask && (1 << i) != 0) pathOut[OpenApi.methods[i]] = pathIn[OpenApi.methods[i]];
			}
		}

		if (dest.components.responses.Error == undefined) dest.components.responses.Error = source.components.responses.Error;
	}
*/
/*
	static mergeSchemas(schemaOld, schemaNew, keepOld, schemaName) {
		const mergeArray = (oldArray, newArray) => {
			if (newArray == undefined) return oldArray;
			if (oldArray == undefined) return newArray;
			for (const item of newArray) if (oldArray.includes(item) == false) oldArray.push(item);
			return oldArray;
		};

		schemaOld = schemaOld != undefined && schemaOld != null ? schemaOld : {};
//		console.log(`[${this.constructor.name}.updateJsonSchema(schemaName: ${schemaName}, schemaNew.properties: ${schemaNew.properties}, schemaOld.properties: ${schemaOld.properties})]`);
		const jsonSchemaTypes = ["boolean", "string", "integer", "number", "date-time", "date", "object", "array"];
		if (schemaNew.properties == undefined) schemaNew.properties = {};
		if (schemaOld.properties == undefined) schemaOld.properties = {};
		let newFields = schemaNew.properties || {};
		let oldFields = schemaOld.properties || {};
		if (typeof(newFields) == "string") newFields = Object.entries(JSON.parse(newFields));
		if (typeof(oldFields) == "string") oldFields = JSON.parse(oldFields);
		const newFieldsIterator = newFields instanceof Map == true ? newFields : Object.entries(newFields);
		let jsonBuilder = {};
		if (keepOld == true) jsonBuilder = oldFields;

		for (let [fieldName, field] of newFieldsIterator) {
			if (field == null) field = {};
			if (field.type == undefined) field.type = "string";

			if (field.hiden == undefined && field.identityGeneration != undefined) {
				field.hiden = true;
			}

			if (field.readOnly == undefined && field.identityGeneration != undefined) field.readOnly = true;

			if (jsonSchemaTypes.indexOf(field.type) < 0) {
				console.error(`${schemaName} : ${fieldName} : Unknow type : ${field.type}`);
				continue;
			}
			// type (columnDefinition), readOnly, hiden, primaryKey, essential (insertable), updatable, default, length, precision, scale 
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

			if (field.nullable == true) {
				jsonBuilderValue["nullable"] = true;
			} else {
				jsonBuilderValue["nullable"] = field.nullable;
			}
			//
			if (field.$ref != undefined) {
				jsonBuilderValue["$ref"] = field.$ref;
			}

			if (field.properties != undefined) {
				jsonBuilderValue["properties"] = field.properties;
			}

			if (field.items != undefined) {
				jsonBuilderValue["items"] = field.items;
			}

			if (field.internalName != null) jsonBuilderValue["internalName"] = field.internalName;
			if (field.essential != undefined) jsonBuilderValue["essential"] = field.essential;
			if (field.default != undefined) jsonBuilderValue["default"] = field.default;
			if (field.unique != undefined) jsonBuilderValue["unique"] = field.unique;
			if (field.identityGeneration != undefined) jsonBuilderValue["identityGeneration"] = field.identityGeneration;
			if (field.isClonable != undefined) jsonBuilderValue["isClonable"] = field.isClonable;
			if (field.hiden != undefined) jsonBuilderValue["hiden"] = field.hiden;
			if (field.readOnly != undefined) jsonBuilderValue["readOnly"] = field.readOnly;
			if (field.description != undefined) jsonBuilderValue["description"] = field.description;
			// oculta tipos incompatíveis
			if (jsonBuilderValue["type"] != "string") {
				delete jsonBuilderValue["length"];
			}

			if (jsonBuilderValue["type"] != "number") {
				delete jsonBuilderValue["precision"];
				delete jsonBuilderValue["scale"];
			}

			if (jsonBuilderValue["type"] != "object") {
				delete jsonBuilderValue["properties"];
			}

			if (jsonBuilderValue["type"] != "array") {
				delete jsonBuilderValue["items"];
			}
			// habilita os campos PLENAMENTE não SQL
			if (field.title != undefined) jsonBuilderValue.title = field.title;
			if (field.document != undefined) jsonBuilderValue.document = field.document;
			if (field.sortType != undefined) jsonBuilderValue.sortType = field.sortType;
			if (field.orderIndex != undefined) jsonBuilderValue.orderIndex = field.orderIndex;
			if (field.tableVisible != undefined) jsonBuilderValue.tableVisible = field.tableVisible;
			if (field.shortDescription != undefined) jsonBuilderValue.shortDescription = field.shortDescription;

			if (field.enum != undefined) jsonBuilderValue.enum = mergeArray(jsonBuilderValue.enum, field.enum);
			if (field.enumLabels != undefined) jsonBuilderValue.enumLabels = mergeArray(jsonBuilderValue.enumLabels, field.enumLabels);
			// exceções
			if (oldFields[fieldName] != null) {
				let fieldOriginal = oldFields[fieldName];
				// copia do original os campos PLENAMENTE não SQL
				jsonBuilderValue.title = fieldOriginal.title;
				jsonBuilderValue.document = fieldOriginal.document;
				jsonBuilderValue.sortType = fieldOriginal.sortType;
				jsonBuilderValue.orderIndex = fieldOriginal.orderIndex;
				jsonBuilderValue.tableVisible = fieldOriginal.tableVisible;
				jsonBuilderValue.shortDescription = fieldOriginal.shortDescription;

				jsonBuilderValue.enum = mergeArray(jsonBuilderValue.enum, fieldOriginal.enum);
				jsonBuilderValue.enumLabels = mergeArray(jsonBuilderValue.enumLabels, fieldOriginal.enumLabels);
				// registra conflitos dos valores antigos com os valores detectados do banco de dados
				const exceptions = ["service", "isClonable", "hiden", "$ref"];

				for (let subFieldName in fieldOriginal) {
					if (exceptions.indexOf(subFieldName) < 0 && fieldOriginal[subFieldName] != jsonBuilderValue[subFieldName]) {
						console.warn(`generateJsonSchema() : table [${schemaName}], field [${fieldName}], property [${subFieldName}] conflict previous declared [${fieldOriginal[subFieldName]}] new [${jsonBuilderValue[subFieldName]}]\nold:\n`, fieldOriginal, "\nnew:\n", jsonBuilderValue);
					}
				}
				// copia do original os campos PARCIALMENTE não SQL
				if (fieldOriginal.isClonable != undefined) jsonBuilderValue.isClonable = fieldOriginal.isClonable;
				if (fieldOriginal.readOnly != undefined) jsonBuilderValue.readOnly = fieldOriginal.readOnly;
				if (fieldOriginal.hiden != undefined) jsonBuilderValue.hiden = fieldOriginal.hiden;
			}
			// oculta os valores dafault
			const defaultValues = {updatable: true, maxLength: 255, precision: 9, scale: 3, hiden: false, primaryKey: false, essential: false};

			for (let subFieldName in defaultValues) {
				if (jsonBuilderValue[subFieldName] == defaultValues[subFieldName]) {
					delete jsonBuilderValue[subFieldName];
				}
			}
			// troca todos os valores null por undefined
			for (let [key, value] of Object.entries(jsonBuilderValue)) {
				if (value == null) delete jsonBuilderValue[key];
			}

			if (keepOld && jsonBuilderValue["type"] == "array" && oldFields[fieldName] != null)
				jsonBuilder[fieldName].items = this.mergeSchemas(oldFields[fieldName].items, newFields[fieldName].items, keepOld, schemaName);
			else if (keepOld && jsonBuilderValue["type"] == "object" && oldFields[fieldName] != null)
				jsonBuilder[fieldName] = this.mergeSchemas(oldFields[fieldName], newFields[fieldName], keepOld, schemaName);
			else
				jsonBuilder[fieldName] = jsonBuilderValue;
		}

		const schema = {};
		schema.title = schemaOld.title || schemaNew.title;
		schema.type = "object";
		schema.required = [];
		schema.primaryKeys = schemaNew.primaryKeys;
		schema.uniqueKeys = schemaNew.uniqueKeys;
		schema.foreignKeys = schemaNew.foreignKeys;
		schema.properties = jsonBuilder;
		for (const [fieldName, field] of Object.entries(schema.properties)) if (field.essential == true) schema.required.push(fieldName);
		return schema;
	}
*/
	static convertRufsToStandartSchema(schema, onlyClientUsage) {
		const standartSchema = {};
		standartSchema.type = schema.type || "object";
		standartSchema.required = schema.required || [];
		if (schema.primaryKeys && schema.primaryKeys.length > 0) standartSchema["x-primaryKeys"] = schema.primaryKeys;

		if (onlyClientUsage != true) {
			standartSchema["x-uniqueKeys"] = schema.uniqueKeys;
			standartSchema["x-foreignKeys"] = schema.foreignKeys;
		}

		standartSchema.description = schema.description;
		standartSchema.properties = {};

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			if (onlyClientUsage == true && field.hiden == true) continue;
			let property = {};
			let type = field.type;

			if (type == "date-time" || type == "date") {
				property.type = "string";
				property.format = type;
			} else if (type == null && field.properties != null) {
				type = "object";
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
						property = this.convertRufsToStandartSchema(field, onlyClientUsage);
					} else {
						console.error(`[${this.constructor.name}.convertRufsToStandartSchema()] : missing "properties" in field ${fieldName} from schema :`, schema);
					}
				}
			} else if (type == "array") {
				if (field.items) {
					if (field.minItems != null) property.minItems = field.minItems;
					if (field.maxItems != null) property.maxItems = field.maxItems;

					if (field.items.type == "object") {
						if (field.items.$ref) {
							property.items = {};
							property.items.$ref = field.items.$ref;
						} else {
							if (field.items.properties != undefined) {
								property.items = this.convertRufsToStandartSchema(field.items, onlyClientUsage);
							} else {
								console.error(`[${this.constructor.name}.convertRufsToStandartSchema()] : missing "properties" in field ${fieldName} from schema :`, schema);
							}
						}
					} else {
						property.items = field.items;
					}
				}

				if (field.hiden) property["x-hiden"] = field.hiden;
				if (field.internalName && onlyClientUsage != true) property["x-internalName"] = field.internalName;
				if (field.enumLabels && onlyClientUsage != true) property["x-enumLabels"] = field.enumLabels;
			} else {
				if (field.example) property.example = field.example;
				if (field.nullable) property.nullable = field.nullable;
				if (field.updatable) property["x-updatable"] = field.updatable;
				if (field.scale) property["x-scale"] = field.scale;
				if (field.precision) property["x-precision"] = field.precision;
				if (field.maxLength) property.maxLength = field.maxLength;
				if (field.pattern) property.pattern = field.pattern;
				if (field.format) property.format = field.format;
				if (field.$ref) property.$ref = field.$ref;
				if (field.title) property["x-title"] = field.title;

				if (onlyClientUsage != true) {
					if (field.essential) property["x-required"] = field.essential;
					if (field.hiden) property["x-hiden"] = field.hiden;
					if (field.internalName) property["x-internalName"] = field.internalName;
					if (field.enumLabels) property["x-enumLabels"] = field.enumLabels;
					if (field.identityGeneration) {
						property["x-identityGeneration"] = field.identityGeneration;
					}
				}
			}

			if (field.essential == true && standartSchema.required.indexOf(fieldName) < 0)
				standartSchema.required.push(fieldName);

			standartSchema.properties[fieldName] = property;
		}

		if (standartSchema.required.length == 0) delete standartSchema.required;
		return standartSchema;
	}

	static convertRufsToStandart(openapi, onlyClientUsage) {
		const standartOpenApi = {};
		standartOpenApi.openapi = openapi.openapi;
		standartOpenApi.info = openapi.info;
		standartOpenApi.servers = openapi.servers;

		standartOpenApi.paths = openapi.paths;
/*
		standartOpenApi.paths = {};

		for (let [pathName, pathItemObject] of Object.entries(openapi.paths)) {
			for (let method of OpenApi.methods) {
				const operationObject = pathItemObject[method];
				if (operationObject == undefined) continue;
				if (onlyClientUsage == true && operationObject.operationId.startsWith("zzz") == true) continue;
				standartOpenApi.paths[pathName] = pathItemObject;
			}
		}
*/
		standartOpenApi.components = {};
		const standartSchemas = {};

		for (let [name, schema] of Object.entries(openapi.components.schemas)) {
			if (schema == undefined) {
				console.error(`[${this.constructor.name}.convertRufsToStandart(openapi)] : openapi.components.schemas[${name}] is undefined !`);
				continue;
			}

			standartSchemas[name] = this.convertRufsToStandartSchema(schema, onlyClientUsage);
		}

		standartOpenApi.components.schemas = standartSchemas;
		standartOpenApi.components.parameters = openapi.components.parameters;
		standartOpenApi.components.requestBodies = {};

		for (let [name, requestBodyObject] of Object.entries(openapi.components.requestBodies)) {
/*
			if (requestBodyObject == null) {
				console.error(`Wrong requestBody of ${name}`);
				continue;
			}
*/
			const standartRequestBodyObject = standartOpenApi.components.requestBodies[name] = {"required": true, "content": {}};

			for (let [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
				standartRequestBodyObject.content[mediaTypeName] = {};

				if (mediaTypeObject.schema.properties != undefined) {
					standartRequestBodyObject.content[mediaTypeName].schema = this.convertRufsToStandartSchema(mediaTypeObject.schema, onlyClientUsage);
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
			const skypes = ["x-essential", "x-$ref", "x-title", "x-hiden", "x-internalName", "x-enumLabels", "x-identityGeneration", "x-updatable", "x-scale", "x-precision"];
			if (schema.properties == null) schema.properties = {};

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				delete field["x-required"];
				if (schema.required.indexOf(fieldName) >= 0) field.essential = true;

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

		if (openapi.components.requestBodies == null) openapi.components.requestBodies = {};

		for (let [name, requestBodyObject] of Object.entries(openapi.components.requestBodies)) {
			for (let [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
				if (mediaTypeObject.schema.properties != undefined) convertSchema(mediaTypeObject.schema);
			}
		}

		return openapi;
	}

	static getMaxFieldSize(schema, fieldName) {
		let ret = 0;
		const field = schema.properties[fieldName];
		const type = field["type"];

		if (type == undefined || type == "string") {
			if (field.maxLength != undefined) {
				ret = field.maxLength;
			} else {
				ret = 100;
			}
		} else if (type == "integer") {
			ret = 9;
		} else if (type == "number") {
			if (field.precision != undefined) {
				ret = field.precision;
			} else {
				ret = 15;
			}
		} else if (type == "boolean") {
			ret = 5;
		} else if (type == "date" || type == "date-time") {
			ret = 30;
		}

		return ret;
	}

	static copyValue(field, value) {
		if (value == null && field.essential == true && field.nullable != true) {
			if (field.enum != null && field.enum.length == 1) {
				value = field.enum[0];
			} else if (field.default != null) {
				value = field.default;
			}
		}

		let ret;
		const type = field["type"];

		if (type == undefined || type == "string") {
			ret = value != null && field.maxLength != null && typeof(value) == "string" ? value.substring(0, field.maxLength) : value;
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
		} else if (type == "date-time") {
			ret = value != null && field.maxLength != null && typeof(value) == "string" ? value.substring(0, field.maxLength): new Date(value);
		} else if (type == "date") {
			ret = value != null && typeof(value) == "string" ? value.substring(0, 10): new Date(value);
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

	static getValueFromSchema(schema, propertyName, obj) {
		const property = schema.properties[propertyName];
		let ret = null;

		if (property != undefined) {
			if (obj[propertyName] != undefined) {
				ret = obj[propertyName];
			} else if (property.internalName != undefined && obj[property.internalName] != undefined) {
				ret = obj[property.internalName];
			} else if (property.nullable == true) {
				if (obj[propertyName] === null) return null;
				if (property.internalName != undefined && obj[property.internalName] === null) return null;
			}
		}

		if (ret == null) {
			for (const [fieldName, field] of Object.entries(schema.properties)) {
				if (field.internalName == propertyName) {
					ret = obj[fieldName];
					break;
				}
			}
		}
/*
		if (ret == null) {
			const propertyNameLowerCase = propertyName.toLowerCase();

			for (const [fieldName, field] of Object.entries(schema.properties)) {
				if (propertyNameLowerCase == fieldName.toLowerCase() || (field.internalName != null && propertyNameLowerCase == field.internalName.toLowerCase())) {
					ret = obj[fieldName];

					if (ret == null) {
						for (const [name, value] of (Object.entries(obj))) {
							if (name.toLowerCase() == propertyNameLowerCase || (field.internalName != null && name.toLowerCase() == field.internalName.toLowerCase())) {
								ret = obj[name];
								break;
							}
						}

					}

					break;
				}
			}
		}
*/
		if (ret != null && ret instanceof Date && !isNaN(ret) && property != null && property.type == "date") {
			const str = ret.toISOString();
			ret = str.substring(0, 10);
		}

		return ret;
	}
	// public
	static copyFields(schema, dataIn, ignoreUndefined, ignoreHiden) {
		const ret = {};

		for (let [fieldName, field] of Object.entries(schema.properties)) {
			if (ignoreHiden == true && field.hiden == true) continue;
			if (ignoreUndefined != false && Object.keys(dataIn).includes(fieldName) == false) continue;
			const value = this.getValueFromSchema(schema, fieldName, dataIn);

			if (field.type == "array" && field.items.type == "object") {
				if (Array.isArray(value) == true) {
					const list = ret[fieldName] = [];

					for (const item of value) {
						list.push(this.copyFields(field.items, item, ignoreUndefined, ignoreHiden));
					}
				}
			} else if (field.type == "object") {
				if (value != null) {
					ret[fieldName] = this.copyFields(field, value, ignoreUndefined, ignoreHiden);
				} else if (field.nullable != false) {
					ret[fieldName] = null;
				}
			} else {
				if (value === null && field.nullable == true) {
					ret[fieldName] = null;
				} else {
					ret[fieldName] = this.copyValue(field, value);
				}
			}
		}

		return ret;
	}
/*
	static getList(Qs, openapi, onlyClientUsage, roles) {
    	const process = properties => {
			for (let [fieldName, property] of Object.entries(properties)) {
    			const $ref = property["x-$ref"];

				if ($ref != null) {
					let pos = $ref.indexOf("?");
					const queryObj = {"filter": {}};

					if (pos >= 0 && Qs != null) {
						const params = Qs.parse($ref.substring(pos), {ignoreQueryPrefix: true, allowDots: true});

						for (let [name, value] of Object.entries(params)) {
							if (value != null && value.startsWith("*") == true) queryObj.filter[name] = value.substring(1);
						}
					}

					const schemaName = OpenApi.getSchemaNameFromRef($ref);
					const href = "#!/app/" + schemaName + "/search?" + Qs.stringify(queryObj, {allowDots: true});
					property["x-$ref"] = href;
    			}
    		}
    	}

		const fillPropertiesRequired = schema => {
			if (schema.required == undefined) return schema;

			for (const fieldName of schema.required) {
				if (schema.properties && schema.properties[fieldName] != undefined) {
					schema.properties[fieldName]["x-required"] = true;
				}
			}

			return schema;
		};

		if (openapi == undefined || openapi.components == undefined || openapi.components.schemas == undefined) return [];
		const list = [];

		for (const role of roles) {
			for (let i = 0; i< OpenApi.methods.length; i++) {
				const method = OpenApi.methods[i]
				if ((role.mask & (1 << i)) == 0) continue;
				const operationObject = this.getOperationObject(openapi, role.name, method);
				if (operationObject == undefined) continue;
				if (onlyClientUsage == true && operationObject.operationId.startsWith("zzz") == true) continue;
				const item = {operationId: operationObject.operationId, path: "/" + role.name, method: method};
				const parameterSchema = OpenApi.getSchemaFromParameters(openapi, role.name);
				const requestBodySchema = OpenApi.getSchemaFromRequestBodies(openapi, role.name);
				const responseSchema = OpenApi.getSchemaFromSchemas(openapi, role.name);
				if (parameterSchema != undefined) item.parameter = parameterSchema.properties;

				if (requestBodySchema != undefined) {
					item.requestBody = requestBodySchema.properties;
					process(item.requestBody);
					fillPropertiesRequired(requestBodySchema);
				}

				if (responseSchema != undefined) {
					item.response = responseSchema.properties;
					process(item.response);
					fillPropertiesRequired(responseSchema);
				}

				list.push(item);
			}
		}

		return list;
	}
*/
	static objToSchemaAdd(obj, schema, stringMayBeNumber, mapNameExternalToInternal) {
		if (schema.properties == undefined) schema.properties = {};
		schema.count = schema.count == undefined ? 1 : schema.count + 1;

		for (let fieldName in obj) {
			let value = obj[fieldName];
			if (typeof value == "string") value = value.trimEnd();
			let internalName = null;

			for (const [externalName, listInternalName] of Object.entries(mapNameExternalToInternal)) {
				if (externalName.toLowerCase() == fieldName.toLowerCase()) {
					fieldName = externalName
					break
				}

				for (const name of listInternalName) {
					if (name.toLowerCase() == fieldName.toLowerCase()) {
						fieldName = externalName
						internalName = name
						break
					}
				}

				if (internalName != null) {
					break
				}
			}

			let property = schema.properties[fieldName];

			if (property == undefined) {
				property = schema.properties[fieldName] = {};
				property.mayBeNumber = true;
				property.mayBeInteger = true;
				property.mayBeDate = true;
				property.mayBeEmpty = false;
				property.nullable = false;
				property.maxLength = 0;
				property.default = value;
				property.count = 0;
				property.internalName = internalName

				if (fieldName.startsWith("compet")) {
					property.pattern = "^20\\d\\d[01]\\d$";
					property.description = `${fieldName} deve estar no formato yyyymm`;
				}
			}

			property.count++;

			if (value == undefined || value == null) {
				if (property.nullable == false) {
					property.nullable = true;

					if (["chv"].includes(fieldName) == true) {
						console.log(`${this.constructor.name}.objToSchemaAdd() : field ${fieldName} nullable`, obj);
					}
				}
			} else if (typeof value == "string" && value.length == 0) {
				if (property.mayBeEmpty == false) {
					property.mayBeEmpty = true;

					if (["chv"].includes(fieldName) == true) {
						console.log(`${this.constructor.name}.objToSchemaAdd() : field ${fieldName} mayBeEmpty`, obj);
					}
				}
			} else if (typeof value == "string" || typeof value == "number") {
				if (typeof value == "string") {
					if (property.maxLength < value.length) property.maxLength = value.length;
					if (property.mayBeDate == true && ((Date.parse(value) > 0) == false || value.includes("-") == false)) property.mayBeDate = false;

					if (property.mayBeNumber == true) {
						if (stringMayBeNumber != true || Number.isNaN(Number(value)) == true) {
							property.mayBeNumber = false;
							property.mayBeInteger = false;
						} else {
							if (property.mayBeInteger == true && value.includes(".") == true) property.mayBeInteger = false;
						}
					}
				} else if (typeof value == "number") {
					const strLen = value.toString().length;
					if (property.maxLength < strLen) property.maxLength = strLen;
					if (property.mayBeInteger == true && Number.isInteger(value) == false) property.mayBeInteger = false;
				}

				if (property.enum == undefined) {
					property.enum = [];
					property.enumCount = [];
				}

				if (property.enum.length < 10) {
					const pos = property.enum.indexOf(value);

					if (pos < 0) {
						property.enum.push(value);
						property.enumCount.push(1);
					} else {
						property.enumCount[pos] = property.enumCount[pos] + 1;
					}
				}
			} else if (Array.isArray(value) == true) {
				property.type = "array";
				if (property.items == undefined) property.items = {type:"object", properties:{}};
				for (const item of value) this.objToSchemaAdd(item, property.items, stringMayBeNumber, mapNameExternalToInternal);
			} else {
				property.type = "object";
				if (property.properties == undefined) property.properties = {};
				this.objToSchemaAdd(value, property, stringMayBeNumber, mapNameExternalToInternal);
			}
		}
	}

	static objToSchemaFinalize(schema, options) {
		const adjustSchemaType = (schema) => {
			for (let [fieldName, property] of Object.entries(schema.properties)) {
				if (property.type == "object" && property.properties != undefined) {
					adjustSchemaType(property);
					continue;
				}

				if (property.type == "array" && property.items != undefined && property.items.properties != undefined) {
					adjustSchemaType(property.items);
					continue;
				}

				if (property.type == undefined) {
					if (property.mayBeInteger && property.maxLength > 0) 
						property.type = "integer";
					else if (property.mayBeNumber && property.maxLength > 0)
						property.type = "number";
					else if (property.mayBeDate && property.maxLength > 0)
						property.type = "date-time";
					else
						property.type = "string";
				}
			}
		}

		const adjustRequired = (schema) => {
			if (schema.required == undefined) schema.required = [];

			for (let [fieldName, property] of Object.entries(schema.properties)) {
				if (property.type == "object" && property.properties != undefined) {
					adjustRequired(property);
					continue;
				}

				if (property.type == "array" && property.items != undefined && property.items.properties != undefined) {
					adjustRequired(property.items);
					property.required = property.items.required;
					continue;
				}

				if (property.count == schema.count) {
					if (property.essential == null) {
						property.essential = true;
						if (schema.required.includes(fieldName) == false) schema.required.push(fieldName);
					}

    				if (property.nullable == false && property.mayBeEmpty == true) property.nullable = true;
				}
			}
		}

		const adjustSchemaEnumExampleDefault = (schema, enumMaxLength) => {
			for (let [fieldName, property] of Object.entries(schema.properties)) {
				if (property.type == "array" && property.items != undefined && property.items.properties != undefined) {
					adjustSchemaEnumExampleDefault(property.items, enumMaxLength);
					continue;
				}

				if (property.type == "object") {
					adjustSchemaEnumExampleDefault(property, enumMaxLength);
					continue;
				}

				if (property.enumCount != undefined) {
					if (property.enumCount.length < enumMaxLength) {
						let posOfMax = 0;
						let countMax = -1;

						for (let i = 0; i < property.enumCount.length; i++) {
							const count = property.enumCount[i];

							if (count > countMax) {
								countMax = count;
								posOfMax = i;
							}
						}

						for (let i = 0; i < property.enum.length; i++) property.enum[i] = OpenApi.copyValue(property, property.enum[i]);
						property.default = property.enum[posOfMax];
					} else {
						property.example = property.enum.join(",");
						delete property.enum;
						delete property.enumCount;
					}
				}

				if (property.default != undefined) property.default = OpenApi.copyValue(property, property.default);
			}
		}

		adjustSchemaType(schema);
		adjustRequired(schema);
		options = options || {};
		options.enumMaxLength = options.enumMaxLength || 10
		adjustSchemaEnumExampleDefault(schema, options.enumMaxLength);
		schema.primaryKeys = options.primaryKeys || [];

		for (const fieldName of schema.primaryKeys) {
			if (schema.properties[fieldName] == null)
				console.error(`${this.constructor.name}.objToSchemaFinalize() : invalid primaryKey : ${fieldName}, allowed values : `, Object.keys(schema.properties));
		}
	}

	static genSchemaFromExamples(list, options) {
		const schema = {type: "object", properties: {}};
		for (let obj of list) this.objToSchemaAdd(obj, schema, false, {});
		this.objToSchemaFinalize(schema, options);
		return schema;
	}
//{"methods": ["get", "post"], "schemas": responseSchemas, parameterSchemas, requestSchemas}
	static fillOpenApi(openapi, options) {
		const forceGeneratePath = options.requestSchemas == null && options.parameterSchemas == null;
		if (openapi.paths == null) openapi.paths = {};
		if (openapi.components == null) openapi.components = {};
		if (openapi.components.schemas == null) openapi.components.schemas = {};
		if (openapi.components.responses == null) openapi.components.responses = {};
		if (openapi.components.parameters == null) openapi.components.parameters = {};
		if (openapi.components.requestBodies == null) openapi.components.requestBodies = {};
		if (openapi.tags == null) openapi.tags = [];
		//
		if (options == null) options = {};
		if (options.requestBodyContentType == null) options.requestBodyContentType = "application/json"
		if (options.responseContentType == null) options.responseContentType =  "application/json"
		if (options.methods == null) options.methods = OpenApi.methods
		if (options.parameterSchemas == null) options.parameterSchemas = {};
		if (options.requestSchemas == null) options.requestSchemas = {};
		if (options.responseSchemas == null) options.responseSchemas = {};
		if (options.security == null) options.security = {};
		if (options.disableResponseList == null) options.disableResponseList = {};

		if (options.requestSchemas["login"] == null) {
			const requestSchema = {"type": "object", "properties": {"user": {type: "string"}, "password": {type: "string"}}, "required": ["user", "password"]};
			const responseSchema = {"type": "object", "properties": {"tokenPayload": {type: "string"}}, "required": ["tokenPayload"]};
			this.fillOpenApi(openapi, {methods: ["post"], requestSchemas: {"login": requestSchema}, schemas: {"login": responseSchema}, security: [{"basic": []}]});
		}

		if (options.schemas == null) {
			options.schemas = openapi.components.schemas;
		} else {
			for (let [schemaName, schema] of Object.entries(options.schemas)) {
				openapi.components.schemas[schemaName] = schema;
			}
		}
		// add components/responses with error schema
		const schemaError = {"type": "object", "properties": {"code": {"type": "integer"}, "description": {"type": "string"}}, "required": ["code", "description"]};
		openapi.components.responses["Error"] = {"description": "Error response", "content": {"application/json": {"schema": schemaError}}};

		for (const schemaName in options.schemas) {
			const requestSchema = options.requestSchemas[schemaName];
			const parameterSchema = options.parameterSchemas[schemaName];
			const disableResponseList = options.disableResponseList[schemaName]

			if (options.forceGenerateSchemas != true && forceGeneratePath == false && requestSchema == null && parameterSchema == null) continue;
			const schema = options.schemas[schemaName];
			if (schema.primaryKeys == null) schema.primaryKeys = [];
			if (openapi.tags.find(item => item.name == schemaName) == null) openapi.tags.push({"name": schemaName});
			const referenceToSchema = {"$ref": `#/components/schemas/${schemaName}`};
//			if (forceGeneratePath == false && requestSchema == null && parameterSchema == null) continue;
			// fill components/requestBody with schemas
			openapi.components.requestBodies[schemaName] = {"required": true, "content": {}};
			openapi.components.requestBodies[schemaName].content[options.requestBodyContentType] = {"schema": options.requestSchemas[schemaName] || referenceToSchema};
			// fill components/responses with schemas
			openapi.components.responses[schemaName] = {"description": "response", "content": {}};
			openapi.components.responses[schemaName].content[options.responseContentType] = {"schema": options.responseSchemas[schemaName] || referenceToSchema};

			if (!disableResponseList) {
				openapi.components.responses[schemaName+"List"] = {description: "response list", content: {"application/json": {schema: {type: "array", items: referenceToSchema}}}}
			}
		
			// fill components/parameters with primaryKeys
			if (parameterSchema != null) {
				openapi.components.parameters[schemaName] = {"name": "main", "in": "query", "required": true, "schema": OpenApi.convertRufsToStandartSchema(parameterSchema)};
			} else if (schema.primaryKeys.length > 0) {
				const schemaPrimaryKey = {"type": "object", "properties": {}, "required": schema.primaryKeys};

				for (const primaryKey of schema.primaryKeys) {
					schemaPrimaryKey.properties[primaryKey] = OpenApi.getPropertyFromSchema(schema, primaryKey);
				}

				openapi.components.parameters[schemaName] = {"name": "primaryKey", "in": "query", "required": true, "schema": OpenApi.convertRufsToStandartSchema(schemaPrimaryKey)};
			}
			// path
			const pathName = "/" + CaseConvert.camelToUnderscore(schemaName)
			const pathItemObject = openapi.paths[pathName] = {};
			const mediaTypeOk = {schema: {"$ref": `#/components/responses/${schemaName}`}}
			const mediaTypeOkList = {schema: {"$ref": `#/components/responses/${schemaName}List`}}
			const mediaTypeError = {schema: {"$ref": `#/components/responses/Error`}}
			const responsesRefOk = {content: {"application/json": mediaTypeOk}}
			const responsesRefOkList = {content: {"application/json": mediaTypeOkList}}
			const responsesRefError = {content: {"application/json": mediaTypeError}}

			const parametersRef = [{"$ref": `#/components/parameters/${schemaName}`}];
			const requestBodyRef = {"$ref": `#/components/requestBodies/${schemaName}`};

			const methods =                 ["get", "put", "post", "delete", "patch"];
			const methodsHaveParameters =   [true , true , false , true    , true   ];
			const methodsHaveRequestBody =  [false, true , true  , false   , true   ];
			const methodsHaveResponseList = [true , false, false , false   , false  ]

			for (let i = 0; i < methods.length; i++) {
				const method = methods[i];
				if (options.methods.includes(method) == false) continue;
				const operationObject = {};

				if (options.methods.length > 1) {
					operationObject.operationId = `zzz_${method}_${schemaName}`;
				} else {
					operationObject.operationId = schemaName;
				}

				if (methodsHaveParameters[i] == true && openapi.components.parameters[schemaName] != undefined) operationObject.parameters = parametersRef;
				if (methodsHaveRequestBody[i] == true) operationObject.requestBody = requestBodyRef;

				if (methodsHaveResponseList[i] && !disableResponseList) {
					operationObject.responses = {"200": responsesRefOkList, "default": responsesRefError}
				} else {
					operationObject.responses = {"200": responsesRefOk, "default": responsesRefError}
				}

				operationObject.tags = [schemaName];
				operationObject.description = `CRUD ${method} operation over ${schemaName}`;

				if (options.security != null) {
					operationObject.security = options.security
				}

				if (methodsHaveParameters[i] == false || operationObject.parameters != undefined) {
					pathItemObject[method] = operationObject;
				}
			}
		}

		return openapi;
	}

	static getSchemaNameFromRef($ref) {
		let ret = $ref;
		let pos = ret.lastIndexOf("/");

		if (pos >= 0) {
			ret = ret.substring(pos+1);
		}

		pos = ret.indexOf("?");

		if (pos >= 0) {
			ret = ret.substring(0, pos);
		}

		return ret;
	}

	static getSchemaFromSchemas(openapi, $ref) {
		const schemaName = this.getSchemaNameFromRef($ref);
		const schema = openapi.components.schemas[schemaName];
		return schema;
	}

	static getSchemaFromRequestBodies(openapi, schemaName) {
		schemaName = this.getSchemaNameFromRef(schemaName);
		const requestBodyObject = openapi.components.requestBodies[schemaName];

		if (requestBodyObject == undefined)
			return undefined;

		let schema;

		for (const [mediaTypeName, mediaTypeObject] of Object.entries(requestBodyObject.content)) {
			if (mediaTypeObject.schema.$ref != null) {
				schema = OpenApi.getSchemaFromRef(openapi, mediaTypeObject.schema.$ref)
				break;
			} else if (mediaTypeObject.schema.properties != undefined) {
				schema = mediaTypeObject.schema;
				break;
			}
		}

		return schema;
	}

	static getSchemaFromResponses(openapi, schemaName) {
		schemaName = this.getSchemaNameFromRef(schemaName);
		const responseObject = openapi.components.responses[schemaName];

		if (responseObject == null) {
			return null
		}

		let schema;

		for (const [_, mediaTypeObject] of Object.entries(responseObject.content)) {
			if (mediaTypeObject.schema.$ref != null) {
				schema = OpenApi.getSchemaFromRef(openapi, mediaTypeObject.schema.$ref)
				break;
			} else if (mediaTypeObject.schema.properties != undefined) {
				schema = mediaTypeObject.schema;
				break;
			}
		}

		return schema;
	}

	static getSchemaFromRef(openapi, ref) {
		let schema = null
		const schemaName = OpenApi.getSchemaNameFromRef(ref)
	
		if (ref.startsWith("#/components/parameters/")) {
			const parameterObject = openapi.components.parameters[schemaName]

			if (parameterObject != null) {
				schema = parameterObject.schema
			}
		} else if (ref.startsWith("#/components/schemas/")) {
			schema = openapi.components.schemas[schemaName]
		} else if (ref.startsWith("#/components/requestBodies/")) {
			schema = OpenApi.getSchemaFromRequestBodies(openapi, schemaName)
		} else if (ref.startsWith("#/components/responses/")) {
			const response = openapi.components.responses[schemaName]

			if (response != null) {
				for (let [name, content] of Object.entries(response.content)) {
					schema = content.schema
					break
				}
			}
		}
	
		if (schema == null) {
			throw new Error(`[OpenApi.getSchemaFromRef] don't find schema from ${ref}`)
		} else if (schema.name == null || schema.name == "") {
			schema.name = schemaName
		}
	
		return schema
	}

	static getPathParams(openapi, uri, params) {
		let path = null;
		const uriSegments = uri.split("/")
	
		for (const [pattern, pathItemObject] of Object.entries(openapi.paths)) {
			const pathSegments = pattern.split("/")
	
			if (uriSegments.length == pathSegments.length) {
				let match = true
	
				for (let idx = 0; idx < pathSegments.length; idx++) {
					const pathSegment = pathSegments[idx]

					if (pathSegment.startsWith("{") && pathSegment.endsWith("}")) {
						const name = CaseConvert.underscoreToCamel(pathSegment.substring(1, pathSegment.length-1))
						params[name] = uriSegments[idx]
					} else if (pathSegment != uriSegments[idx]) {
						match = false
						break
					}
				}
	
				if (match) {
					path = pattern
					break
				}
			}
		}
	
		return path
	}

	/**
	 * 
	 * @param {string} path
	 * @param {string} method
	 * @returns {object}
	 */
	static getSchemaFromParameters(openapi, path, method) {
		for (let [pattern, pathItemObject] of Object.entries(openapi.paths)) {
			if (pattern == path) {
				const operationObject = pathItemObject[method]

				if (operationObject != null) {
					for (let parameterObject of operationObject.parameters) {
						if (parameterObject.$ref != null) {
							return OpenApi.getSchemaFromRef(openapi, parameterObject.$ref)
						} else if (parameterObject.schema != null) {
							if (parameterObject.schema.$ref != null) {
								return OpenApi.getSchemaFromRef(openapi, parameterObject.schema.$ref)
							} else {
								return parameterObject.schema
							}
						}
					}
				}
			}
		}
	
		throw(`[OpenApi.getSchemaFromParameters] don't find schema parameter from ${path}`)
	}

	static getSchema(openapi, path, method, type) {
		const getSchemaFromContent = content => {
			let schema = null

			for (let [_, mediaTypeObject] of Object.entries(content)) {
				if (mediaTypeObject.schema["$ref"] != null) {
					schema = OpenApi.getSchemaFromRef(openapi, mediaTypeObject.schema["$ref"])
				} else {
					schema = mediaTypeObject.schema
				}
			}

			return schema
		}

		let schema = null
		const pathItemObject = openapi.paths[path]

		if (pathItemObject != null) {
			const operationObject = pathItemObject[method]

			if (operationObject != null) {
				if (type == "parameters") {
				} else if (type == "requestBody") {
					if (operationObject.requestBody.$ref != null) {
						schema = OpenApi.getSchemaFromRef(openapi, operationObject.requestBody.$ref)
					} else if (operationObject.requestBody.content != null) {
						schema = getSchemaFromContent(operationObject.requestBody.content)
					}
				} else if (type == "responseObject") {
					const responseObject = operationObject.responses["200"]

					if (responseObject != null) {
						if (responseObject["$ref"] != null) {
							return getSchemaFromResponses(openapi, responseObject["$ref"])
						}

						return getSchemaFromContent(responseObject.content)
					}
				}
			} else {
				throw new Error(`[OpenApi.getSchema] missing OperationObject ${path}.${method}`)
			}
		} else {
			throw new Error(`[OpenApi.getSchema] missing PathItemObject ${path}`)
		}
	
		return schema
	}

	static getSchemaName(openapi, path, method, type) {
		const getSchemaNameFromContent = content => {
			let ret = null

			for (let [_, mediaTypeObject] of Object.entries(content)) {
				if (mediaTypeObject.schema.$ref != null) {
					const schema = OpenApi.getSchemaFromRef(openapi, mediaTypeObject.schema.$ref)

					if (schema != null && schema.type == "array" && schema.items != null && schema.items.$ref != null) {
						ret = OpenApi.getSchemaNameFromRef(schema.items.$ref)
					} else {
						ret = OpenApi.getSchemaNameFromRef(mediaTypeObject.schema.$ref)
					}
				} else if (mediaTypeObject.schema.name != null) {
					ret = OpenApi.getSchemaNameFromRef(mediaTypeObject.schema.name)
				} else if (mediaTypeObject.schema.type == "array" && mediaTypeObject.schema.items != null && mediaTypeObject.schema.items.$ref != null) {
					ret = OpenApi.getSchemaNameFromRef(mediaTypeObject.schema.items.$ref)
				}
			}

			return ret
		}

		let ret = null
		const pathItemObject = openapi.paths[path]

		if (pathItemObject != null) {
			method = method.toLowerCase()
			const operationObject = pathItemObject[method]
	
			if (operationObject != null) {
				if (type == null) {
					if (["post", "put"].includes(method)) {
						type = "requestBody"
					} else {
						type = "responseObject"
					}
				}

				if (type == "requestBody") {
					if (operationObject.requestBody.$ref != null) {
						ret = OpenApi.getSchemaNameFromRef(operationObject.requestBody.$ref)
					} else if (operationObject.requestBody.content != null) {
						ret = getSchemaNameFromContent(operationObject.requestBody.content)
					}
				} else {
					const responseObject = operationObject.responses["200"]

					if (responseObject != null && responseObject.content != null) {
						ret = getSchemaNameFromContent(responseObject.content)
					}
				}
			}
		}
	
		return ret
	}

	static getOperationObject(openapi, path, method) {
		let operationObject = undefined;
		const pathItemObject = openapi.paths[path];

		if (pathItemObject != undefined) {
			operationObject = pathItemObject[method.toLowerCase()];
		}

		return operationObject;
	}

	static getPropertyFromSchema(schema, propertyName) {
		if (schema.properties[propertyName] != undefined) return schema.properties[propertyName];
		let ret = undefined;

		for (const [fieldName, field] of Object.entries(schema.properties)) {
			if (field.internalName == propertyName) {
				ret = field;
				break;
			}
		}

		return ret;
	}

	static getPropertyFromSchemas(openapi, schemaName, propertyName) {
		let field;
		const schema = this.getSchemaFromSchemas(openapi, schemaName);

		if (schema != undefined)
			field = OpenApi.getPropertyFromSchema(schema, propertyName);

		return field;
	}

	static getPropertyFromRequestBodies(openapi, schemaName, propertyName) {
		let field;
		const schema = this.getSchemaFromRequestBodies(openapi, schemaName);

		if (schema != undefined)
			field = OpenApi.getPropertyFromSchema(schema, propertyName);

		return field;
	}

	static getProperty(openapi, schemaName, propertyName, localSchemas) {
		schemaName = this.getSchemaNameFromRef(schemaName);
		let field;

		if (localSchemas && localSchemas[schemaName] && localSchemas[schemaName].properties)
			field = OpenApi.getPropertyFromSchema(localSchemas[schemaName], propertyName);

		if (field == undefined) {
			field = OpenApi.getPropertyFromSchemas(openapi, schemaName, propertyName);

			if (field == undefined)
				field = OpenApi.getPropertyFromRequestBodies(openapi, schemaName, propertyName);
		}

		return field;
	}

	static getPropertiesWithRef(openapi, schemaName, $ref, localSchemas) {
		schemaName = this.getSchemaNameFromRef(schemaName);
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
				if (field.type == "array") {
					processDependenciesFromSchema(field.items, list);
				} else if (field.type == "object") {
					processDependenciesFromSchema(field, list);
				} else if (field.$ref != undefined) {
					processDependency(this.getSchemaNameFromRef(field.$ref), list);
				}
			}
		}

		schemaName = this.getSchemaNameFromRef(schemaName);

		if (list == undefined)
			list = [];

		if (localSchemas != undefined && localSchemas[schemaName] != undefined)
			processDependenciesFromSchema(localSchemas[schemaName], list);

		let schema = this.getSchemaFromRequestBodies(openapi, schemaName);

		if (schema != undefined && schema.properties != undefined)
			processDependenciesFromSchema(schema, list);

		schema = this.getSchemaFromSchemas(openapi, schemaName);

		if (schema != undefined && schema.properties != undefined)
			processDependenciesFromSchema(schema, list);

		return list;
	}

	static getDependenciesSchemas(openapi, schema) {
		const list = [];
		// TODO : varrer todos os schema.properties e adicionar na lista os property.properties que não se repetem
		return list;
	}

	static getDependents(openapi, schemaNameTarget, onlyInDocument, localSchemas) {
		const processSchema = (schema, schemaName, schemaNameTarget, onlyInDocument, list) => {
			if (schema == null || schema.properties == null) return;

			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.$ref != null) {
					let found = false;
					if (field.$ref == schemaNameTarget || this.getSchemaNameFromRef(field.$ref) == schemaNameTarget) found = true;

					if (found == true && (onlyInDocument != true || field.type == "object")) {
						if (list.find(item => item.table == schemaName && item.field == fieldName) == null) {
							list.push({"table": schemaName, "field": fieldName})
						}
					}
				}
			}
		}

		schemaNameTarget = this.getSchemaNameFromRef(schemaNameTarget);
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

	static resolveSchema(propertyName, schema, openapi, localSchemas) {
		if (typeof(schema) == "string") {
			const schemaName = this.getSchemaNameFromRef(schema);
			let field;

			if (localSchemas && localSchemas[schemaName] && localSchemas[schemaName].properties && OpenApi.getPropertyFromSchema(localSchemas[schemaName], propertyName) != undefined)
				return localSchemas[schemaName];

			if (OpenApi.getPropertyFromSchemas(openapi, schemaName, propertyName) != undefined)
				return this.getSchemaFromSchemas(openapi, schemaName);

			return OpenApi.getSchemaFromRequestBodies(openapi, schemaName);
		} else if (schema.properties != undefined) {
			return schema;
		}

		return schema;
	}

	// (service, (service.field|foreignTableName)
	static getForeignKeyDescription(openapi, schema, fieldName, localSchemas) {
		let field = undefined;
		let schemaName = "";

		if (typeof(schema) == "string") {
			schemaName = schema;
			field = OpenApi.getProperty(openapi, schemaName, fieldName, localSchemas);
		} else if (schema.properties != undefined) {
			field = OpenApi.getPropertyFromSchema(schema, fieldName);
		}

		if (field == undefined) {
			console.log(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : missing field`);
			return undefined;
		}

		if (field.$ref == undefined) {
			return undefined;
		}

		const serviceRef = this.getSchemaFromSchemas(openapi, field.$ref);

		if (serviceRef == undefined) {
			console.log(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : missing service ${field.$ref}`);
			return undefined;
		}

		let pos = field.$ref.indexOf("?");

		if (pos >= 0 && Qs != undefined) {
			const fieldsRef = Qs.parse(field.$ref.substring(pos), {ignoreQueryPrefix: true, allowDots: true});
			const entries = Object.entries(fieldsRef);
			let isUniqueKey = entries.length == serviceRef.primaryKeys.length;

			if (isUniqueKey == true) {
				for (let [fieldName, fieldNameMap] of entries) {
					if (serviceRef.primaryKeys.indexOf(fieldName) < 0) {
						isUniqueKey = false;
						break;
					}
				}
			}

			const ret = {tableRef: field.$ref, fieldsRef: fieldsRef, isUniqueKey: isUniqueKey};
//			console.log(`[${this.constructor.name}.getForeignKeyDescription(${fieldName})] : ret :`, ret);
			return ret;
		}

		const fieldsRef = {};

		for (const primaryKey of serviceRef.primaryKeys) fieldsRef[primaryKey] = null;

		if (Object.keys(fieldsRef).length == 1) {
			for (const primaryKey in fieldsRef) fieldsRef[primaryKey] = fieldName;
		} else if (Object.keys(fieldsRef).length > 1) {

			for (let fieldRef in fieldsRef) {
				if (fieldsRef[fieldRef] == null && OpenApi.getProperty(openapi, field.$ref, fieldRef, localSchemas) != undefined) {
					fieldsRef[fieldRef] = fieldRef;
				}
			}

			for (let fieldRef in fieldsRef) if (fieldsRef[fieldRef] == "id") fieldsRef[fieldRef] = fieldName;
		}

		for (let fieldRef in fieldsRef) if (fieldsRef[fieldRef] == null) {
			console.error(`[${this.constructor.name}.getForeignKeyDescription(${schemaName}, ${fieldName})] : don't pair with key ${fieldRef} :`, fieldsRef);
		}
		// TODO : alterar para {fieldsRef: {"key1": field1, "key2": field2, "key3": getQueryString(field.$ref, "key3"), "key4": getQueryString(field.$ref, "key4")}}
		const ret = {tableRef: field.$ref, fieldsRef: fieldsRef, isUniqueKey: true};
//		console.log(`[${this.constructor.name}.getForeignKeyDescription(${fieldName})] : ret :`, ret);
		return ret;
	}

	static getForeignKey(openapi, schema, fieldName, obj, localSchemas) {
		if (fieldName == "CpfCnpj" && obj.cpfCnpj != null)
			console.log(`[${this.constructor.name}.getPrimaryKeyForeign(${fieldName})] : obj :`, obj);

		const foreignKeyDescription = OpenApi.getForeignKeyDescription(openapi, schema, fieldName, localSchemas);

		if (foreignKeyDescription == undefined)
			return undefined;

		let key = {};

		for (let [fieldRef, field] of Object.entries(foreignKeyDescription.fieldsRef)) {
			key[field] = obj[fieldRef];
		}

		schema = this.resolveSchema(fieldName, schema, openapi, localSchemas);
		key = this.copyFields(schema, key);
		console.log(`[${this.constructor.name}.getForeignKey(${fieldName})] : obj :`, obj, "key :", key);
		return key;
	}

	static getPrimaryKeyForeign(openapi, schema, fieldName, obj, localSchemas) {
		const process = (openapi, schema, fieldName, obj) => {
			if (schema == undefined) {
				console.error(`[${this.constructor.name}.getPrimaryKeyForeign.process] schema undefined`, schema);
				return;
			}

			if (schema.properties == undefined) {
				console.error(`[${this.constructor.name}.getPrimaryKeyForeign.process] schema.properties undefined`, schema);
				return;
			}

			const foreignKeyDescription = this.getForeignKeyDescription(openapi, schema, fieldName, localSchemas);

			if (foreignKeyDescription == undefined)
				return undefined;

			const key = {};
			const ret = {"table": foreignKeyDescription.tableRef, "primaryKey": key, "valid": false, "isUniqueKey": foreignKeyDescription.isUniqueKey};
			if (obj == undefined || obj == null) return ret;
			let valid = true;

			for (let [fieldRef, fieldNameMap] of Object.entries(foreignKeyDescription.fieldsRef)) {
				if (typeof(fieldNameMap) == "string") {
					let value;

					if (fieldNameMap.startsWith("*") == true) {
						value = fieldNameMap.substring(1);
					} else {
						value = OpenApi.getValueFromSchema(schema, fieldNameMap, obj);

						if (value != null && value[fieldRef] != null) {
							value = value[fieldRef]
						}
					}

					key[fieldRef] = value;
					if (value == undefined || value == "") valid = false;
				} else {
					valid = false;
				}
			}

			ret.valid = valid;
//			if (fieldName == "CpfCnpj" && foreignKeyDescription.tableRef.indexOf("?") >= 0) console.log(`[${this.constructor.name}.getPrimaryKeyForeign(${fieldName})] : obj :`, obj, "ret :", ret);
			return ret;
		}

		let ret = undefined;

		if (typeof schema == "string") {
			schema = this.getSchemaNameFromRef(schema);

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

}

OpenApi.methods = ["get", "post", "put", "patch", "delete"]

export {OpenApi}
