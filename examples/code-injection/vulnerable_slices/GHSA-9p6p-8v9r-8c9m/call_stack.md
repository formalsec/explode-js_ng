### Tainted Call Stack

| Order | File Path                                             | Function Name           | Line Number | Notes                                                     |
|-------|-------------------------------------------------------|-------------------------|-------------|-----------------------------------------------------------|
| 1     | dist/index.js                                         | deobfuscate             | 43:31       | Entry Point -> Calls execute                              |
| 2     | dist/modifications/expressions/expressionSimplifier.js| execute                 | 41:42       | Calls simplifyExpressions                                 |
| 3     | dist/modifications/expressions/expressionSimplifier.js| simplifyExpressions     | 47:52       | Calls simplifyExpression                                  |
| 4     | dist/modifications/expressions/expressionSimplifier.js| simplifyExpression      | 64:67,69    | Calls simplifyBinaryExpression or simplifyUnaryExpression |
| 5.1   | dist/modifications/expressions/expressionSimplifier.js| simplifyBinaryExpression| 78:85       | Calls evalCodeToExpression possible path 1                |
| 5.2   | dist/modifications/expressions/expressionSimplifier.js| simplifyUnaryExpression | 96:100      | Calls evalCodeToExpression possible path 2                |
| 6     | dist/modifications/expressions/expressionSimplifier.js| evalCodeToExpression    | 161:164     | Sink: uses eval()                                         |
    
