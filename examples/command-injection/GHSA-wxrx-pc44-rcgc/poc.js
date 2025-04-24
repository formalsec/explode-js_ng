let fs = require('fs');
let root = require('keep-module-latest');
let path = "./success@latest";
if (fs.existsSync(path))
  fs.unlinkSync(path);

root({ moduleName: "& touch success" });
