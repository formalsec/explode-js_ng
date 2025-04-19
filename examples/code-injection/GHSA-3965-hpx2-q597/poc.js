const pug = require('pug');
const runtimeWrap = require('pug-runtime/wrap');

var options = {
  name: "template() { console.log('pwned'); }; function asdf"
};

var body = pug.compileClient("string of pug", options);

runtimeWrap(body)();
