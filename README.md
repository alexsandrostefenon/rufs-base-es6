# rufs-base-es6

Restful Utilities for Full Stack - Base Modules and Microservices to NodeJs and WebApp

Offer base package to rufs compliance microservices

Requires NodeJs version >= 9.1.

You need PostgreSql server already running.

## First Step
    
Open terminal and clone this repository with `git clone https://github.com/alexsandrostefenon/rufs-base-es6`.

To download the required dependencies then

`npm install ./rufs-base-es6` 

or

`yarnpkg install --cwd ./rufs-base-es6 --modules-folder $NODE_MODULES_PATH`

where $NODE_MODULES_PATH point to your desired node_modules folder destination.

### Run standalone micro-service application

execute :

`nodejs --experimental-modules --loader ./rufs-base-es6/custom-loader.mjs ./rufs-base-es6/RufsServiceMicroService.js --port=8082;`
`nodejs --experimental-modules --loader ./rufs-base-es6/custom-loader.mjs ./rufs-base-es6/AuthenticationMicroService.js --port=8083;`
`nodejs --experimental-modules --loader ./rufs-base-es6/custom-loader.mjs ./rufs-base-es6/RufsMicroService.js --port=8084;`
