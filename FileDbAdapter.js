import fs from "fs";
import {OpenApi} from "./webapp/es6/OpenApi.js";
import {DataStore, Filter} from "./webapp/es6/DataStore.js";

const fsPromises = fs.promises;

class FileDbAdapter {

	constructor(openapi) {
		this.fileTables = new Map();
		this.openapi = openapi;
	}

	load(tableName, defaultRows) {
		return fsPromises.readFile(tableName + ".json").
		then(data => JSON.parse(data)).
		catch(() => {
			return this.store(tableName, defaultRows) 
		}).
		then(list => {
			this.fileTables.set(tableName, true);
			return list;
		});
	}

	loadSync(tableName, defaultRows) {
		let list

		try {
			const data = fs.readFileSync(tableName + ".json")

			try {
				list = JSON.parse(data)
			} catch (error) {
				return []
			}
		} catch (error) {
			list = this.storeSync(tableName, defaultRows) 
		}

		this.fileTables.set(tableName, true)
		return list;
	}

	storeBase(tableName, list) {
		const schema = this.openapi.components.schemas[tableName];
		let listOut;

		if (schema != null && schema.properties.id != undefined) {
			const rufsSchema = new DataStore(tableName, schema);
			listOut = [];

			for (let i = 0; i < list.length; i++) {
				let item = list[i];

				if (item.id == undefined) {
					item = OpenApi.copyFields(rufsSchema, item);
					item.id = ++i;
				}

				listOut.push(item);
			}
		} else {
			listOut = list;
		}

		return listOut
	}

	store(tableName, list) {
		const listOut = this.storeBase(tableName, list)
		return fsPromises.writeFile(tableName + ".json", JSON.stringify(listOut, null, "\t")).then(() => listOut);
	}

	storeSync(tableName, list) {
		const listOut = this.storeBase(tableName, list)
		fs.writeFile(tableName + ".json", JSON.stringify(listOut, null, "\t"))
		return listOut
	}

	insert(tableName, obj) {
		return this.load(tableName, []).
		then(list => {
			if (this.openapi.components.schemas[tableName].properties.id != undefined) {
				if (list.length > 0) {
					obj.id = list[list.length-1].id + 1;
				} else {
					obj.id = 1;
				}
			}

			list.push(obj);
			return this.store(tableName, list).then(() => obj);
		});
	}

	find(tableName, fields) {
		return this.load(tableName, []).then(list => Filter.find(list, fields));
	}

	findOne(tableName, key) {
		return this.load(tableName, []).then(list => Filter.findOne(list, key));
	}

	findOneSync(tableName, key) {
		return Filter.findOne(this.loadSync(tableName, []), key)
	}

	update(tableName, key, obj) {
		return this.load(tableName, []).
		then(list => {
			const pos = Filter.findPos(list, key);

			if (pos < 0)
				throw new Error(`[FileDbAdapter.update(name = ${tableName}, key = ${key})] : don't find object with referred key`);

			list[pos] = obj;
			return this.store(tableName, list).then(() => obj);
		});
	}

	deleteOne(tableName, key) {
		return this.load(tableName, []).
		then(list => {
			const pos = Filter.findPos(list, key);

			if (pos < 0)
				throw new Error(`[FileDbAdapter.update(name = ${tableName}, key = ${key})] : don't find object with referred key`);

			list.splice(pos, 1);
			return this.store(tableName, list);
		});
	}

}

export {FileDbAdapter};
