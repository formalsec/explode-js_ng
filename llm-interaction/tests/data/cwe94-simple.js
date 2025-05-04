function vulnerableFunction(userInput) {
  eval(userInput);
}

module.exports = vulnerableFunction;
