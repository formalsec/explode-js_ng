test("Arbitrary code execution in angular-expressions", (done) => {
  const expressions = require("angular-expressions");

  console.log = jest.fn();

  expressions.compile("global.console.log('pwned')")(global, global);

  expect(console.log).toHaveBeenCalledWith('pwned');
  done();
})
