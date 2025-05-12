const chalk = require('chalk');
const cl = require('chalkline');

const messenger = {
  line: color => {
    if (color.length > 0) {
      try {
        eval(`cl.${color}()`); // eslint-disable-line
      }
      catch (e) {
        console.error(chalk.bgRed.bold(`Invalid Color: ${color}`));
      }
    }
  }
};

module.exports = messenger;
