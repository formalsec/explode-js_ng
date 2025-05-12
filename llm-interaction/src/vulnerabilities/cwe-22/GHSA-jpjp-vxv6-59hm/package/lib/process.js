/**
 * Created by Alec on 12/15/15.
 */
var process = require('child_process');
var child;
// executes `pwd`

var eventHandlerList = [];

function action(command){
child = process.exec(command, function (error, stdout, stderr) {

    if (error !== null) {
        console.log('exec error: ' + error);
        return;
    }else
        console.log(stdout);


});
}

action("ls");