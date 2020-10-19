import {RufsMicroService} from "./RufsMicroService.js";

class AuthenticationMicroService extends RufsMicroService {

	constructor(config) {
		super(config, "base");
	}

}

AuthenticationMicroService.checkStandalone();

export {AuthenticationMicroService};
