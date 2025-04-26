
  let fs = require('fs');
  let root = require('keep-module-latest');
  let path = "./success";
  if (fs.existsSync(path))
    fs.unlinkSync(path);

try {
  root({ registry: "; touch success #" });
} catch (err) {
  console.log("Err!");
}

