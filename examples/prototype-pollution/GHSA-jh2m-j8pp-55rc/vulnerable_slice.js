/* node_modules/gedi/pathToken.js */
var Lang = require('lang-js'),
  Token = Lang.Token,
  paths = require('gedi-paths'),
  createSpec = require('spec-js'),
  detectPath = require('gedi-paths/detectPath');

var pathToken = function(get, model) {

  function PathToken(path) {
    this.path = path;
  }
  PathToken = createSpec(PathToken, Token);
  PathToken.prototype.name = 'PathToken';
  PathToken.tokenPrecedence = 1;
  PathToken.prototype.parsePrecedence = 2;
  PathToken.tokenise = function(substring) {
    var path = detectPath(substring);

    if (path) {
      return new PathToken(path, path.length);
    }
  };
  PathToken.prototype.evaluate = function(scope) {
    this.path = this.original;
    this.result = get(paths.resolve(scope.get('_gmc_'), this.original), model);
    this.sourcePathInfo = {
      path: this.original
    };
  };

  return PathToken;
}

/* node_modules/gedi/modelOperations.js */
var paths = require('gedi-paths'),
  memoiseCache = {};

// Lots of similarities between get and set, refactor later to reuse code.
function get(path, model) {
  if (!path) {
    return model;
  }

  var memoiseObject = memoiseCache[path];
  if (memoiseObject && memoiseObject.model === model) {
    return memoiseObject.value;
  }

  if (paths.isRoot(path)) {
    return model;
  }

  var pathParts = paths.toParts(path),
    reference = model,
    index = 0,
    pathLength = pathParts.length;

  if (paths.isAbsolute(path)) {
    index = 1;
  }

  for (; index < pathLength; index++) {
    var key = pathParts[index];

    if (reference == null) {
      break;
    } else if (typeof reference[key] === "object") {
      reference = reference[key];
    } else {
      reference = reference[key];

      // If there are still keys in the path that have not been accessed,
      // return undefined.
      if (index < pathLength - 1) {
        reference = undefined;
      }
      break;
    }
  }

  memoiseCache[path] = {
    model: model,
    value: reference
  };

  return reference;
}

function overwriteModel(replacement, model) {
  if (typeof replacement !== 'object' || replacement === null) {
    throw "The model must be an object";
  }
  if (replacement === model) {
    return;
  }
  for (var modelProp in model) {
    delete model[modelProp];
  }
  for (var replacementProp in replacement) {
    model[replacementProp] = replacement[replacementProp];
  }
}

function set(path, value, model) {
  // passed a null or undefined path, do nothing.
  if (!path) {
    return;
  }

  memoiseCache = {};

  // If you just pass in an object, you are overwriting the model.
  if (typeof path === "object") {
    value = path;
    path = paths.createRoot();
  }

  var pathParts = paths.toParts(path),
    index = 0,
    pathLength = pathParts.length;

  if (paths.isRoot(path)) {
    overwriteModel(value, model);
    return;
  }

  if (paths.isAbsolute(path)) {
    index = 1;
  }

  var reference = model,
    keysChanged,
    previousReference,
    previousKey;

  for (; index < pathLength; index++) {
    var key = pathParts[index];

    // if we have hit a non-object property on the reference and we have more keys after this one
    // make an object (or array) here and move on.
    if ((typeof reference !== "object" || reference === null) && index < pathLength) {
      if (!isNaN(key)) {
        reference = previousReference[previousKey] = [];
      }
      else {
        reference = previousReference[previousKey] = {};
      }
    }
    if (index === pathLength - 1) {
      // if we are at the end of the line, set to the model
      if (!(key in reference)) {
        keysChanged = true;
      }
      reference[key] = value;
    }
    //otherwise, dig deeper
    else {
      previousReference = reference;
      previousKey = key;
      reference = reference[key];
    }
  }

  return keysChanged;
}

var modelOperations = {
  get: get,
  set: set
};
/* node_modules/gedi/weakmap.js */
var WM;

if (typeof WeakMap !== 'undefined') {
  WM = WeakMap;
} else if (typeof window !== 'undefined') {
  var rv = -1; // Return value assumes failure.
  if (navigator.appName == 'Microsoft Internet Explorer') {
    var match = navigator.userAgent.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/);
    if (match && match[1] <= 9) {
      WM = require('leak-map');
    }
  }
}

WM || (WM = require('weak-map'));
var weakmap = WM;

/* node_modules/gedi/events.js */
var WeakMap = weakmap,
  paths = require('gedi-paths'),
  pathConstants = paths.constants,
  get = modelOperations.get,
  set = modelOperations.set;

var isBrowser = typeof Node != 'undefined';

var events = function(modelGet, gel, PathToken) {
  var modelBindings,
    modelBindingDetails,
    callbackReferenceDetails,
    modelReferences;

  function resetEvents() {
    modelBindings = {};
    modelBindingDetails = new WeakMap();
    callbackReferenceDetails = new WeakMap();
    modelReferences = new WeakMap();
  }

  resetEvents();

  function createGetValue(expression, parentPath) {
    return function(scope, returnAsTokens) {
      return modelGet(expression, parentPath, scope, returnAsTokens);
    }
  }

  function ModelEventEmitter(target) {
    this.model = modelGet();
    this.events = {};
    this.alreadyEmitted = {};
    this.target = target;
  }
  ModelEventEmitter.prototype.pushPath = function(path, type, skipReferences) {
    var currentEvent = this.events[path];

    if (!currentEvent || type === 'target' || type === 'keys') {
      this.events[path] = type;
    }

    if (skipReferences) {
      return;
    }

    var modelValue = get(path, this.model),
      references = modelValue && typeof modelValue === 'object' && modelReferences.get(modelValue),
      referencePathParts,
      referenceBubblePath,
      pathParts = paths.toParts(path),
      targetParts = paths.toParts(this.target),
      referenceTarget;

    // If no references, or only in the model once
    // There are no reference events to fire.
    if (!references || Object.keys(references).length === 1) {
      return;
    }

    for (var key in references) {
      referencePathParts = paths.toParts(key);

      referenceTarget = paths.create(referencePathParts.concat(targetParts.slice(pathParts.length)));

      bubbleTrigger(referenceTarget, this, true);
      this.pushPath(referenceTarget, 'target', true);
      sinkTrigger(referenceTarget, this, true);
    }
  };
  ModelEventEmitter.prototype.emit = function() {
    var emitter = this,
      targetReference,
      referenceDetails;

    for (var path in this.events) {
      var type = this.events[path];

      targetReference = get(path, modelBindings);
      referenceDetails = targetReference && modelBindingDetails.get(targetReference);

      if (!referenceDetails) {
        continue;
      }

      for (var i = 0; i < referenceDetails.length; i++) {
        var details = referenceDetails[i],
          binding = details.binding,
          wildcardPath = matchWildcardPath(binding, emitter.target, details.parentPath);

        // binding had wildcards but
        // did not match the current target
        if (wildcardPath === false) {
          continue;
        }

        details.callback({
          target: emitter.target,
          binding: wildcardPath || details.binding,
          captureType: type,
          getValue: createGetValue(wildcardPath || details.binding, details.parentPath)
        });
      };
    }
  };

  function sinkTrigger(path, emitter, skipReferences) {
    var reference = get(path, modelBindings);

    for (var key in reference) {
      var sinkPath = paths.append(path, key);
      emitter.pushPath(sinkPath, 'sink', skipReferences);
      sinkTrigger(sinkPath, emitter, skipReferences);
    }
  }

  function bubbleTrigger(path, emitter, skipReferences) {
    var pathParts = paths.toParts(path);

    for (var i = 0; i < pathParts.length - 1; i++) {

      emitter.pushPath(
        paths.create(pathParts.slice(0, i + 1)),
        'bubble',
        skipReferences
      );
    }
  }

  function trigger(path, keysChange) {
    // resolve path to root
    path = paths.resolve(paths.createRoot(), path);

    var emitter = new ModelEventEmitter(path);

    bubbleTrigger(path, emitter);

    if (keysChange) {
      emitter.pushPath(paths.resolve(path, pathConstants.upALevel), 'keys');
    }

    emitter.pushPath(path, 'target');

    sinkTrigger(path, emitter);

    emitter.emit();
  }

  var memoisedExpressionPaths = {};
  function getPathsInExpression(expression) {
    var paths = [];

    if (memoisedExpressionPaths[expression]) {
      return memoisedExpressionPaths[expression];
    }

    if (gel) {
      var tokens = gel.tokenise(expression);
      for (var index = 0; index < tokens.length; index++) {
        var token = tokens[index];
        if (token.path != null) {
          paths.push(token.path);
        }
      }
    } else {
      return memoisedExpressionPaths[expression] = [paths.create(expression)];
    }
    return memoisedExpressionPaths[expression] = paths;
  }

  function addReferencesForBinding(path) {
    var model = modelGet(),
      pathParts = paths.toParts(path),
      itemPath = path,
      item = get(path, model);

    while (typeof item !== 'object' && pathParts.length) {
      pathParts.pop();
      itemPath = paths.create(pathParts);
      item = get(itemPath, model);
    }

    addModelReference(itemPath, item);
  }

  function setBinding(path, details) {
    // Handle wildcards
    if (path.indexOf(pathConstants.wildcard) >= 0) {
      var parts = paths.toParts(path);
      path = paths.create(parts.slice(0, parts.indexOf(pathConstants.wildcard)));
    }

    var resolvedPath = paths.resolve(paths.createRoot(), details.parentPath, path),
      reference = get(resolvedPath, modelBindings) || {},
      referenceDetails = modelBindingDetails.get(reference),
      callbackReferences = callbackReferenceDetails.get(details.callback);

    if (!referenceDetails) {
      referenceDetails = [];
      modelBindingDetails.set(reference, referenceDetails);
    }

    if (!callbackReferences) {
      callbackReferences = [];
      callbackReferenceDetails.set(details.callback, callbackReferences);
    }

    callbackReferences.push(resolvedPath);
    referenceDetails.push(details);

    set(resolvedPath, reference, modelBindings);

    addReferencesForBinding(path);
  }

  function bindExpression(binding, details) {
    var expressionPaths = getPathsInExpression(binding),
      boundExpressions = {};

    for (var i = 0; i < expressionPaths.length; i++) {
      var path = expressionPaths[i];
      if (!boundExpressions[path]) {
        boundExpressions[path] = true;
        setBinding(path, details);
      }
    }
  }

  function bind(path, callback, parentPath, binding) {
    parentPath = parentPath || paths.create();

    var details = {
      binding: binding || path,
      callback: callback,
      parentPath: parentPath
    };

    // If the binding is a simple path, skip the more complex
    // expression path binding.
    if (paths.is(path)) {
      return setBinding(path, details);
    }

    bindExpression(path, details);
  }

  function matchWildcardPath(binding, target, parentPath) {
    if (
      binding.indexOf(pathConstants.wildcard) >= 0 &&
      getPathsInExpression(binding)[0] === binding
    ) {
      //fully resolve the callback path
      var wildcardParts = paths.toParts(paths.resolve(paths.createRoot(), parentPath, binding)),
        targetParts = paths.toParts(target);

      for (var i = 0; i < wildcardParts.length; i++) {
        var pathPart = wildcardParts[i];
        if (pathPart === pathConstants.wildcard) {
          wildcardParts[i] = targetParts[i];
        } else if (pathPart !== targetParts[i]) {
          return false;
        }
      }

      return paths.create(wildcardParts);
    }
  }

  function debindPath(path, callback) {
    var targetReference = get(path, modelBindings),
      referenceDetails = modelBindingDetails.get(targetReference);

    if (referenceDetails) {
      for (var i = 0; i < referenceDetails.length; i++) {
        var details = referenceDetails[i];
        if (!callback || callback === details.callback) {
          referenceDetails.splice(i, 1);
          i--;
        }
      }
    }
  }

  function debindCallbackPaths(path, callback, parentPath) {
    if (callback) {
      var references = callback && callbackReferenceDetails.get(callback),
        resolvedPath = paths.resolve(paths.createRoot(), parentPath, path);

      if (references) {
        for (var i = 0; i < references.length; i++) {
          if (path != null && references[i] !== resolvedPath) {
            continue;
          }
          debindPath(references.splice(i, 1)[0], callback);
          i--;
        }
      }
      return;
    }
    debindPath(path);
  }

  function debindExpression(binding, callback, parentPath) {
    var expressionPaths = getPathsInExpression(binding);

    for (var i = 0; i < expressionPaths.length; i++) {
      var path = expressionPaths[i];
      debindCallbackPaths(path, callback, parentPath);
    }
  }

  function debind(expression, callback, parentPath) {

    // If you pass no path and no callback
    // You are trying to debind the entire gedi instance.
    if (!expression && !callback) {
      resetEvents();
      return;
    }

    if (typeof expression === 'function') {
      callback = expression;
      expression = null;
    }

    //If the expression is a simple path, skip the expression debind step.
    if (expression == null || paths.is(expression)) {
      return debindCallbackPaths(expression, callback, parentPath);
    }

    debindExpression(expression, callback, parentPath);
  }


  // Add a new object who's references should be tracked.
  function addModelReference(path, object) {
    if (!object || typeof object !== 'object') {
      return;
    }

    if (!paths.isAbsolute(path)) {
      path = paths.resolve(paths.createRoot(), path);
    }

    var objectReferences = modelReferences.get(object);

    if (!objectReferences) {
      objectReferences = {};
      modelReferences.set(object, objectReferences);
    }

    if (!(path in objectReferences)) {
      objectReferences[path] = null;
    }

    if (isBrowser && object instanceof Node) {
      return;
    }

    addModelReference(object.constructor.prototype);
    var keys = Object.keys(object);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i],
        prop = object[key];

      // Faster to check again here than to create pointless paths.
      if (prop && typeof prop === 'object') {
        var refPath = paths.append(path, key);
        if (modelReferences.has(prop)) {
          if (prop !== object) {
            modelReferences.get(prop)[refPath] = null;
          }
        } else {
          addModelReference(refPath, prop);
        }
      }
    }
  }

  function removeModelReference(path, object) {
    if (!object || typeof object !== 'object') {
      return;
    }

    var path = paths.resolve(paths.createRoot(), path),
      objectReferences = modelReferences.get(object),
      refIndex;

    if (!objectReferences) {
      return;
    }

    delete objectReferences[path];

    if (!Object.keys(objectReferences).length) {
      modelReferences['delete'](object);
    }

    for (var key in object) {
      var prop = object[key];

      // Faster to check again here than to create pointless paths.
      if (prop && typeof prop === 'object' && prop !== object) {
        removeModelReference(paths.append(path, paths.create(key)), prop);
      }
    }
  }

  return {
    bind: bind,
    trigger: trigger,
    debind: debind,
    addModelReference: addModelReference,
    removeModelReference: removeModelReference
  };
};

/* node_modules/gedi/gedi.js */
var Gel = require('gel-js'),
  createEvents = events,
  createPathToken = pathToken,
  get = modelOperations.get,
  set = modelOperations.set;

var gediConstructor = newGedi;

//Creates the public gedi constructor
function newGedi(model) {

  // Storage for the applications model
  model = model || {};


  // gel instance
  var gel = new Gel(),

    // Storage for tracking the dirty state of the model
    dirtyModel = {},

    PathToken = createPathToken(get, model),

    // Storage for model event handles
    events = createEvents(modelGet, gel, PathToken);


  //Initialise model references
  events.addModelReference('[/]', model);

  //internal functions

  //***********************************************
  //
  //      IE indexOf polyfill
  //
  //***********************************************

  //IE Specific idiocy

  Array.prototype.indexOf = Array.prototype.indexOf || function(object) {
    for (var i = 0; i < this.length; i++) {
      if (this === object) {
        return i;
      }
    }
  };

  // http://stackoverflow.com/questions/498970/how-do-i-trim-a-string-in-javascript
  String.prototype.trim = String.prototype.trim || function() { return this.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); };

  // http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
  Array.isArray = Array.isArray || function(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  //End IE land.

  //***********************************************
  //
  //      Array Fast Each
  //
  //***********************************************

  function each(object, callback) {
    var isArray = Array.isArray(object);
    for (var key in object) {
      if (isArray && isNaN(key)) {
        continue;
      }
      if (callback(object[key], key, object)) {
        break;
      }
    }
    return object;
  }

  //***********************************************
  //
  //      Gel integration
  //
  //***********************************************

  gel.tokenConverters.push(PathToken);

  gel.scope.isDirty = function(scope, args) {
    var token = args.getRaw(0, true);

    if (!token) {
      return false;
    }

    var path = (token instanceof PathToken) ? token.original : token.sourcePathInfo && token.sourcePathInfo.path;

    if (!path) {
      return false;
    }

    return isDirty(paths.resolve(scope.get('_gmc_'), path));
  };

  gel.scope.getAllDirty = function(scope, args) {
    var token = args.getRaw(0, true),
      source = token && token.result;

    if (source == null) {
      return null;
    }

    var result = source.constructor(),
      path = (token instanceof PathToken) ? token.original : token.sourcePathInfo && token.sourcePathInfo.path;

    if (!path) {
      return result;
    }

    var resolvedPath = paths.resolve(scope.get('_gmc_'), path),
      result,
      itemPath;

    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        itemPath = paths.resolve(path, paths.create(key));
        if (result instanceof Array) {
          isDirty(itemPath) && result.push(source[key]);
        } else {
          isDirty(itemPath) && (result[key] = source[key]);
        }
      }
    }

    return result;
  };

  //***********************************************
  //
  //      Remove
  //
  //***********************************************

  function remove(path, model) {
    var reference = model;

    memoiseCache = {};

    var pathParts = paths.toParts(path),
      index = 0,
      pathLength = pathParts.length;

    if (paths.isRoot(path)) {
      overwriteModel({}, model);
      return;
    }

    if (paths.isAbsolute(path)) {
      index = 1;
    }

    for (; index < pathLength; index++) {
      var key = pathParts[index];
      //if we have hit a non-object and we have more keys after this one
      if (typeof reference[key] !== "object" && index < pathLength - 1) {
        break;
      }
      if (index === pathLength - 1) {
        // if we are at the end of the line, delete the last key

        if (reference instanceof Array) {
          reference.splice(key, 1);
        } else {
          delete reference[key];
        }
      } else {
        reference = reference[key];
      }
    }

    return reference;
  }

  //***********************************************
  //
  //      Model Get
  //
  //***********************************************

  function modelGet(binding, parentPath, scope, returnAsTokens) {
    if (parentPath && typeof parentPath !== "string") {
      scope = parentPath;
      parentPath = paths.create();
    }

    if (binding) {
      var gelResult,
        expression = binding;

      scope = scope || {};

      scope['_gmc_'] = parentPath;

      return gel.evaluate(expression, scope, returnAsTokens);
    }

    parentPath = parentPath || paths.create();

    binding = paths.resolve(parentPath, binding);

    return get(binding, model);
  }

  //***********************************************
  //
  //      Model Set
  //
  //***********************************************

  function getSourcePathInfo(expression, parentPath, scope, subPathOpperation) {
    var scope = scope || {},
      path;

    scope._gmc_ = parentPath;

    var resultToken = gel.evaluate(expression, scope, true)[0],
      sourcePathInfo = resultToken.sourcePathInfo;

    if (sourcePathInfo) {
      if (sourcePathInfo.subPaths) {
        each(sourcePathInfo.subPaths, function(item) {
          subPathOpperation(item);
        });
        return;
      }
      path = sourcePathInfo.path;
    } else {
      path = resultToken.path;
    }
    if (path) {
      subPathOpperation(path);
    }
  }

  function DeletedItem() { }

  function modelSetPath(path, value, parentPath, dirty, scope) {
    parentPath = parentPath || paths.create();
    path = paths.resolve(parentPath, path);

    setDirtyState(path, dirty);

    var previousValue = get(path, model);

    var keysChanged = set(path, value, model);

    if (!(value instanceof DeletedItem)) {
      events.addModelReference(path, value);
      events.trigger(path, keysChanged);
    }

    if (!(value && typeof value !== 'object') && previousValue && typeof previousValue === 'object') {
      events.removeModelReference(path, previousValue);
    }
  }

  function modelSet(expression, value, parentPath, dirty, scope) {
    if (typeof expression === 'object' && !paths.create(expression)) {
      dirty = value;
      value = expression;
      expression = paths.createRoot();
    } else if (typeof parentPath === 'boolean') {
      dirty = parentPath;
      parentPath = undefined;
    }

    getSourcePathInfo(expression, parentPath, scope, function(subPath) {
      modelSetPath(subPath, value, parentPath, dirty, scope);
    });
  }

  //***********************************************
  //
  //      Model Remove
  //
  //***********************************************

  function modelRemove(expression, parentPath, dirty, scope) {
    if (parentPath instanceof Boolean) {
      dirty = parentPath;
      parentPath = undefined;
    }

    itemParentPaths = {};
    getSourcePathInfo(expression, parentPath, scope, function(subPath) {
      modelSetPath(subPath, new DeletedItem(), parentPath, dirty, scope);
      itemParentPaths[paths.append(subPath, paths.create(pathConstants.upALevel))] = null;
    });

    for (var key in itemParentPaths) {
      if (itemParentPaths.hasOwnProperty(key)) {
        var itemParentPath = paths.resolve(parentPath || paths.createRoot(), key),
          parentObject = get(itemParentPath, model),
          isArray = Array.isArray(parentObject);

        if (isArray) {
          var anyRemoved;
          for (var i = 0; i < parentObject.length; i++) {
            if (parentObject[i] instanceof DeletedItem) {
              parentObject.splice(i, 1);
              i--;
              anyRemoved = true;
            }
          }
          if (anyRemoved) {
            events.trigger(itemParentPath);
          }
        }
        // Always run keys version, because array's might have non-index keys
        for (var key in parentObject) {
          if (parentObject[key] instanceof DeletedItem) {
            delete parentObject[key];
            events.trigger(paths.append(itemParentPath, key));
          }
        }
      }
    }

  }

  //***********************************************
  //
  //      Set Dirty State
  //
  //***********************************************

  function setPathDirtyState(path, dirty, parentPath, scope) {
    var reference = dirtyModel;
    if (!paths.create(path)) {
      throw exceptions.invalidPath;
    }

    parentPath = parentPath || paths.create();


    dirty = dirty !== false;

    if (paths.isRoot(path)) {
      dirtyModel = {
        '_isDirty_': dirty
      };
      return;
    }

    var index = 0;

    if (paths.isAbsolute(path)) {
      index = 1;
    }

    var pathParts = paths.toParts(paths.resolve(parentPath, path));

    for (; index < pathParts.length; index++) {
      var key = pathParts[index];
      if ((typeof reference[key] !== "object" || reference[key] === null) && index < pathParts.length - 1) {
        reference[key] = {};
      }
      if (index === pathParts.length - 1) {
        reference[key] = {};
        reference[key]['_isDirty_'] = dirty;
      }
      else {
        reference = reference[key];
      }
    }

    if (!pathParts.length) {
      dirtyModel['_isDirty_'] = dirty;
    }
  }

  function setDirtyState(expression, dirty, parentPath, scope) {
    getSourcePathInfo(expression, parentPath, scope, function(subPath) {
      setPathDirtyState(subPath, dirty, parentPath, scope);
    });
  }

  //***********************************************
  //
  //      Is Dirty
  //
  //***********************************************

  function isDirty(path) {
    var reference,
      hasDirtyChildren = function(ref) {
        if (typeof ref !== 'object') {
          return false;
        }
        if (ref['_isDirty_']) {
          return true;
        } else {
          for (var key in ref) {
            if (hasDirtyChildren(ref[key])) {
              return true;
            }
          }
        }
      };

    reference = get(path, dirtyModel);

    return !!hasDirtyChildren(reference);
  }

  //Public Objects ******************************************************************************


  function Gedi() { }

  Gedi.prototype = {
    paths: {
      create: paths.create,
      resolve: paths.resolve,
      isRoot: paths.isRoot,
      isAbsolute: paths.isAbsolute,
      append: paths.append,
      toParts: paths.toParts
    },

    /**
        ## .get

        model.get(expression, parentPath, scope, returnAsTokens)

        Get data from the model

            // get model.stuff
            var data = model.get('[stuff]');

        Expressions passed to get will be evaluated by gel:

            // get a list of items that have a truthy .selected property.
            var items = model.get('(filter [items] {item item.selected})');

        You can scope paths in the expression to a parent path:

            // get the last account.
            var items = model.get('(last [])', '[accounts]')'

    */
    get: modelGet,

    /**
        ## .set

        model.set(expression, value, parentPath, dirty)

        Set data into the model

            // set model.stuff to true
            model.set('[stuff]', true);

        Expressions passed to set will be evaluated by gel:

            // find all items that are not selected and set them to be selected
            model.set('(map (filter [items] {item (! item.selected)}) {item item.selected})', true);

        You can scope paths in the expression to a parent path:

            // set the last account to a different account.
            model.set('(last [])', '[accounts]', someAccount);

    */
    set: modelSet,

    /**
        ## .remove

        model.remove(expression, value, parentPath, dirty)

        If the target key is on an object, the key will be deleted.
        If the target key is an index in an array, the item will be spliced out.

        remove data from the model

            // remove model.stuff.
            model.remove('[stuff]');

        Expressions passed to remove will be evaluated by gel:

            // remove all selected items.
            model.remove('(filter [items] {item item.selected})');

        You can scope paths in the expression to a parent path:

            // remove the last account.
            model.remove('(last [])', '[accounts]');

    */
    remove: modelRemove,

    utils: {
      get: get,
      set: set
    },

    init: function(model) {
      this.set(model, false);
    },

    /**
        ## .bind

        model.bind(expression, callback, parentPath)

        bind a callback to change events on the model

    */
    bind: events.bind,

    /**
        ## .debind

        model.debind(expression, callback)

        debind a callback

    */
    debind: events.debind,

    /**
        ## .trigger

        model.trigger(path)

        trigger events for a path

    */
    trigger: events.trigger,

    /**
        ## .isDirty

        model.isDirty(path)

        check if a path in the model has been changed since being marked as clean.

    */
    isDirty: isDirty,

    /**
        ## .setDirtyState

        model.setDirtyState(path, dirty, parentPath)

        explicity mark a path in the model as dirty or clean

    */
    setDirtyState: setDirtyState,

    gel: gel, // expose gel instance for extension

    getNumberOfBindings: function() {
      function getNumCallbacks(reference) {
        var length = reference.length;
        for (var key in reference) {
          if (isNaN(key)) {
            length += getNumCallbacks(reference[key]);
          }
        }
        return length;
      }

      return getNumCallbacks(internalBindings);
    }
  };

  return new Gedi();
}

module.exports = gediConstructor;
