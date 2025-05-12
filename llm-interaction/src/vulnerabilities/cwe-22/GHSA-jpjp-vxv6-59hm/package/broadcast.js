#!/usr/bin/env node
/**
 * Created by Alec on 12/15/15.
 */
var server = require("./lib/server")();
var path = require("path");
var fs = require("fs");
var child_process = require('child_process');
var cwd = process.cwd();
const publicFolder = __dirname + "/public";
const PORT=8080;
const HOME = process.env.HOME || process.env.USERPROFILE;
server.listen(PORT, (function(){
    console.log("Started server on port: %s", PORT);
}));

server.use(require("./lib/server-send"));
server.use(require("./lib/server-accessible")(publicFolder));
server.use(require("./lib/server-json"));
server.post("/exec", function(req,res){

    console.log("[" + req.body.command + "]", req.body.arguments);
    if(req.body.command === "cd"){
        req.body.arguments = req.body.arguments.replace(/ /g,"");
        var tempCwd;

        if(req.body.arguments.length > 0)
            tempCwd = req.body.arguments[0] === "/"? req.body.arguments : path.join(cwd, req.body.arguments);
        else
            tempCwd = HOME;

        fs.exists(tempCwd, (function(exists){
            if(exists){
                cwd = tempCwd;
                res.send(JSON.stringify({cwd: path.basename(cwd), data: "new directory '" + cwd + "'"}));
            }else
                res.send(JSON.stringify({cwd: path.basename(cwd), data: "path does not exists..."}));

        }));

       }else{

        child_process.exec(req.body.command + " " + req.body.arguments, {cwd: cwd}, function(err, stdout){

           if(err)
           res.send( JSON.stringify({cwd: path.basename(cwd), data: "an error has occurred."}) );
           else
            res.send(JSON.stringify({cwd: path.basename(cwd), data: stdout}));

        });
    }

});


server.get("/", function(req,res, next){


    console.log(req.url);
    fs.readFile(__dirname + "/view.html", function(err, data){
        if(err)
            res.send("Error could not load.");
        else
            res.send(data);
    })

});