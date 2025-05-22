const fs = require('fs');

function exploit () {
  fs.writeFileSync('payload.txt', 'injected');
};

module.exports = exploit;

