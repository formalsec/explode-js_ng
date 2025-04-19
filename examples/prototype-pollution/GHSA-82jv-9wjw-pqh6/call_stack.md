### Tainted Call Stack

| Order | File Path                  | Function Name       | Line Number | Notes                                      |
|-------|----------------------------|---------------------|-------------|--------------------------------------------|
| 1     | dist/templates/templates.js| AsProperty          | 2123:2132   | Entry point -> Inherits from AsPropertyBase|
| 2     | dist/templates/templates.js| AsPropertyBase.emit | 2103:2105   | Sink: node\[this.lastSegment\] = target;   |

