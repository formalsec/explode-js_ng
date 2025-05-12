'use strict'

var debug = require('debug')('ggit') // 3.2.6

//exec.js
var Q = require('q') //"2.0.3"
var exec = require('child_process').exec
var verify = require('check-more-types').verify //2.24.0

function execPromise (cmd, verbose) {
  verify.unemptyString(cmd, 'missing command to execute')
  debug(cmd)

  var deferred = Q.defer()
  exec(cmd, function (err, stdout, stderr) {
    if (verbose) {
      console.log('exec result')
      console.log('working folder:', process.cwd())
      console.log('cmd:', cmd)
      console.log('err:', err)
      console.log('stdout:', stdout)
      console.log('stderr:', stderr)
    }

    if (err) {
      debug('error running command "%s"', cmd)
      debug(err.message)
      return deferred.reject(stderr)
    }
    deferred.resolve(stdout)
  })
  return deferred.promise
}

//fetchTags.js

function fetchTags (branch) {
  branch = branch || 'master'
  debug('fetching remote tags for branch', branch)
  var cmd = 'git pull origin ' + branch + ' --tags'
  return execPromise(cmd)
}

module.exports = fetchTags


