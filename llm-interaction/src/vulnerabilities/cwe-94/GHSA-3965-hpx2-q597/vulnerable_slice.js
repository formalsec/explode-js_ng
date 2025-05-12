// node_modules/pug/lib/index.js
var filters = require('pug-filters');
var generateCode = require('pug-code-gen');
var lex = require('pug-lexer');
var load = require('pug-load');
var link = require('pug-linker');
var stripComments = require('pug-strip-comments');
var parse = require('pug-parser');


exports.filters = {};

function applyPlugins(value, options, plugins, name) {
  return plugins.reduce(function(value, plugin) {
    return plugin[name] ? plugin[name](value, options) : value;
  }, value);
}

function findReplacementFunc(plugins, name) {
  var eligiblePlugins = plugins.filter(function(plugin) {
    return plugin[name];
  });

  if (eligiblePlugins.length > 1) {
    throw new Error('Two or more plugins all implement ' + name + ' method.');
  } else if (eligiblePlugins.length) {
    return eligiblePlugins[0][name].bind(eligiblePlugins[0]);
  }
  return null;
}

function compileBody(str, options) {
  var debug_sources = {};
  debug_sources[options.filename] = str;
  var dependencies = [];
  var plugins = options.plugins || [];
  var ast = load.string(str, {
    filename: options.filename,
    basedir: options.basedir,
    lex: function(str, options) {
      var lexOptions = {};
      Object.keys(options).forEach(function(key) {
        lexOptions[key] = options[key];
      });
      lexOptions.plugins = plugins
        .filter(function(plugin) {
          return !!plugin.lex;
        })
        .map(function(plugin) {
          return plugin.lex;
        });
      var contents = applyPlugins(
        str,
        {filename: options.filename},
        plugins,
        'preLex'
      );
      return applyPlugins(
        lex(contents, lexOptions),
        options,
        plugins,
        'postLex'
      );
    },
    parse: function(tokens, options) {
      tokens = tokens.map(function(token) {
        if (token.type === 'path' && path.extname(token.val) === '') {
          return {
            type: 'path',
            loc: token.loc,
            val: token.val + '.pug',
          };
        }
        return token;
      });
      tokens = stripComments(tokens, options);
      tokens = applyPlugins(tokens, options, plugins, 'preParse');
      var parseOptions = {};
      Object.keys(options).forEach(function(key) {
        parseOptions[key] = options[key];
      });
      parseOptions.plugins = plugins
        .filter(function(plugin) {
          return !!plugin.parse;
        })
        .map(function(plugin) {
          return plugin.parse;
        });

      return applyPlugins(
        applyPlugins(
          parse(tokens, parseOptions),
          options,
          plugins,
          'postParse'
        ),
        options,
        plugins,
        'preLoad'
      );
    },
    resolve: function(filename, source, loadOptions) {
      var replacementFunc = findReplacementFunc(plugins, 'resolve');
      if (replacementFunc) {
        return replacementFunc(filename, source, options);
      }

      return load.resolve(filename, source, loadOptions);
    },
    read: function(filename, loadOptions) {
      dependencies.push(filename);

      var contents;

      var replacementFunc = findReplacementFunc(plugins, 'read');
      if (replacementFunc) {
        contents = replacementFunc(filename, options);
      } else {
        contents = load.read(filename, loadOptions);
      }

      debug_sources[filename] = Buffer.isBuffer(contents)
        ? contents.toString('utf8')
        : contents;
      return contents;
    },
  });
  ast = applyPlugins(ast, options, plugins, 'postLoad');
  ast = applyPlugins(ast, options, plugins, 'preFilters');

  var filtersSet = {};
  Object.keys(exports.filters).forEach(function(key) {
    filtersSet[key] = exports.filters[key];
  });
  if (options.filters) {
    Object.keys(options.filters).forEach(function(key) {
      filtersSet[key] = options.filters[key];
    });
  }
  ast = filters.handleFilters(
    ast,
    filtersSet,
    options.filterOptions,
    options.filterAliases
  );

  ast = applyPlugins(ast, options, plugins, 'postFilters');
  ast = applyPlugins(ast, options, plugins, 'preLink');
  ast = link(ast);
  ast = applyPlugins(ast, options, plugins, 'postLink');

  // Compile
  ast = applyPlugins(ast, options, plugins, 'preCodeGen');
  var js = (findReplacementFunc(plugins, 'generateCode') || generateCode)(ast, {
    pretty: options.pretty,
    compileDebug: options.compileDebug,
    doctype: options.doctype,
    inlineRuntimeFunctions: options.inlineRuntimeFunctions,
    globals: options.globals,
    self: options.self,
    includeSources: options.includeSources ? debug_sources : false,
    templateName: options.templateName,
  });
  js = applyPlugins(js, options, plugins, 'postCodeGen');

  // Debug compiler
  if (options.debug) {
    console.error(
      '\nCompiled Function:\n\n\u001b[90m%s\u001b[0m',
      js.replace(/^/gm, '  ')
    );
  }

  return {body: js, dependencies: dependencies};
}

exports.compileClientWithDependenciesTracked = function(str, options) {
  var options = options || {};

  str = String(str);
  var parsed = compileBody(str, {
    compileDebug: options.compileDebug,
    filename: options.filename,
    basedir: options.basedir,
    pretty: options.pretty,
    doctype: options.doctype,
    inlineRuntimeFunctions: options.inlineRuntimeFunctions !== false,
    globals: options.globals,
    self: options.self,
    includeSources: options.compileDebug,
    debug: options.debug,
    templateName: options.name || 'template',
    filters: options.filters,
    filterOptions: options.filterOptions,
    filterAliases: options.filterAliases,
    plugins: options.plugins,
  });

  var body = parsed.body;

  if (options.module) {
    if (options.inlineRuntimeFunctions === false) {
      body = 'var pug = require("pug-runtime");' + body;
    }
    body += ' module.exports = ' + (options.name || 'template') + ';';
  }

  return {body: body, dependencies: parsed.dependencies};
};

exports.compileClient = function (str, options) {
  return exports.compileClientWithDependenciesTracked(str, options).body;
};
