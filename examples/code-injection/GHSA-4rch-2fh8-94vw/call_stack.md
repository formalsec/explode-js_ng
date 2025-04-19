### Tainted Call Stack

| Order | File Path                  | Function Name                | Line Number | Notes                                                              |
|-------|----------------------------|------------------------------|-------------|--------------------------------------------------------------------|
| 1     | index.js                   |              -               |    14       | Entry Point -> exports Connection class                            |
| 2     | lib/connection.js          | Connection.query             | 565:575     | Calls addCommand with Commands.Query as argument                   |
| 3     | lib/connection.js          | Connection.addCommand        | 496:507     | Calls handlePacket and does this._command = cmd (cmd is its arg    |
| 4     | lib/connection.js          | Connection.handlePacket()    | 419:481     | Calls this._command.execute() i.e Query.execute i.e Command.execute|
| 5     | lib/commands/command.js    | Command.execute              | 23:45       | Calls this.start                                                   |
| 6     | lib/commands/query.js      | Command.Query.constructor    | 17:18       | Calls super() i.e Command.constructor                              |
| 7     | lib/commands/query.js      | Command.Query.start          | 47:61       | Returns Query.prototype.resultsetHeader                            |
| 8     | lib/commands/query.js      | Command.Query.resultsetHeader| 117:135     | Returns this.readField                                             |
| 9     | lib/commands/query.js      | Command.Query.readField      | 190:215     | Calls getTextParser                                                | 
| 10    | lib/parsers/text_parser.js | getTextParser                | 210:211     | Calls getParser                                                    |
| 11    | lib/parsers/parser_cache.js| getParser                    | 40:48       | calls sink function                                                |
| 12    | lib/parsers/text_parser.js | compile                      | 75:186      | sink -> Creates function with unsanitized value                    |

