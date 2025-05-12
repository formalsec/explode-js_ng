### Tainted Call Stack

| Order | File Path              | Function Name      | Line Number | Notes                             |
|-------|------------------------|--------------------|-------------|-----------------------------------|
| 1     | lib/main.js            | compile            | 46:66       | Calls Parser.parse ->  Entry Point|
| 2     | lib/parse.js           | Parser.parse       | 2806:2807   | Calls ASTCompiler.compile         |
| 3     | lib/parse.js           | ASTCompiler.compile| 1643:1694   | Sink: Uses new Function()         |

