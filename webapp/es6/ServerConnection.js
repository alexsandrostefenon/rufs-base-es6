import {CaseConvert} from "./CaseConvert.js";
import {DataStoreItem, DataStoreManager} from "./DataStore.js";

class HttpRestRequest {

	constructor(url) {
		if (url.endsWith("/") == true) url = url.substring(0, url.length-1);
		this.url = url;// + "/rest";
		this.messageWorking = "";
		this.messageError = "";
	}

	getToken() {
		return this.token;
	}

	setToken(token) {
		this.token = token;
	}

	static urlSearchParamsToJson(urlSearchParams, properties) {
		const convertSearchParamsTypes = (searchParams, properties) => {
			const reservedParams = ["primaryKey", "overwrite", "filter", "filterRange", "filterRangeMin", "filterRangeMax"];

			for (let name of reservedParams) {
				let obj = searchParams[name];

				if (obj != undefined) {
					for (let [fieldName, value] of Object.entries(obj)) {
						let field = properties[fieldName];

						if (field != undefined) {
							if (field.type == "integer")
								obj[fieldName] = Number.parseInt(value);
							else if (field.type == "number")
								obj[fieldName] = Number.parseFloat(value);
							else if (field.type.startsWith("date") == true)
								obj[fieldName] = new Date(value);
						}
					}
				}
			}
		}

		if (urlSearchParams == undefined || urlSearchParams == null)
			return {};

		const searchParams = {};
		let entries;

		if (urlSearchParams.entries != undefined)
			entries = urlSearchParams.entries();
		else
			entries = Object.entries(urlSearchParams);

		for (const [key,value] of entries) {
			console.log(`CrudController.constructor() : param ${key} : ${value}`);

			if (value.startsWith("{")) {
				searchParams[key] = JSON.parse(value);
			} else {
				let list = key.split(".");
				let lastChild = searchParams;
				let i = 0;

				while (i < list.length-1) {
					let subKey = list[i++];
					if (lastChild[subKey] == undefined) lastChild[subKey] = {};
					lastChild = lastChild[subKey];
				}

				lastChild[list[i]] = value;
			}
		}

		if (properties != undefined) convertSearchParamsTypes(searchParams, properties);
		return searchParams;
	}

	static jsonToURLSearchParams(hashSearchObj) {
		function objectToParams(object) {
			let isJsObject = p => typeof(p) == "object";

			function subObjectToParams(key, object) {
				if (object == undefined) return "";
				return Object.keys(object).map((childKey) => {
					if (object[childKey] instanceof Date) {
						return `${key}.${encodeURIComponent(childKey)}=${encodeURIComponent(object[childKey].toJSON())}`;
					} else if (isJsObject(object[childKey])) {
						return subObjectToParams(`${key}.${encodeURIComponent(childKey)}`, object[childKey]);
					} else {
						return `${key}.${encodeURIComponent(childKey)}=${encodeURIComponent(object[childKey])}`;
					}
				}).join('&');
			}

			return Object.keys(object).map((key) => {
				if (object[key] instanceof Date) {
					return `${encodeURIComponent(key)}=${encodeURIComponent(object[key].toJSON())}`;
				} else if (isJsObject(object[key])) {
					return subObjectToParams(encodeURIComponent(key), object[key]);
				} else {
					return `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`;
				}
			}).join('&');
		}

		const hashSearch = objectToParams(hashSearchObj);
		const searchParams = new URLSearchParams(hashSearch);
		return searchParams;
	}
	// private
	request(path, method, params, objSend) {
		let url = this.url + "/" + path;
		
		if (params != undefined && params != null) {
			url = url + "?" + HttpRestRequest.jsonToURLSearchParams(params).toString();
		}
		
		let options = {};
		options.method = method;
		options.headers = {};

		if (this.token != undefined) {
			options.headers["Authorization"] = "Bearer " + this.token;
		}

		if (objSend != undefined && objSend != null) {
			if (typeof(objSend) === 'object') {
				options.headers["content-type"] = "application/json";
//				options.headers["Content-Encoding"] = "gzip";
				options.body = JSON.stringify(objSend);
			} else if (typeof(objSend) === 'string') {
				options.headers["content-type"] = "application/text";
//				options.headers["Content-Encoding"] = "gzip";
				options.body = objSend;
			} else if (objSend instanceof Blob) {
				options.headers["content-type"] = objSend.type;
				options.body = objSend;
			} else {
				throw new Error("HttpRestRequest.request : unknow data type");
			}
		}
		
		let promise;
		let _fetch = HttpRestRequest.fetch;
		if (_fetch == undefined) _fetch = fetch;
		
		if (HttpRestRequest.$q) {
			promise = HttpRestRequest.$q.when(_fetch(url, options));
		} else {
			promise = HttpRestRequest.fetch(url, options);
		}
		
		this.messageWorking = "Processing request to " + url;
		this.messageError = "";

		return promise.then(response => {
			this.messageWorking = "";
			const contentType = response.headers.get("content-type");
			
			if (response.status === 200) {
				if (contentType) {
					if (contentType.indexOf("application/json") >= 0) {
						return response.json();
					} else if (contentType.indexOf("application/text") >= 0){
						return response.text();
					} else {
						return response.blob();
					}
				} else {
					return Promise.resolve(null);
				}
			} else {
				return response.text().then(message => {
					throw new Error(response.statusText + " : " + message);
				});
			}
		}).catch(error => {
			this.messageError = error.message;
			throw error;
		});
	}

	save(path, itemSend) {
		return this.request(path, "POST", null, itemSend);
	}

	update(path, params, itemSend) {
		return this.request(path, "PUT", params, itemSend);
	}

	patch(path, itemSend) {
		return this.request(path, "PATCH", null, itemSend);
	}

	remove(path, params) {
		return this.request(path, "DELETE", params, null);
	}

	get(path, params) {
		return this.request(path, "GET", params, null);
	}

	query(path, params) {
		return this.request(path, "GET", params, null);
	}

}

class RufsService extends DataStoreItem {

	constructor(serverConnection, params, httpRest) {
		super(params.name, params.schema);
		this.httpRest = httpRest;
        this.serverConnection = serverConnection;
        this.params = params;
        let appName = params.appName != undefined ? params.appName : "crud";
        this.path = CaseConvert.camelToUnderscore(params.name);
        this.pathRest = appName + "/rest/" + this.path;
		this.remoteListeners = [];
	}

	clearRemoteListeners() {
		this.remoteListeners = [];
	}

	addRemoteListener(listenerInstance) {
		this.remoteListeners.push(listenerInstance);
	}

	request(path, method, params, objSend) {
        return this.httpRest.request(this.pathRest + "/" + path, method, params, objSend);
	}
	// used by websocket
	getRemote(primaryKey) {
    	return this.httpRest.get(this.pathRest + "/read", primaryKey).then(data => {
       		for (let [fieldName, field] of Object.entries(this.properties)) if (field.type.includes("date") || field.type.includes("time")) data[fieldName] = new Date(data[fieldName]);
            let pos = this.findPos(primaryKey);
            let action;
            let ret;

            if (pos < 0) {
            	action = "new";
            	ret = this.updateList(data);
            } else {
            	action = "update";
            	ret = this.updateList(data, pos, pos);
            }

            for (let listener of this.remoteListeners) listener.onNotify(primaryKey, action);
            return ret;
    	});
	}

	get(primaryKey) {
        let pos = this.findPos(primaryKey);

        if (pos < 0) {
        	return this.getRemote(primaryKey);
        } else {
        	return Promise.resolve({"data": this.list[pos]});
        }
	}

	save(itemSend) {
    	return this.httpRest.save(this.pathRest + "/create", this.copyFields(itemSend)).then(data => this.updateList(data));
	}

	update(primaryKey, itemSend) {
        return this.httpRest.update(this.pathRest + "/update", primaryKey, this.copyFields(itemSend)).then(data => {
            let pos = this.findPos(primaryKey);
        	return this.updateList(data, pos, pos);
        });
	}

	patch(itemSend) {
    	return this.httpRest.patch(this.pathRest + "/patch", this.copyFields(itemSend)).then(data => this.updateList(data));
	}

	removeInternal(primaryKey) {
		const ret =  super.removeInternal(primaryKey);
		for (let listener of this.remoteListeners) listener.onNotify(primaryKey, "delete");
		return ret;
	}

	remove(primaryKey) {
        return this.httpRest.remove(this.pathRest + "/delete", primaryKey);//.then(data => this.removeInternal(primaryKey));
	}

	queryRemote(params) {
        return this.httpRest.query(this.pathRest + "/query", params).then(list => {
			for (let [fieldName, field] of Object.entries(this.properties))
				if (field.type.includes("date") || field.type.includes("time"))
					list.forEach(item => item[fieldName] = new Date(item[fieldName]));
        	this.list = list;
        	return list;
        });
	}
	
}

class ServerConnection extends DataStoreManager {

	constructor() {
    	super();
    	this.pathname = "";
	}

	clearRemoteListeners() {
		for (let [serviceName, service] of Object.entries(this.services)) service.clearRemoteListeners();
	}
	// private -- used in login()
	webSocketConnect(path) {
		// Open a WebSocket connection
		// 'wss://localhost:8443/xxx/websocket'
		var url = this.url;

		if (url.startsWith("https://")) {
			url = "wss://" + url.substring(8);
		} else if (url.startsWith("http://")) {
			url = "ws://" + url.substring(7);
		}

		if (url.endsWith("/") == false) url = url + "/";
		url = url + path;
		if (url.endsWith("/") == false) url = url + "/";
		url = url + "websocket";
		let _WebSocket = ServerConnection.WebSocket;
		if (_WebSocket == undefined) _WebSocket = WebSocket;
		this.webSocket = new _WebSocket(url);

    	this.webSocket.onopen = event => {
    		this.webSocket.send(this.httpRest.getToken());
    	};

    	this.webSocket.onmessage = event => {
			var item = JSON.parse(event.data);
            console.log("[ServerConnection] webSocketConnect : onMessage :", item);
            var service = this.services[item.service];

            if (service != undefined) {
        		if (item.action == "delete") {
        			if (service.findOne(item.primaryKey) != null) {
            			service.removeInternal(item.primaryKey);
        			} else {
        	            console.log("[ServerConnection] webSocketConnect : onMessage : delete : alread removed", item);
        			}
        		} else {
        			service.getRemote(item.primaryKey);
        		}
            }
		};
	}
    // public
    login(server, path, user, password, RufsServiceClass, callbackPartial, dbUri) {
		this.url = server;
		if (path != null && path.startsWith("/")) path = path.substring(1);
		if (path != null && path.endsWith("/")) path = path.substring(0, path.length-1);
		if (RufsServiceClass == undefined) RufsServiceClass = RufsService;
		if (callbackPartial == undefined) callbackPartial = console.log;
    	this.httpRest = new HttpRestRequest(this.url);
    	return this.httpRest.request("base/rest/login", "POST", null, {"userId":user, "password":password, "dbUri":dbUri}).
    	then(loginResponse => {
    		this.title = loginResponse.title;
			this.rufsGroupOwner = loginResponse.rufsGroupOwner;
			this.routes = loginResponse.routes;
			this.path = loginResponse.path;
			this.userMenu = loginResponse.menu;
    		this.httpRest.setToken(loginResponse.authctoken);
    		const schemas = [];
            // depois carrega os serviços autorizados
            for (let params of loginResponse.rufsServices) {
            	if (params != null) {
					if (params.appName == undefined) params.appName = path;
					params.access = loginResponse.roles[params.name];

					if (params.access != undefined) {
						if (params.access.query == undefined) params.access.query = true;
						if (params.access.read == undefined) params.access.read = true;
						if (params.access.create == undefined) params.access.create = false;
						if (params.access.update == undefined) params.access.update = false;
						if (params.access.delete == undefined) params.access.delete = false;
					} else {
						params.access = {"create": false, "read": false, "update": false, "delete": false, "query": false};
					}

					let service = new RufsServiceClass(this, params, this.httpRest);
					if (service.properties.rufsGroupOwner != undefined && this.rufsGroupOwner != 1) service.properties.rufsGroupOwner.hiden = true;
					if (service.properties.rufsGroupOwner != undefined && service.properties.rufsGroupOwner.default == undefined) service.properties.rufsGroupOwner.default = this.rufsGroupOwner;
					schemas.push(service);
            	}
            }

            this.setSchemas(schemas);
            const listDependencies = [];

    		for (let serviceName in this.services) {
    			if (listDependencies.includes(serviceName) == false) {
    				listDependencies.push(serviceName);
	    			this.getDependencies(serviceName, listDependencies);
    			}
    		}

    		const listQueryRemote = [];

    		for (let serviceName of listDependencies) {
    			const service = this.services[serviceName];

				if (service.params.access.query == true) {
					listQueryRemote.push(service);
				}
    		}

            return new Promise((resolve, reject) => {
            	var queryRemoteServices = () => {
            		if (listQueryRemote.length > 0) {
            			let service = listQueryRemote.shift();
                		console.log("[ServerConnection] loading", service.label, "...");
                		callbackPartial("loading... " + service.label);

                		service.queryRemote(null).then(list => {
                			console.log("[ServerConnection] ...loaded", service.label, list.length);
                			queryRemoteServices();
                		}).catch(error => reject(error));
            		} else {
            	    	this.webSocketConnect(path);
               			console.log("[ServerConnection] ...loaded services");
                    	resolve(loginResponse);
            		}
            	}

                queryRemoteServices();
        	});
    	});
    }
    // public
    logout() {
		this.webSocket.close();
   		this.httpRest.setToken(undefined);
        // limpa todos os dados da sessão anterior
        for (let serviceName in this.services) {
        	delete this.services[serviceName];
        }
    }

}

export {HttpRestRequest, RufsService, ServerConnection};
