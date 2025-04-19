### Tainted Call Stack

| Order | File Path              | Function Name                 | Line Number | Notes                                                                     |
|-------|------------------------|-------------------------------|-------------|---------------------------------------------------------------------------|
| 1     | src/jsonpath.js        | JSONPath                      | 137:190     | Entry Point -> Calls JSONPath.evaluate                                    |
| 2     | src/jsonpath.js        | JSONPath.evaluate             | 199:265     | Calls JSONPath._trace                                                     |
| 3     | src/jsonpath.js        | JSONPath._trace               | 337:456     | Calls JSONPath._eval                                                      |
| 4     | src/jsonpath.js        | JSONPath._eval                | 631:661     | Sets Safe-Script and the execution sandbox env                            |
| 5     | src/Safe-Script.js     | SafeEval.evalAst              | 24:38       | Calls SafeEval.evalMemberExpression                                       |
| 6     | src/Safe-Script.js     | SafeEval.evalMemberExpression | 117:132     | Sink: User can inject malicious AST causing binding of malicious function |

