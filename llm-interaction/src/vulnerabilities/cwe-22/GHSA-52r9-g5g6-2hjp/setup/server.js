const Server = require("node-srv");

 let srv = new Server(
    {
      port: 8081,
      root: "./",
      logs: true,
    },
    function () {}
);
