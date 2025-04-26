let actions = require('@actions/artifact');

/* This needs to point to a github artifact id with a malicious zip */
var id = -1;

actions.default.downloadArtifact(id)
