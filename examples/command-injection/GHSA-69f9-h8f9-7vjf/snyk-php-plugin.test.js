test("Remote code execution in snyk-php-plugin", (done) => {
  let fs = require('fs');

  const prevCwd = process.cwd();
  const maliciousDir = './injected; touch snyk-php-plugin; #';
  if (!fs.existsSync(maliciousDir)) {
    fs.mkdirSync(maliciousDir, { recursive: true });
  }

  process.chdir(maliciousDir);
  // console.log('Changed working directory to:', process.cwd());

  const maliciousFile = 'snyk-php-plugin';
  if (fs.existsSync(maliciousFile))
    fs.unlinkSync(maliciousFile);

  let { inspect } = require('snyk-php-plugin');

  let file_exist = fs.existsSync(maliciousFile);
  expect(file_exist).toBe(false);
  inspect(process.cwd(), { composerIsFine: false, composerPharIsFine: true })
    .catch(() => {
      file_exist = fs.existsSync(maliciousFile);
      expect(file_exist).toBe(true);
      fs.unlinkSync(maliciousFile);
      process.chdir(prevCwd);
      fs.rmdir(maliciousDir, (_err) => { done(); });
    });
});
