# rufs-base-es6

Offer base package to rufs compliance microservices, see https://github.com/alexsandrostefenon/rufs-nfe-es6/README.md for full example.

### Run Ecosystem

Execute rufs-proxy to load and start microservices :
`
PGHOST=localhost PGPORT=5432 PGUSER=development PGPASSWORD=123456 PGDATABASE=rufs_base nodejs ./AuthenticationMicroService.js;\
PGHOST=localhost PGPORT=5432 PGUSER=development PGPASSWORD=123456 PGDATABASE=rufs_base nodejs ./rufs-base-es6/proxy.js --add-modules ../rufs-base-es6/AuthenticationMicroService.js;\
#PGHOST=localhost PGPORT=5432 PGUSER=development PGPASSWORD=123456 PGDATABASE=rufs_base nodejs --inspect ./rufs-base-es6/AuthenticationMicroService.js;\
`
