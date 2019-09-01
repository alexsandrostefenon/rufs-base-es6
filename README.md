# rufs-base-es6
Restful Utilities for Full Stack - Base Modules and Microservices to NodeJs and WebApp

Offer base package to rufs compliance microservices

Requires NodeJs version >= 9.1.

You need PostgreSql server already running.

## First Step

Clone this repository and open terminal, changing path to cloned repository folder.

### Build

then `npm install` to download the required dependencies.

### Run standalone micro-service application

execute :

`nodejs --experimental-modules --loader ./custom-loader.mjs ./RufsServiceMicroService.js --port=8082`
`nodejs --experimental-modules --loader ./custom-loader.mjs ./AuthenticationMicroService.js --port=8083`
`nodejs --experimental-modules --loader ./custom-loader.mjs ./RufsMicroService.js --port=8084`
