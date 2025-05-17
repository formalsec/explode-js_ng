require("fs");

function exploit() {
  require("fs").writeFileSync('../traverse.txt', 'pwned');
}

module.exports = exploit;

