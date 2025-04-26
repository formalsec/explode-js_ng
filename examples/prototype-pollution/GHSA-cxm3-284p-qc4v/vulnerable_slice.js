var set;

/* node_modules/sds/js/set.js */
set = function(object, keypath, value) {
    var k, kp, o;
    if (typeof keypath === 'string') {
        keypath = keypath.split('.');
    }
    if (!(keypath instanceof Array)) {
        throw "invalid keypath: " + (JSON.stringify(keypath));
    }
    kp = [].concat(keypath);
    o = object;
    while (kp.length > 1) {
        k = kp.shift();
        if (o[k] == null) {
            if (!Number.isNaN(parseInt(k))) {
                o = o[k] = [];
            } else {
                o = o[k] = {};
            }
        } else {
            o = o[k];
        }
    }
    if (kp.length === 1 && (o != null)) {
        if (value === void 0) {
            delete o[kp[0]];
        } else {
            o[kp[0]] = value;
            if (o[kp[0]] !== value) {
                throw "couldn't set value " + (JSON.stringify(value)) + " for keypath " + (keypath.join('.')) + " in " + (JSON.stringify(object));
            }
        }
    }
    return object;
};


/* node_modules/sds/js/main.js */
module.exports = {
  set: set
}
