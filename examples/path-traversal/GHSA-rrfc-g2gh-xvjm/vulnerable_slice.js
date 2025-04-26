var http=require("http");
var fs=require("fs");
http.createServer(function (request,response) {
    console.log(request.url);
    var path="./"+request.url;
    fs.readFile(path,function
        (error,data){
        response.end(data);
    })
}).listen("8888");
