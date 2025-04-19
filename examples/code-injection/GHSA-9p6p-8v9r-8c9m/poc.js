const fs = require("fs");
const deobfuscate = require('js-deobfuscator')

payload = fs.readFileSync("./input.js");
console.log(deobfuscate.deobfuscate(payload))
