/**
 * Created by Alec on 12/16/15.
 */

var querystring = require("querystring");

module.exports = function(req,res,next){

    if(req.headers.accept.indexOf("json") !== -1) {
        next();
        return;
    }

    var body = '';
    req.on('data', function(chunk) {
        body += chunk;
    });
    req.on('end', function() {

        req.body = querystring.parse(body);

        next();
    });
}