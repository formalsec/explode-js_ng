'use strict'

const async = require('async')
const semver = require('semver')

const findup = require('findup-sync')

const getPathDistance = function (path) {
  if (typeof path !== 'string') {
    return -1
  }

  const sep = require('path').sep
  return path.split(sep).length
}

const getPkgRepoType = function (pkgjson) {
  if (typeof pkgjson !== 'string') { return null }
  const pkg = require(pkgjson)
  return pkg.repository && pkg.repository.type
    ? pkg.repository.type
    : null
}

const get_repo_type = function (cb) {
  const gitfldr = findup('.git')
  const svnfldr = findup('.svn')
  const pkgjson = findup('package.json')
  const distanceGit = getPathDistance(gitfldr)
  const distanceSvn = getPathDistance(svnfldr)
  const distancePkg = getPathDistance(pkgjson)
  const pkgjsonType = getPkgRepoType(pkgjson)

  // Check if there is a version control folder next to the package.json...
  if (distancePkg > -1) {
    if (distancePkg === distanceGit && distancePkg === distanceSvn) {
      if (pkgjsonType === 'git' || pkgjsonType === 'svn') {
        return cb(null, pkgjsonType)
      } else {
        return cb(null, 'git')
      }
    }

    if (distancePkg === distanceGit) {
      return cb(null, 'git')
    }

    if (distancePkg === distanceSvn) {
      return cb(null, 'svn')
    }
  }

  // Otherwise use the closest option we've got
  if (distanceGit >= distanceSvn) {
    return cb(null, 'git')
  }

  if (distanceSvn > -1) {
    return cb(null, 'svn')
  }

  cb(new Error('Could not determine repo type, try --repo-type'))
}

const cp = require('child_process')

const getGitTags = (cb) => {
  const p = cp.exec('git tag')
  let cpOut = ''

  p.on('error', cb)

  p.stdout.on('data', (chunk) => {
    cpOut += chunk.toString()
  })

  p.on('close', function () {
    const tagList = cpOut.trim().split('\n').map(t => t.trim())
    cb(null, tagList)
  })
}

const getGitTagsRemote = (path, cb) => {
  cp.exec('git ls-remote --tags "' + path + '"', (err, stdout, stderr) => {
    if (err) { cb(err) }
    const tagList = stdout.trim()
      .split('\n')
      .map(l => {
        if (/^\w+\s+refs\/tags\/(.*)$/.exec(l.trim())) {
          return RegExp.$1
        }
        return null
      })
      .filter(t => t !== null)
    cb(null, tagList)
  })
}

const getSvnTags = (path, cb) => {
  if (typeof path === 'function') {
    cb = path
    path = null
  }

  const getProjectRoot = require('svn-project-root')

  const _getTags = (path, cb) => {
    path = getProjectRoot.normalize(path) + '/tags'

    const p = cp.spawn('svn', ['ls', path])
    let cpOut = ''

    p.on('error', cb)

    p.stdout.on('data', (chunk) => {
      cpOut += chunk.toString()
    })

    p.on('exit', () => {
      const tagsList = cpOut.trim()
        .split('\n')
        .map(t => t.trim().replace(/[/\\]$/, ''))
      cb(null, tagsList)
    })
  }

  return path
    ? _getTags(path, cb)
    : getProjectRoot((err, path) => {
      if (err) { return cb(err) }
      _getTags(path, cb)
    })
}

/**
 * Get a list of tags for a given repo
 *
 * @param {String} repoType The repo type, i.e. 'git' or 'svn'
 * @param {String|undefined} path The path to the repo (optional)
 * @param {Function} cb The callback function, passed an error if there is one
 * and an array of the repo tags
 */
const get_tags = (repoType, path, cb) => {
  let useRemote = true
  if (typeof path === 'function') {
    cb = path
    useRemote = false
  }
  if (/git/i.test(repoType)) {
    return useRemote ? getGitTagsRemote(path, cb) : getGitTags(cb)
  } else if (/svn/i.test(repoType)) {
    return useRemote ? getSvnTags(path, cb) : getSvnTags(cb)
  } else {
    cb(new Error('Unrecognized repo type: ' + repoType))
  }
}

module.exports = (opts, finalCb) => {
  if (typeof finalCb === 'undefined') {
    finalCb = opts
    opts = {}
  }

  async.waterfall([
    (cb) => {
      if (opts.repoType) {
        cb(null, opts.repoType)
      } else {
        get_repo_type(cb)
      }
    },

    // Get the list of tags for the repo
    (repoType, cb) => {
      return opts.repoPath
        ? get_tags(repoType, opts.repoPath, cb)
        : get_tags(repoType, cb)
    }
  ], finalCb)
}
