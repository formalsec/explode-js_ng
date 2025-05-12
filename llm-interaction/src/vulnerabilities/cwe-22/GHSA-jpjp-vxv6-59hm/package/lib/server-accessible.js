/**
 * Created by Alec on 12/15/15.
 */
var fs = require('fs');


module.exports = function(path){

    return (function(req,res,next){

        var filePath = path + req.url;

        console.log(filePath);
        fs.readFile(filePath, function(error, data){

            if(!error){
                console.log('sent');
                res.end(data);
            }
            next();
        });
    })
};