#!/usr/bin/env node

//initProject.js
var fsExtra = require('fs-extra'); //^5.0.0
var shell = require('shelljs'); //^0.8.1

/*module.exports =*/ function initProject (seedPath, targetPath) {
    console.log('Setting up project');
    fsExtra.copySync(seedPath, targetPath);
    console.log('Installing dependencies');
    shell.exec('sh -c \'cd '+targetPath+' && npm install\'');
    console.log('Starting server');
    shell.exec('sh -c \'cd '+targetPath+' && npm start\'');
}

//index.js
var path = require('path'); 
var argv = require('yargs').argv;  //^11.0.0

// Arguments setup
var action = process.argv[2];

switch (action) {
    case 'init':
        if (!argv.name) {
            console.log('--name argument must be passed');
            return;
        }
        var seedPath = path.join(__dirname, '../seed');
        var targetPath = path.join(process.cwd(), argv.name);
        initProject(seedPath, targetPath);
    break;
    default:
        console.log('action param is required');
    break;
}

