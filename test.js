import {MicroServiceClient} from "./MicroServiceClient.js";
const rufsClient = new MicroServiceClient({"port":8080, "appName":"document", "userId":"nfe_guest", "password":"123456"});

rufsClient.login().then(() => {
	rufsClient.services.request.getRemote({"rufsGroupOwner": 2,"id": 1041}).then(response => {
		console.log(response, response.data, response.data.oneToMany);
	});
});

