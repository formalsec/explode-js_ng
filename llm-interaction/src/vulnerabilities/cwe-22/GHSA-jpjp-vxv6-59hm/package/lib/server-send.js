/**
 * Created by Alec on 12/15/15.
 */

module.exports = (function(req,res,next){
    res.send = (function(){
        res.end.apply(this,arguments);
    });

    next();

});