import {CaseConvert} from "./CaseConvert.js";

class RufsSchema {

	constructor(name, schema) {
		this.name = name;
		this.properties = typeof schema.properties === "string" ? JSON.parse(schema.properties) : schema.properties;
		this.foreignKeys = schema.foreignKeys || {};
		this.uniqueKeys = schema.uniqueKeys;
		this.primaryKeys = schema.primaryKeys || [];
		const entries = Object.entries(this.properties);
		this.shortDescriptionList = [];
		// TODO : código temporário até terminar de migrar field.unique para schema.uniqueKeys
		if (this.uniqueKeys == undefined) {
			this.uniqueKeys = {};

			for (let [fieldName, field] of entries) {
				if (field.unique != undefined) {
					this.uniqueKeys[fieldName] = [fieldName];
				}
			}
		}

		for (let [fieldName, field] of entries) {
			if (field.type == undefined) field.type = "string";
			if (field.orderIndex == undefined) field.orderIndex = entries.length;
			if (field.tableVisible == undefined) field.tableVisible = true;
			if (field.hiden == true) field.tableVisible = false;
			if (field.shortDescription == undefined) field.shortDescription = false;
			if (field.shortDescription == true) this.shortDescriptionList.push(fieldName);
		}
		// Se não foi definido manualmente o shortDescriptionList, monta em modo automático usando os uniqueMaps
		if (this.shortDescriptionList.length == 0) {
			if (this.primaryKeys.find(fieldName => this.properties[fieldName].tableVisible == false) == undefined) {
				Array.prototype.push.apply(this.shortDescriptionList, this.primaryKeys);
			}

			for (let [name, list] of Object.entries(this.uniqueKeys)) {
				if (list.find(fieldName => this.properties[fieldName].tableVisible == false) == undefined) {
					for (let fieldName of list) if (this.shortDescriptionList.includes(fieldName) == false) this.shortDescriptionList.push(fieldName);
					if (this.shortDescriptionList.length > 3) break;
				}
			}

			for (let [fieldName, field] of entries) {
				if (this.shortDescriptionList.length > 3) break;
				
				if (field.tableVisible == true && this.shortDescriptionList.includes(fieldName) == false) {
					this.shortDescriptionList.push(fieldName);
				}
			}
		}
	}

	checkPrimaryKey(obj) {
		var check = true;

		for (var fieldName of this.primaryKeys) {
			if (obj[fieldName] == undefined) {
				check = false;
				break;
			}
		}

		return check;
	}
	// public
	copyFields(dataIn) {
		const ret = {};

		for (let [fieldName, field] of Object.entries(this.properties)) {
			const value = dataIn[fieldName];

			if (value != undefined) {
				const type = field["type"];
				
				if (type == undefined || type == "string") {
					ret[fieldName] = value;
				} else if (type == "number" || type == "integer") {
					if (typeof value == "string") {
						ret[fieldName] = new Number(value).valueOf();
					} else {
						ret[fieldName] = value;
					}
				} else if (type == "boolean") {
					if (value == true)
						ret[fieldName] = true;
					else if (value == false)
						ret[fieldName] = false;
					else
						ret[fieldName] = (value == "true");
				} else if (type == "date" || type == "datetime-local") {
					ret[fieldName] = new Date(value);
				} else {
					ret[fieldName] = value;
				}
			}
		}

		return ret;
	}
	// private, projected for extract primaryKey and uniqueKeys
	static copyFieldsFromList(dataIn, fieldNames, retutnNullIfAnyEmpty) {
		let ret = {};

		for (let fieldName of fieldNames) {
			if (dataIn[fieldName] != undefined) {
				ret[fieldName] = dataIn[fieldName];
			} else {
				if (retutnNullIfAnyEmpty == true) {
					ret = null;
					break;
				}
			}
		}

		return ret;
	}

	getPrimaryKey(obj) {
		return RufsSchema.copyFieldsFromList(obj, this.primaryKeys, true);
	}
	// public, return primary and uniqueKeys if present in obj
	getKeys(obj) {
		const ret = [];
		// first, primary key
		{
			const primaryKey = this.getPrimaryKey(obj);
			if (primaryKey != null) ret.push(primaryKey);
		}
		// unique keys
		for (let [name, uniqueKey] of Object.entries(this.uniqueKeys)) {
			let key = RufsSchema.copyFieldsFromList(obj, uniqueKey, true);
			if (key != null) ret.push(key);
		}

		return ret;
	}

}
// minimal wrapper to Html5 IndexedDb
class DataStore extends RufsSchema {

	constructor(name, schema, list) {
		super(name, schema);
		this.list = list || [];
	}

	clear() {
		for (let fieldName in this.properties) {
			let field = this.properties[fieldName];
			delete field.externalReferencesStr;
		}

		return Promise.resolve();
	}

	process(action, params) {
		console.log(`${this.constructor.name}.process(${action}, ${JSON.stringify(params)})`);
		return this.clear();
	}

	find(params) {
        return Filter.find(this.list, params);
	}

	findOneIn(paramsList) {
        return Filter.findOneIn(this.list, paramsList);
	}

	findPos(params) {
		return Filter.findPos(this.list, params);
	}

	findOne(params) {
		let pos = this.findPos(params);
		return pos >= 0 ? this.list[pos] : null;
	}
	// private, use in get, save, update and remove
	updateList(data, oldPos, newPos) {
        if (oldPos == undefined && newPos == undefined) {
			let primaryKey = this.getPrimaryKey(data);
			let pos = -1;

			if (Object.entries(primaryKey).length > 0) {
				pos = this.findPos(primaryKey);
			}

			if (pos >= 0) {
				oldPos = newPos = pos;
				// replace
				this.list[oldPos] = data;
			} else {
				// add
				this.list.push(data);
				newPos = this.list.length - 1;
			}
        } else if (oldPos != undefined && newPos == undefined) {
        	// remove
        	this.list.splice(oldPos, 1);
        } else if (oldPos != undefined && oldPos == newPos) {
        	// replace
           	this.list[oldPos] = data;
        }
        
        return {"data": data, "oldPos": oldPos, "newPos": newPos};
	}

	cache(primaryKey, data) {
		for (let [fieldName, field] of Object.entries(this.properties)) if (field.type.includes("date") || field.type.includes("time")) data[fieldName] = new Date(data[fieldName]);
		let pos = this.findPos(primaryKey);
		let ret;

		if (pos < 0) {
			ret = this.updateList(data);
		} else {
			ret = this.updateList(data, pos, pos);
		}

		console.log(`[${this.constructor.name}.cache(${JSON.stringify(primaryKey)})] :`, ret);
		return ret;
	}

}
// manager of  IndexedDb collections
class DataStoreManager {

	setSchemas(list) {
		this.services = {};

		if (Array.isArray(list) == true) {
			for (let service of list) {
				this.services[service.name] = service;
			}
		}
		// add field.foreignKey to schema.foreignKeys
		const setForeignKey = (list, item) => {
			if (list.find(candidate => JSON.stringify(candidate) == JSON.stringify(item)) == undefined)
				list.push(item);
		}

		for (let [name, schema] of Object.entries(this.services)) {
			for (let [fieldName, field] of Object.entries(schema.properties)) {
				if (field.foreignKeysImport != undefined) {
					if (schema.foreignKeys[fieldName] == undefined) schema.foreignKeys[fieldName] = [];
					const foreignKeyDescription = schema.foreignKeys[fieldName];

					if (Array.isArray(field.foreignKeysImport) == true) {
						for (let item of field.foreignKeysImport) {
							setForeignKey(foreignKeyDescription, {"fields": [fieldName], "tableRef": item.table, "fieldsRef": [item.field]});
						}
					} else if (typeof(field.foreignKeysImport) == "string") {
						setForeignKey(foreignKeyDescription, {"fields": [fieldName], "tableRef": field.foreignKeysImport, "fieldsRef": this.services[field.foreignKeysImport].primaryKeys});
					} else
						throw new Error(`[${this.constructor.name}.getForeignKeyDescription(${service.name}, ${name})] : invalid 'field.foreignKeysImport'`);
				}
			}
		}
	}

	constructor(list) {
		this.setSchemas(list);
	}

	getService(serviceName, tokenData) {
		serviceName = CaseConvert.underscoreToCamel(serviceName, false);

		if (tokenData && tokenData.roles[serviceName] == undefined) {
			throw new Error("Unauthorized service Access");
		}

		const service = this.services[serviceName];
		return service;
	}
	// used by websocket
	removeInternal(schemaName, primaryKey) {
		const service = this.getService(schemaName);
        let pos = service.findPos(primaryKey);
		console.log("DataStore.removeInternal : pos = ", pos, ", data :", service.list[pos]);
        return pos >= 0 ? service.updateList(service.list[pos], pos) : null;
	}
	// ignoreCache is used in websocket notifications
	get(schemaName, primaryKey, ignoreCache) {
		const dataStore = this.getService(schemaName);
        const pos = dataStore.findPos(primaryKey);
        if (pos >= 0) 
        	return Promise.resolve({"data": dataStore.list[pos]});
        else
        	return Promise.resolve(null);
	}

	getDocument(schemaName, obj, merge, tokenData) {
		let document;

		if (merge != true) {
			document = {};
		} else {
			document = obj;
		}

		const service = this.getService(schemaName, tokenData);
		let promises = [];
		// One To One
		{
			const listToGet = [];

			for (let [fieldName, field] of Object.entries(service.properties)) {
				if (field.foreignKeysImport != undefined) {
					console.log(`[${this.constructor.name}.getDocument(${schemaName})] geting foreignKey for field ${fieldName} :`, field.foreignKeysImport);
					const item = this.getPrimaryKeyForeign(service, fieldName, obj);
					console.log(`[${this.constructor.name}.getDocument(${schemaName})] result foreignKey for field ${fieldName} :`, item);

					if (!tokenData || tokenData.roles[item.table] != undefined) {
						if (item.valid == true && listToGet.find(candidate => candidate.fieldName == fieldName) == undefined) {
							listToGet.push({"fieldName": fieldName, item});
						}
					}
				}
			}

			const next = (document, list) => {
				if (list.length == 0) return;
				const data = list.shift();
				// TODO : log para encontrar quem está duplicando as entradas
				return this.get(data.item.table, data.item.primaryKey).
				then(objExternal => document[data.fieldName] = objExternal).
				then(() => next(document, list));
			}

			promises.push(next(document, listToGet));
		}
		// One To Many
		{
			const dependents = this.getDependents(schemaName, true);

			for (let item of dependents) {
				if (!tokenData || tokenData.roles[item.table] != undefined) {
					let rufsServiceOther = this.getService(item.table, tokenData);
					let field = rufsServiceOther.properties[item.field];
					let foreignKey = this.getForeignKey(rufsServiceOther, item.field, obj);
					// TODO : check to findRemote
					promises.push(service.find(foreignKey).then(list => document[field.document] = list));
				}
			}
		}

		return Promise.all(promises).then(() => document);
	}

	getDependencies(serviceName, list) {
		const processDependency = (dependency, list) => {
			if (list.includes(dependency) == false) {
				const service = this.services[dependency];

				if (service != undefined) {
					list.unshift(dependency);
					this.getDependencies(dependency, list);
				} else {
					console.log(`[${this.constructor.name}.getDependencies(${serviceName})] : don't registred dependency ${dependency}.`);
				}
			}
		}

		if (list == undefined)
			list = [];

		const service = this.services[serviceName];

		if (service == undefined) {
			console.log(`[${this.constructor.name}.getDependencies(${serviceName})] : don't registred service.`);
			return list;
		}

		for (let [fieldName, field] of Object.entries(service.properties)) {
			if (field.foreignKeysImport != undefined) {
				if (Array.isArray(field.foreignKeysImport) == true) {
					for (let item of field.foreignKeysImport) {
						processDependency(item.table, list);
					}
				} else if (typeof(field.foreignKeysImport) == "string") {
					processDependency(field.foreignKeysImport, list);
				} else
					throw new Error(`[${this.constructor.name}.getDependencies(${serviceName}, ${fieldName})] : invalid 'field.foreignKeysImport'`);
			}
		}

		return list;
	}

	getDependents(name, onlyInDocument) {
		const services = Object.values(this.services);

		const ret = [];

		for (let service of services) {
			for (let [fieldName, field] of Object.entries(service.properties)) {
				if (field.foreignKeysImport != undefined) { // foreignKeysImport : [{table, field}]
					let found = false;

					if (Array.isArray(field.foreignKeysImport) == true) {
						if (field.foreignKeysImport.find(item => item.table == name) != undefined) found = true;
					} else if (typeof(field.foreignKeysImport) == "string") {
						if (field.foreignKeysImport == name) found = true;
					} else {
						throw new Error(`[${this.constructor.name}.getForeignKeyDescription(${service.name}, ${name})] : invalid 'field.foreignKeysImport'`);
					}

					if (found == true && (onlyInDocument != true || field.document != undefined)) {
						if (ret.find(item => item.table == service.name && item.field == fieldName) != undefined) {
							console.error(`[${this.constructor.name}.getDependents] : already added table ${service.name} and field ${fieldName} combination.`);
						} else {
							ret.push({"table": service.name, "field": fieldName})
						}
					}
				}
			}
		}

		return ret;
	}

	getForeignKeyEntries(serviceName, foreignServiceName) {
		const service = this.services[serviceName];
		let foreignKeyEntries = [];

		for (let [fieldName, field] of Object.entries(service.properties)) {
			if (field.foreignKeysImport != undefined) {
				if (Array.isArray(field.foreignKeysImport) == true) {
					const list = field.foreignKeysImport.filter(item => item.table == foreignServiceName);

					if (list.length > 0)
						foreignKeyEntries.push({fieldName, field});
				} else if (typeof(field.foreignKeysImport) == "string") {
					if (field.foreignKeysImport == foreignServiceName)
						foreignKeyEntries.push({fieldName, field});
				} else
					throw new Error(`[${this.constructor.name}.getForeignKeyEntries(${serviceName}, ${foreignServiceName})] : invalid 'field.foreignKeysImport'`);
			}
		}

		return foreignKeyEntries;
	}
    // devolve o rufsService apontado por field
    getForeignService(service, fieldName) {
		const field = service.properties[fieldName];
		let serviceName;

		if (Array.isArray(field.foreignKeysImport) == true)
	    	serviceName = field.foreignKeysImport[0].table;
		else if (typeof(field.foreignKeysImport) == "string")
			serviceName = field.foreignKeysImport;
		else
			throw new Error(`[${this.constructor.name}.getForeignKeyDescription(${service.name}, ${name})] : invalid 'field.foreignKeysImport'`);
    	// TODO : refatorar consumidores da função getForeignService(field), pois pode haver mais de uma referência
        return this.services[serviceName];
    }
	// (service, (service.field|foreignTableName)
	getForeignKeyDescription(service, name) {
		if (typeof service == "string")
			service = this.services[service];

		let foreignKey = undefined;

		if (service.properties[name] != undefined) {
			const field = service.properties[name];

			if (field.foreignKeysImport != undefined) {
				if (Array.isArray(field.foreignKeysImport) == true)
					foreignKey = service.foreignKeys[field.foreignKeysImport[0].name];
				else if (typeof(field.foreignKeysImport) == "string") {
					let fields;
					const fieldsRef = this.services[field.foreignKeysImport].primaryKeys;

					if (fieldsRef.length == 1) {
						fields = [name]
					} else {
						fields = fieldsRef;
					}

					foreignKey = {fields: fields, tableRef: field.foreignKeysImport, fieldsRef: fieldsRef};
				} else
					throw new Error(`[${this.constructor.name}.getForeignKeyDescription(${service.name}, ${name})] : invalid 'field.foreignKeysImport'`);
			}
		} else {
			for (let [itemName, item] of Object.entries(service.foreignKeys)) {
				if (item.tableRef == name) {
					foreignKey = service.foreignKeys[itemName];
					break;
				}
			}
		}

		return foreignKey;
	}
	// (service, (service.field|foreignTableName), service.obj) => [{name: constraintName, table: foreignTableName, foreignKey: {}}]
	getPrimaryKeyForeign(service, name, obj) {
		const foreignKeyDescription = this.getForeignKeyDescription(service, name);

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

		const tableRef = foreignKeyDescription.tableRef;

		if (this.services[tableRef] == undefined) valid = false;

    	return {"name" : foreignKeyDescription.name, "table": tableRef, "primaryKey": key, "valid": valid};
	}
	// primaryKeyForeign = {rufsGroupOwner: 2, id: 1}, fieldName = "request"
	// field.foreignKeysImport: [{table: "request", field: "rufsGroupOwner"}]
	// foreignKey = {rufsGroupOwner: 2, request: 1}
	getForeignKey(service, name, obj) {
		const foreignKeyDescription = this.getForeignKeyDescription(service, name);

		if (foreignKeyDescription == undefined)
			return undefined;

		const key = {};

		for (let i = 0; i < foreignKeyDescription.fields.length; i++) {
			const field = foreignKeyDescription.fields[i];
			const fieldRef = foreignKeyDescription.fieldsRef[i];
			key[field] = obj[fieldRef];
		}

    	return key;
	}

}
// differ to DataStore by instance and filter, aggregate, sort and pagination features
class DataStoreItem extends DataStore {
	
	constructor(name, schema, list) {
		super(name, schema, list);
		// instance
		this.instance = {};
		this.instanceFlags = {};
		// aggregate
		this.instanceAggregateRange = {};
		this.aggregateResults = new Map();
		// sort
		this.fieldsSort = {};
		// filter
		this.instanceFilter = {};
		this.instanceFilterRange = {};
		this.instanceFilterRangeMin = {};
		this.instanceFilterRangeMax = {};
		this.filterResults = this.list;
		// pagination
		this.pagination = new Pagination(100);
	}

	isClean() {
		var ret = angular.equals(this.original, this.instance);
		return ret;
	}

	process(action, params) {
		return super.process(action, params).then(() => {
			return this.clearFilter().then(() => {
				this.clearSort();
				this.clearAggregate();
			});
		})
	}
// Instance section
	clear() {
		return super.clear().then(() => {
			this.instance = {};
			this.instanceFlags = {};
			return this.setValues(); // set default values
		});
	}

	setValue(fieldName, obj) {
		const field = this.properties[fieldName];
		delete field.externalReferencesStr;
		let value = obj[fieldName];

		if (value != undefined) {
			if (field.foreignKeysImport != undefined) {
				field.externalReferencesStr = this.buildFieldStr(fieldName, obj);
			} else if (field.flags != undefined && field.flags != null) {
				// field.flags : String[], vm.instanceFlags[fieldName] : Boolean[]
				this.instanceFlags[fieldName] = Utils.strAsciiHexToFlags(value.toString(16));
			} else if (field.enum != undefined) {
				let pos;

				if (value instanceof Object) {
					let strValue = JSON.stringify(value);
					pos = field.filterResultsStr.indexOf(strValue);
					field.externalReferencesStr = field.filterResultsStr[pos];
				} else {
					pos = field.filterResults.indexOf(value);
					field.externalReferencesStr = field.filterResultsStr[pos];
				}

				if (pos < 0) {
					console.error(`DataStoreItem.setValue(${fieldName}) : don\'t found\nvalue:`, value, `\nstr:\n`, field.externalReferences, `\noptions:\n`, field.filterResultsStr);
				}
			} else {
				if (field.type == "datetime-local" || field.type == "date") {
					value = new Date(value);
				}
			}
		}

		this.instance[fieldName] = value;
	}

	setValues(obj, dataStoreManager) {
		let getDefaultValue = field => {
			let value;

			if (field.default != undefined) {
				if (field.type == "integer" && field.default != "") {
					value = Number.parseInt(field.default);
				} else if (field.type == "number" && field.default != "") {
					value = Number.parseFloat(field.default);
				} else if ((field.type.includes("date") || field.type.includes("time")) && field.default != "")  {
					value = new Date();
					value.setMilliseconds(0);
				} else {
					value = field.default;
				}
			} else {
				value = undefined;
			}

			return value;
		};

		if (obj == undefined) {
			obj = {};
		}

		for (let [fieldName, field] of Object.entries(this.properties)) {
			if (obj[fieldName] == undefined && field.default != undefined) {
				const value = getDefaultValue(field);
				if (value != undefined) obj[fieldName] = value;
			}
		}

		let promise;

		if (dataStoreManager != undefined && dataStoreManager.services[this.name] != undefined)
			promise = dataStoreManager.getDocument(this.name, obj, false);
		else
			promise = Promise.resolve();

		return promise.then(() => {
			for (let fieldName in this.properties) this.setValue(fieldName, obj);
		});
	}
// Aggregate Section
	clearAggregate() {
		this.instanceAggregateRange = {};
		this.aggregateResults = new Map();
	}
    // private
	buildField(stringBuffer, fieldName, obj) {
    	let value = obj[fieldName];

		if (value == undefined || value == null || value === "") {
			return stringBuffer;
		}
		
		if ((value instanceof Date) == false && (value instanceof Object) == true) {
			stringBuffer.push(JSON.stringify(value));
			return stringBuffer;
		}

    	const field = this.properties[fieldName];

		if (field == undefined) {
			console.error("buildField : field ", fieldName, " don't found in properties, options are : ", this.properties);
			return stringBuffer;
		}

		if (field.foreignKeysImport != undefined) {
			const item = this.serverConnection.getPrimaryKeyForeign(this, fieldName, obj);
			const service = this.serverConnection.services[item.table];

			if (service != undefined) {
				const primaryKey = item.primaryKey;
				let pos = service.findPos(primaryKey);

				if (pos >= 0) {
					stringBuffer.push(service.listStr[pos]);
				} else {
					let pos = service.findPos(primaryKey);
//					console.error(`[${this.constructor.name}.buildField] don't find item from service ${service.name} with primaryKey ${JSON.stringify(primaryKey)}, used ${service.name}.getPrimaryKeyForeign(${JSON.stringify(obj)}, ${fieldName}, ${JSON.stringify(field.foreignKeysImport)})`);
	//				throw new Error(`this.buildField : don't find itemStr from service ${service.name}`);
				}
			} else {
				console.error(`[${this.constructor.name}.buildField] don't loaded service ${item.table}`);
			}
		} else if (fieldName == "id") {
			// TODO : o "id" não deve fazer parte de StrValue, criar uma lista para armazenar os primaryKeys
			function padLeft(str, size, ch) {
				while (str.length < size) {
					str = ch + str;
				}

				return str;
			}

			stringBuffer.push(padLeft(value.toString(), 4, '0'));
		} else if (field.type.includes("date") || field.type.includes("time")) {
			stringBuffer.push(new Date(value).toLocaleString());
		} else {
			// TODO : verificar se o uso do "trim" não tem efeitos colaterais.
			stringBuffer.push(value.toString().trim());
		}

    	return stringBuffer;
    }
	// public
	buildFieldStr(fieldName, item) {
//		console.time("buildFieldStr" + "-" + fieldName);
		let stringBuffer = [];
		let str = "";
		this.buildField(stringBuffer, fieldName, item);
		if (stringBuffer.length > 0) str = stringBuffer.join(" - ");
//		console.timeEnd("buildFieldStr" + "-" + fieldName);
		return str;
	}

	applyAggregate(aggregate) {
		if (aggregate == undefined) aggregate = this.instanceAggregateRange; else this.instanceAggregateRange = aggregate;
		const dateRanges = ["secound", "minute", "hora", "dia", "mês", "ano"];
		
		const labelFromDate = (date, range) => {
			let type = dateRanges.indexOf(range);
			let str = "";
			if (type <= 5) str = date.getFullYear() + " " + str;
			if (type <= 4) str = date.getMonth()+1 + "/" + str;
			if (type <= 3) str = date.getDate() + "/" + str;
			if (type <= 2) str = date.getHours() + " " + str;
			return str;
		};
		
		this.aggregateResults = new Map();
		
		for (let item of this.filterResults) {
			let label = "";
			
			for (let fieldName in aggregate) {
				let value = item[fieldName];
				let range = aggregate[fieldName];
				let field = this.properties[fieldName];
				
				if (range != false && range != "" && range != 0) {
					if (field.foreignKeysImport != undefined) {
						label = label + this.buildFieldStr(fieldName, item) + ",";
					} else if (field.flags != undefined && field.flags != null) {
						label = label + value.toString(16) + ",";
					} else if (field.enum != undefined) {
						let pos = field.filterResults.indexOf(JSON.stringify(value));
						label = label + field.filterResultsStr[pos] + ",";
					} else if (field.htmlType == "number") {
						label = label + Math.trunc(value / range) * range + ",";
					} else if (field.htmlType.includes("date") || field.htmlType.includes("time")) {
						label = label + labelFromDate(value, range) + ",";
					}
				}
			}
			
			if (label.length > 0) {
				if (this.aggregateResults.has(label) == true) {
					this.aggregateResults.set(label, this.aggregateResults.get(label) + 1);
				} else {
					this.aggregateResults.set(label, 1);
				}
			}
		}
	}
// Sort section
	// format fieldsTable in correct order;
	orderFieldsSort() {
		const entries = Object.entries(this.fieldsSort);
		entries.sort((a, b) => a[1].orderIndex - b[1].orderIndex);
		this.fieldsTable = [];
		for (let [fieldName, field] of entries) if (field.hiden != true && field.tableVisible != false) this.fieldsTable.push(fieldName);
	}

	clearSort() {
		this.fieldsSort = {};

		for (let fieldName in this.properties) {
			this.fieldsSort[fieldName] = {};
			this.fieldsSort[fieldName].type = this.properties[fieldName].type;
			this.fieldsSort[fieldName].orderIndex = this.properties[fieldName].orderIndex;
			this.fieldsSort[fieldName].sortType = this.properties[fieldName].sortType;
			this.fieldsSort[fieldName].tableVisible = this.properties[fieldName].tableVisible;
		}

		this.applySort();
	}
	// sortType, orderIndex, tableVisible
	applySort(sort) {
		if (sort != undefined) {
			for (let [fieldName, field] of Object.entries(this.fieldsSort)) {
				if (sort[fieldName] != undefined) {
					field.sortType = sort[fieldName].sortType;
					field.orderIndex = sort[fieldName].orderIndex;
					field.tableVisible = sort[fieldName].tableVisible;
				}
			}
		}
		// format fieldsTable in correct order;
		this.orderFieldsSort();

		this.filterResults.sort((a, b) => {
			let ret = 0;
			
			for (let fieldName of this.fieldsTable) {
				let field = this.fieldsSort[fieldName];
				
				if (field.sortType != undefined) {
					let valA = a[fieldName];
					let valB = b[fieldName];
					
					if (valA != valB) {
						if (valB == undefined) ret = -1;
						else if (valA == undefined) ret = +1;
						else if (field.type == "integer" || field.type == "number") ret = valA - valB;
						else if (field.type == "string") ret = valA.localeCompare(valB);
						else if (field.type == "boolean") ret = valA - valB;
						else if (field.type.includes("date") == true || field.type.includes("time") == true) ret = valA.valueOf() - valB.valueOf();
						if (field.sortType == "desc") ret *= -1;
						if (ret != 0) break;
					}
				}
			}
			
			return ret;
		});

		this.pagination.changePage();
	}

	sortToggle(fieldName) {
		const field = this.fieldsSort[fieldName];
		field.sortType = field.sortType == "asc" ? "desc" : "asc";
		this.applySort();
	}

	sortLeft(fieldName) {
		this.fieldsSort[fieldName].orderIndex--;
		this.applySort();
	}

	sortRigth(fieldName) {
		this.fieldsSort[fieldName].orderIndex++;
		this.applySort();
	}
// Filter section	
	clearFilter() {
		// hora corrente, hora anterior, uma hora, hoje, ontem, um dia, semana corrente, semana anterior, uma semana, quinzena corrente, quinzena anterior, 15 dias, mês corrente, mês anterior, 30 dias, ano corrente, ano anterior, 365 dias
		this.instanceFilter = {};
		this.instanceFilterRange = {};
		this.instanceFilterRangeMin = {};
		this.instanceFilterRangeMax = {};
		this.filterResults = this.list;
		// TODO : verificar impacto
		return this.clear().then(() => {
			this.paginate();
		});
	}

	applyFilter(filter, filterRangeMin, filterRangeMax) {
		if (filter == undefined) filter = this.instanceFilter; else this.instanceFilter = filter; 
		if (filterRangeMin == undefined) filterRangeMin = this.instanceFilterRangeMin; else this.instanceFilterRangeMin = filterRangeMin; 
		if (filterRangeMax == undefined) filterRangeMax = this.instanceFilterRangeMax; else this.instanceFilterRangeMax = filterRangeMax;
		console.log(`DataStoreItem.applyFilter() :`, filter, filterRangeMin, filterRangeMax);

		const compareExact = (a, b) => {
			if (typeof a == "string" && typeof b == "string")
				return a.trimEnd() == b.trimEnd();
			else
				return a == b;
		}

		const processForeign = (fieldFilter, obj, fieldName, compareType) => {
			const compareFunc = (candidate, expected, compareType) => {
				return Filter.matchObject(expected, candidate, (a,b,fieldName) => fieldName == undefined ? (compareType == 0 ? compareExact(a ,b) : (compareType < 0 ? a < b : a > b)) : false, false);
			}
			
			const item = this.serverConnection.getPrimaryKeyForeign(this.rufsService, fieldName, obj);
			const service = this.serverConnection.services[item.table];
			const primaryKey = item.primaryKey;
			let candidate = service.findOne(primaryKey);
			let flag = compareFunc(candidate, fieldFilter.filter, 0);

			if (flag == true) {
				flag = compareFunc(candidate, fieldFilter.filterRangeMin, -1);

				if (flag == true) {
					flag = compareFunc(candidate, fieldFilter.filterRangeMax, 1);
				}
			}

			return flag;
		}

		const process = (expectedFields, expectedFieldsMin, expectedFieldsMax, list) => {
			const compareFunc = (candidate, expected, compareType) => {
				return Filter.matchObject(expected, candidate, (a,b,fieldName) => fieldName == undefined ? (compareType == 0 ? compareExact(a, b) : (compareType < 0 ? a < b : a > b)) : processForeign(a,candidate,fieldName, compareType), true);
			}
			
			return list.filter(candidate => {
				let flag = compareFunc(candidate, expectedFields, 0);

				if (flag == true) {
					flag = compareFunc(candidate, expectedFieldsMin, -1);

					if (flag == true) {
						flag = compareFunc(candidate, expectedFieldsMax, 1);
					}
				}

				return flag;
			});
		}

		const getFilteredItems = (objFilter, objFilterMin, objFilterMax) => {
			var list = [];

			if (objFilter != undefined && objFilter != null) {
				list = process(objFilter, objFilterMin, objFilterMax, this.list);
			} else {
				list = this.list;
			}

			return list;
		}
	
		this.filterResults = getFilteredItems(filter, filterRangeMin, filterRangeMax);
		this.paginate();
	}

	setFilterRange(fieldName, range) {
		const periodLabels =     [" minuto ", " hora ", " dia ", " semana ", " quinzena ",    " mês ",     " ano "];
		const periods =          [        60,     3600,   86400,  7 * 86400,   15 * 86400, 30 * 86400, 365 * 86400];
		let period;
		
		for (let i = 0; i < periodLabels.length; i++) {
			if (range.includes(periodLabels[i])) {
				period = periods[i] * 1000;
				break;
			}
		}
		
		let now = new Date().valueOf();
		let nowPeriodTrunc = Math.trunc(now / period) * period; 
		let dateIni = undefined;
		let dateEnd = undefined;
		
		if (range.includes(" corrente ")) {
			dateIni = new Date(nowPeriodTrunc);
		} else if (range.includes(" anterior ")) {
			dateEnd = new Date(nowPeriodTrunc);
			dateIni = new Date(nowPeriodTrunc - period);
		} else {
			dateIni = new Date(now - period);
		}
		
		const nowDate = new Date(); 
		let dayActiveStart = dateFns.startOfDay(nowDate);
		let dayLastStart = dateFns.startOfDay(nowDate);
		dayLastStart.setDate(dayLastStart.getDate()-1);
		let weekActiveStart = dateFns.startOfWeek(nowDate);
		let weekLastStart = new Date(weekActiveStart);
		weekLastStart.setDate(weekLastStart.getDate()-7);
		let monthActiveStart = dateFns.startOfMonth(nowDate);
		let monthLastStart = new Date(monthActiveStart);
		monthLastStart.setMonth(monthLastStart.getMonth()-1);
		let yearActiveStart = dateFns.startOfYear(nowDate);
		let yearLastStart = new Date(yearActiveStart);
		yearLastStart.setFullYear(yearLastStart.getFullYear()-1);
		
		if (range.includes("dia corrente") == true) {
			dateIni = dayActiveStart;
		} else if (range.includes("dia anterior") == true) {
			dateIni = dayLastStart;
			dateEnd = dayActiveStart;
		} else if (range.includes("semana corrente") == true) {
			dateIni = weekActiveStart;
		} else if (range.includes("semana anterior") == true) {
			dateIni = weekLastStart;
			dateEnd = weekActiveStart;
		} else if (range.includes("quinzena corrente") == true) {
			dateIni = nowDate.getDate() <= 15 ? monthActiveStart : new Date(monthActiveStart.setDate(15));
		} else if (range.includes("quinzena anterior") == true) {
			dateEnd = nowDate.getDate() <= 15 ? monthActiveStart : new Date(monthActiveStart.setDate(15));
			dateIni = new Date(dateEnd);
			if (dateEnd.getDate() > 15) dateIni.setDate(15); else dateIni.setDate(1); 
		} else if (range.includes("mês corrente") == true) {
			dateIni = monthActiveStart;
		} else if (range.includes("mês anterior") == true) {
			dateIni = monthLastStart;
			dateEnd = monthActiveStart;
		} else if (range.includes("ano corrente") == true) {
			dateIni = yearActiveStart;
		} else if (range.includes("ano anterior") == true) {
			dateIni = yearLastStart;
			dateEnd = yearActiveStart;
		}
		
		this.instanceFilterRangeMin[fieldName] = dateIni;
		this.instanceFilterRangeMax[fieldName] = dateEnd;
	}

}
/*
IDBKeyRange.bound
IDBKeyRange.lowerBound
IDBKeyRange.upperBound
IDBKeyRange.only
 */
class Filter {
	// private
	static matchObject(expectedFields, actualObject, testFunc, matchStringPartial, recursive) {
        let flag = true;

        for (let key in expectedFields) {
            let expectedProperty = expectedFields[key];
            
            if (expectedFields.hasOwnProperty(key) && expectedProperty != undefined) {
                let actualProperty = actualObject[key];

                if (expectedProperty == null) {
                	if (actualProperty != null) {
                        flag = false;
                	}
                } else if (actualProperty == undefined || actualProperty == null) {
                    flag = false;
                } else if (expectedProperty instanceof Date) {
                	if (typeof actualProperty === "string") {
                		flag = testFunc(expectedProperty.valueOf(), Date.parse(actualProperty));
                	} else if (actualProperty instanceof Date) {
                		flag = testFunc(expectedProperty.valueOf(), actualProperty.valueOf());
                	} else {
                		flag = false;
                	}
                } else if (typeof expectedProperty === "number") {
                	if (typeof actualProperty === "number") {
                    	flag = testFunc(expectedProperty, actualProperty);
                	} else {
                		flag = false;
                	}
                } else if (typeof expectedProperty === "string") {
                	if (typeof actualProperty === "string") {
                    	if (matchStringPartial == true) {
                            if (expectedProperty != "") {
                                flag = (actualProperty.trimEnd().indexOf(expectedProperty.trimEnd()) >= 0);
                            }
                        } else {
                            flag = (actualProperty.trimEnd() == expectedProperty.trimEnd());
                        }
                	} else {
                		flag = false;
                	}
                } else if (expectedProperty instanceof Object) {
                	if (recursive == true) {
	                    flag = matchObject(expectedProperty, actualProperty, matchStringPartial, recursive, testFunc);
                	} else {
                    	flag = testFunc(expectedProperty, actualProperty, key);
                	}
                } else {
                	throw new Error(`Invalid type of field ${key}, contents : ${expectedProperty}`);
                }
                
                if (flag == false) {
                	return false;
                }
            }
        }

        return flag;
    }
	// public
	static checkMatchExact(item, obj) {
    	let match = true;

    	for (let fieldName in obj) {
        	let expected = obj[fieldName];
        	if (typeof expected == "string") expected = expected.trimEnd();
        	let value = item[fieldName];
        	if (typeof value == "string") value = value.trimEnd();

        	if (value != expected) {
        		match = false;
        		break;
        	}
    	}

    	return match;
	}
	// public
	static find(list, obj) {
		return list.filter(item => Filter.checkMatchExact(item, obj));
	}
	// public
	static findOne(list, obj, callback) {
		var ret = null;

        for (var i = 0; i < list.length; i++) {
        	var item = list[i];
        	var match = Filter.checkMatchExact(item, obj);

        	if (match == true) {
        		ret = item;

        		if (callback) {
        			callback(i, item);
        		}

        		break;
        	}
        }

        return ret;
	}
	// public
	static findPos(list, params) {
		var ret = -1;
        Filter.findOne(list, params, pos => ret = pos);
        return ret;
	}
	// public
	static findOneIn(list, listParams) {
		var filterResults = [];

		if (list.length > 0) {
			for (var params of listParams) {
				filterResults.push(Filter.findOne(list, params));
			}
		}

		return filterResults;
	}

}

class Pagination {

    constructor(pageSize, page) {
    	this.list = [];
    	this.setPageSize(pageSize);
    	this.setPage(page);
    }
    
    setPageSize(pageSize) {
    	this.paginate(this.list, pageSize);
    }

    setPage(page) {
    	this.paginate(this.list, this.pageSize, page);
    }

    paginate(list, pageSize, page) {
    	if (pageSize != undefined) this.pageSize = pageSize; else this.pageSize = 100;
    	if (page != undefined) this.currentPage = page; else this.currentPage = 1;
    	this.list = list;
        var result = Math.ceil(list.length/this.pageSize);
        this.numPages = (result == 0) ? 1 : result;
    	this.changePage();
    }

    changePage() {
     	this.listPage = this.list.slice((this.currentPage-1) * this.pageSize, this.currentPage * this.pageSize);
     }

}

export {RufsSchema, DataStore, DataStoreManager, DataStoreItem, Filter, Pagination}
