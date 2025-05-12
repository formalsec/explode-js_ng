
var previousLines = [],
    text = "",
    header = "Page is loading...";

var active = false;
var cursor = 0;

var Key = {
    enter: 13,
    shift: 16,
    left: 37,
    top: 38,
    right: 39,
    bottom: 40,
    command: 91,
    control: 17,
    delete: 8
};

var unMatchingKeys = {
    189: ['-','_'],
    187: ['=','+'],
    219: ['[', '{'],
    221: [']', '}'],
    220: ['\\', '|'],
    186: [';', ':'],
    222: ['\'', '"'],
    188: [',', '<'],
    190: ['.', '>'],
    191: ['/', '?'],
    49: ['1','!'],
    50: ['2', '@'],
    51: ['3', '#'],
    52: ['4','$'],
    53: ['5', '%'],
    54: ['6', '^'],
    55: ['7', '&'],
    56: ['8', '*'],
    57: ['9', '('],
    48: ['0', ')']
};

var terminal = $("terminal"),
    output = $("output"),
    prev = output.children("prev"),
    line = output.children("line");

var commandDown = false;

terminal.focusout((function(){
    terminal.focus();
}));
terminal.focus();

terminal.keydown(processKey);
terminal.keyup(keyUpEvent);

function keyUpEvent(event){

    if(event.which === Key.command)
        commandDown = false;
}
function handleCharacter(event, keyCode, upperChar, char){

    text += char;
    cursor++;
}


function handleSpecialKey(event, keyCode){

    if(keyCode === Key.delete){

        event.preventDefault();
        event.stopPropagation();
        if (cursor > 0);{
        text = text.substring(0, text.length - 1);
        cursor--;
        }

    }else if(keyCode === Key.command){

        commandDown = true;
    }
}


function processKey(event){


    if(!active){
        event.preventDefault();
        event.stopPropagation();
        return;
    }


    var keyCode = event.which;
    var upperChar = unMatchingKeys[keyCode]? unMatchingKeys[keyCode][event.shiftKey? 1 : 0] : String.fromCharCode(keyCode),
        char = event.shiftKey &&  !unMatchingKeys[keyCode]? upperChar : upperChar.toLowerCase();

    if(keyCode === Key.enter){
        if(text.length !== 0)
        submit();
    }else if(char !== "" && Key.command !== keyCode && !commandDown && keyCode !== Key.delete)
        handleCharacter(event, keyCode, upperChar, char);
    else
        handleSpecialKey(event, keyCode);


    render();
}

function getLine(){
    return (active? header : "") +  text;
}
function addLine(line){
    console.log(line);
    previousLines.push(line.replace(/\n/g, "<br/><tab></tab>").replace(/\t/g,"<tab></tab>"));
    render();
}
function render(){
    prev[0].innerHTML = (previousLines.length > 0? previousLines.join("<br/>") + "<br/>" : "");
    line[0].innerHTML = getLine();
}

function submit(){
    var currentLine = getLine();
    cursor = 0;

    var command = text.split(" ")[0];

    var arg = text.substring(command.length  + 1);
    $.post("/exec",  {
                command: command,
                arguments: arg == null? "" : arg
            }, 'json').success(function(data){

        var json = JSON.parse(data);
        active = true;
        header = json.cwd + ": ";
        addLine("<tab></tab>" +json.data);
    });

    text = "";

    addLine(currentLine);
    active = false;
    //$.ajax({
    //    method: "POST",
    //    async: true,
    //    url: "/exec",
    //    data: {
    //        command: command,
    //        arguments: currentLine.substring(command.length  + 1)
    //    },
    //    dataType: 'json'
    //})
}

submit();
previousLines = [];
render();