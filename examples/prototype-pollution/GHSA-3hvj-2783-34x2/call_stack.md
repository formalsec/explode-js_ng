### Tainted Call Stack

| Order | File Path              | Function Name      | Line Number | Notes                             |
|-------|------------------------|--------------------|-------------|-----------------------------------|
| 1     | index.js               | Verifier.verify    | 343:416     | Entry point -> Calls JwtHeader    |
| 2     | index.js               | JwtHeader          | 116:127     | Sink: acc\[key\] = header\[key\]; |

