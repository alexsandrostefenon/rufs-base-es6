import fs from "fs";
import {DataStore, Filter} from "./webapp/es6/DataStore.js";

const fsPromises = fs.promises;

class FileDbAdapter {

	constructor(openapi) {
		this.fileTables = new Map();
		this.openapi = openapi;
	}

	load(tableName) {
		return fsPromises.readFile(tableName + ".json").
		then(data => JSON.parse(data)).
		then(list => {
			this.fileTables.set(tableName, true);
			return list;
		});
	}

	store(tableName, list) {
		const schema = this.openapi.components.schemas[tableName];
		let listOut;

		if (schema.properties.id != undefined) {
			const rufsSchema = new DataStore(tableName, schema);
			listOut = [];

			for (let i = 0; i < list.length; i++) {
				let item = list[i];

				if (item.id == undefined) {
					item = rufsSchema.copyFields(item);
					item.id = ++i;
				}

				listOut.push(item);
			}
		} else {
			listOut = list;
		}

		return fsPromises.writeFile(tableName + ".json", JSON.stringify(listOut, null, "\t")).then(() => listOut);
	}

	insert(tableName, obj) {
		return this.load(tableName).
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
		return this.load(tableName).then(list => Filter.find(list, fields));
	}

	findOne(tableName, key) {
		return this.load(tableName).then(list => Filter.findOne(list, key));
	}

	update(tableName, key, obj) {
		return this.load(tableName).
		then(list => {
			const pos = Filter.findPos(list, key);

			if (pos < 0)
				throw new Error(`[FileDbAdapter.update(name = ${tableName}, key = ${key})] : don't find object with referred key`);

			list[pos] = obj;
			return this.store(tableName, list).then(() => obj);
		});
	}

	deleteOne(tableName, key) {
		return this.load(tableName).
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
