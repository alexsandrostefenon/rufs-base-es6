import {MicroServiceClient} from "./MicroServiceClient.js";
const rufsClient = new MicroServiceClient({"port":8080, "appName":"document", "userId":"admin", "password":"admin"});

rufsClient.login().then(() => {
	rufsClient.services.rufsUser.getRemote({"id": 1}).then(response => {
		console.log(response, response.data, response.data.oneToMany);
	});
});

