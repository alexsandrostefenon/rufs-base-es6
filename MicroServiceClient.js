// connnect into rest server
class MicroServiceClient extends ServerConnection {

	constructor(config) {
		super();
		HttpRestRequest.fetch = fetch;
		// config are ip, port and path to connect and user and password to acess
		if (config != undefined) {
			this.config = config;
		} else {
			this.config = {};
		}

		if (this.config.protocol == undefined) this.config.protocol = MicroServiceServer.getArg("protocol", "http");
		if (this.config.host == undefined) this.config.host = MicroServiceServer.getArg("host", "localhost");
		if (this.config.port == undefined) this.config.port = MicroServiceServer.getArg("port", "3000");
		if (this.config.appName == undefined) this.config.appName = MicroServiceServer.getArg("appName", "rufs");
		if (this.config.userId == undefined) this.config.userId = MicroServiceServer.getArg("user", "guest");
		if (this.config.password == undefined) this.config.password = MicroServiceServer.getArg("password", "anonymous");
		this.urlRest = `${this.config.protocol}://${this.config.host}:${this.config.port}/${this.config.appName}`;
	}

	login() {
		return super.login(this.urlRest, this.config.userId, this.config.password);
/*		
		this.restHeaders = {"content-type":"application/json"};
		return fetch(`${this.urlRest}/rest/authc`, {method: "POST", headers: this.restHeaders, body: JSON.stringify(this.config)}).
		then(response => {
			const contentType = response.headers.get("content-type");

			if (response.status === 200) {
				if (contentType && contentType.indexOf("application/json") >= 0) {
					return response.json();
				} else {
					throw new Error(`Ivalid contentType ${contentType}`);
				}
			} else {
				return response.text().then(message => {
					throw new Error(response.statusText + " : " + message);
				});
			}
		}).
		then(loginResponse => {
			this.restHeaders.authorization = `Token ${loginResponse.user.authctoken}`;
			return loginResponse;
		});
*/
	}
/*
	// create
	_post(path, restObj) {
		return fetch(`${this.urlRest}/rest/${path}/create`, {method: "POST", headers: this.restHeaders, body: JSON.stringify(restObj)}).
		then(response => {
			const contentType = response.headers.get("content-type");

			if (response.status === 200) {
				if (contentType && contentType.indexOf("application/json") >= 0) {
					return response.json();
				} else {
					throw new Error(`Ivalid contentType ${contentType}`);
				}
			} else {
				return response.text().then(message => {
					throw new Error(response.statusText + " : " + message);
				});
			}
		});
	}

	_updateList(path, listIn) {
		const processNext = list => {
			if (list.length == 0) return true;
			const restObj = list.shift();
			return this.post(path, restObj).
			catch(err => {
				console.error(`MicroServiceServer.pooling.processList().insert(${JSON.stringify(restObj)}) : err : ${err.message}`)
			}).
			then(() => processNext(list));
		}

		return processNext(listIn);
	}
*/
	// move to Utils.js
	static parseDatePtBr(str) {
		if (str.length == 7) str = "01/" + str;
		if (str.length == 10) str = str + " 00:00";
		if (str.length == 16) str = str + ":00";
		const dateParser = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/;
		const match = str.match(dateParser);
		return new Date(match[3], match[2]-1, match[1], match[4], match[5], match[6]);
	}
	// TODO : migrate to RestUtils.js
	static downloadFile(url, fileName, folder) {
		const filePath = folder + "/" + fileName;
		console.log(`[MicroServiceServer.downloadFile] : doing stat for file ${filePath}`);
		
		return fsPromises.stat(filePath).then(stats => {
			if (stats.isFile() == true) {
				console.log(`[MicroServiceServer.downloadFile] : returning promisse with already exists ${filePath}`);
				return filePath;
			} else {
				throw new Error("Ivalid zip file stat !!!");
			}
		}).catch(err => {
			if (err.code == "ENOENT") {
				const urlFile = url + "/" + fileName;
				console.log(`[MicroServiceServer.downloadFile] : downloading ${urlFile}...`);

				return fetch(urlFile, {method: "get"}).then(fetchResponse => {
					const type = fetchResponse.headers.get("Content-Type");
					console.log("[MicroServiceServer.downloadFile] : ...downloaded... : ", urlFile, "Content-Type", type);
					
					if (type.startsWith("application/x-zip-compressed")) {
						return new Promise((resolve, reject) => {
							fetchResponse.body.pipe(fs.createWriteStream(filePath)).on("finish", () => resolve(filePath)).on("error", err => reject(err));
						});
					} else {
						throw new Error("Invalid downloaded Content-Type : " + type);
					}
				}).catch(err => { // err indexOf FetchError or Error
					console.error("MicroServiceServer.downloadFile : fetch : ", urlFile, err);
					throw err;
				});
			}
		});
	}
	// TODO : migrate to RestUtils.js
	static downloadFiles(url, folder, listIn, listOut) {
		if (listOut == undefined) listOut = [];
		if (listIn.length == 0) return listOut;
		return MicroServiceServer.downloadFile(url, listIn.pop(), folder).then(partialResult => {
			listOut.push(partialResult);
			return MicroServiceServer.downloadFiles(url, folder, listIn, listOut);
		});
	}
	// TODO : migrate to Utils.js
	static extractZip(zipPath, folder) {
		return new Promise((resolve, reject) => {
			const list = [];
			console.log(`[MicroServiceServer.extractZip(${zipPath},${folder})] : extracting ${zipPath}`);
			fs.createReadStream(zipPath).
			pipe(unzip.Parse()).
			on("entry", entry => {
				console.log(`[MicroServiceServer.extractZip(${zipPath},${folder})] : extracted ${entry.path}`);
				const path = folder + "/" + entry.path;
				entry.pipe(fs.createWriteStream(path)).on("finish", entryfinishRes => list.push(path)).on("error", err => reject(err));
			}).
			on("close", finishRes => {
				console.log(`[MicroServiceServer.extractZip(${zipPath},${folder})] : resolve ${list}`);
				resolve(list);
			}).
			on("error", err => {
				console.error(`[MicroServiceServer.extractZip(${zipPath},${folder})] : fail to extract ${zipPath}, err:`, err);
				reject(err);
			});
		});
	}
	// TODO : migrate to Utils.js
	static extractZips(folder, listIn, listOut) {
		if (listOut == undefined) listOut = [];
		if (listIn.length == 0) return listOut;
		return MicroServiceServer.extractZip(listIn.pop(), folder).then(partialResult => {
			Array.prototype.push.apply(listOut, partialResult);
			return MicroServiceServer.extractZips(folder, listIn, listOut);
		});
	}

}

export {MicroServiceClient};
