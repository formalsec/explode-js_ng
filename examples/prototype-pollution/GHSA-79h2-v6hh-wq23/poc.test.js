test("Prototype pollution in @ndhoule/defaults", () => {
  const defaults = require('@ndhoule/defaults');

  let payload = { ["__proto__"]: { "polluted": "yes" } };

  expect({}.polluted).toBe(undefined);

  defaults.deep({}, payload);

  expect({}.polluted).toBe("yes");
})
