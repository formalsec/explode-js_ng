"use strict";

/* node_module/angular-expressions/lib/parse.js */
function getStringValue(name) {
	// Property names must be strings. This means that non-string objects cannot be used
	// as keys in an object. Any non-string object, including a number, is typecasted
	// into a string via the toString method.
	// -- MDN, https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Operators/Property_accessors#Property_names
	//
	// So, to ensure that we are checking the same `name` that JavaScript would use, we cast it
	// to a string. It's not always possible. If `name` is an object and its `toString` method is
	// 'broken' (doesn't return a string, isn't a function, etc.), an error will be thrown:
	//
	// TypeError: Cannot convert object to primitive value
	//
	// For performance reasons, we don't catch this error here and allow it to propagate up the call
	// stack. Note that you'll get the same error in JavaScript if you try to access a property using
	// such a 'broken' object as a key.
	return name + "";
}
function minErr(module, ErrorConstructor) {
	ErrorConstructor = ErrorConstructor || Error;
	return function () {
		var SKIP_INDEXES = 2;

		var templateArgs = arguments,
			code = templateArgs[0],
			message = "[" + (module ? module + ":" : "") + code + "] ",
			template = templateArgs[1],
			paramPrefix,
			i;

		message += template.replace(/\{\d+\}/g, function (match) {
			var index = +match.slice(1, -1),
				shiftedIndex = index + SKIP_INDEXES;

			if (shiftedIndex < templateArgs.length) {
				return toDebugString(templateArgs[shiftedIndex]);
			}

			return match;
		});

		message +=
			'\nhttp://errors.angularjs.org/"NG_VERSION_FULL"/' +
			(module ? module + "/" : "") +
			code;

		for (
			i = SKIP_INDEXES, paramPrefix = "?";
			i < templateArgs.length;
			i++, paramPrefix = "&"
		) {
			message +=
				paramPrefix +
				"p" +
				(i - SKIP_INDEXES) +
				"=" +
				encodeURIComponent(toDebugString(templateArgs[i]));
		}

		return new ErrorConstructor(message);
	};
}
var hasOwnProperty = Object.prototype.hasOwnProperty;

var lowercase = function (string) {
	return isString(string) ? string.toLowerCase() : string;
};

/**
 * @ngdoc function
 * @name angular.isArray
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is an `Array`.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is an `Array`.
 */
var isArray = Array.isArray;

var manualLowercase = function (s) {
	return isString(s)
		? s.replace(/[A-Z]/g, function (ch) {
				return String.fromCharCode(ch.charCodeAt(0) | 32);
			})
		: s;
};

// String#toLowerCase and String#toUpperCase don't produce correct results in browsers with Turkish
// locale, for this reason we need to detect this case and redefine lowercase/uppercase methods
// with correct but slower alternatives. See https://github.com/angular/angular.js/issues/11387
if ("I".toLowerCase() !== "i") {
	lowercase = manualLowercase;
}

var jqLite, // delay binding since jQuery could be loaded after us.
	toString = Object.prototype.toString,
	getPrototypeOf = Object.getPrototypeOf,
	ngMinErr = minErr("ng");

/**
 * @private
 * @param {*} obj
 * @return {boolean} Returns true if `obj` is an array or array-like object (NodeList, Arguments,
 *                   String ...)
 */
function isArrayLike(obj) {
	// `null`, `undefined` and `window` are not array-like
	if (obj == null || isWindow(obj)) {
		return false;
	}

	// arrays, strings and jQuery/jqLite objects are array like
	// * jqLite is either the jQuery or jqLite constructor function
	// * we have to check the existence of jqLite first as this method is called
	//   via the forEach method when constructing the jqLite object in the first place
	if (isArray(obj) || isString(obj) || (jqLite && obj instanceof jqLite)) {
		return true;
	}

	// Support: iOS 8.2 (not reproducible in simulator)
	// "length" in obj used to prevent JIT error (gh-11508)
	var length = "length" in Object(obj) && obj.length;

	// NodeList objects (with `item` method) and
	// other objects with suitable length characteristics are array-like
	return (
		isNumber(length) &&
		((length >= 0 && (length - 1 in obj || obj instanceof Array)) ||
			typeof obj.item === "function")
	);
}

/**
 * @ngdoc function
 * @name angular.forEach
 * @module ng
 * @kind function
 *
 * @description
 * Invokes the `iterator` function once for each item in `obj` collection, which can be either an
 * object or an array. The `iterator` function is invoked with `iterator(value, key, obj)`, where `value`
 * is the value of an object property or an array element, `key` is the object property key or
 * array element index and obj is the `obj` itself. Specifying a `context` for the function is optional.
 *
 * It is worth noting that `.forEach` does not iterate over inherited properties because it filters
 * using the `hasOwnProperty` method.
 *
 * Unlike ES262's
 * [Array.prototype.forEach](http://www.ecma-international.org/ecma-262/5.1/#sec-15.4.4.18),
 * providing 'undefined' or 'null' values for `obj` will not throw a TypeError, but rather just
 * return the value provided.
 *
   ```js
     var values = {name: 'misko', gender: 'male'};
     var log = [];
     angular.forEach(values, function(value, key) {
       this.push(key + ': ' + value);
     }, log);
     expect(log).toEqual(['name: misko', 'gender: male']);
   ```
 *
 * @param {Object|Array} obj Object to iterate over.
 * @param {Function} iterator Iterator function.
 * @param {Object=} context Object to become context (`this`) for the iterator function.
 * @returns {Object|Array} Reference to `obj`.
 */

function forEach(obj, iterator, context) {
	var key, length;
	if (obj) {
		if (isFunction(obj)) {
			for (key in obj) {
				if (
					key !== "prototype" &&
					key !== "length" &&
					key !== "name" &&
					obj.hasOwnProperty(key)
				) {
					iterator.call(context, obj[key], key, obj);
				}
			}
		} else if (isArray(obj) || isArrayLike(obj)) {
			var isPrimitive = typeof obj !== "object";
			for (key = 0, length = obj.length; key < length; key++) {
				if (isPrimitive || key in obj) {
					iterator.call(context, obj[key], key, obj);
				}
			}
		} else if (obj.forEach && obj.forEach !== forEach) {
			obj.forEach(iterator, context, obj);
		} else if (isBlankObject(obj)) {
			// createMap() fast path --- Safe to avoid hasOwnProperty check because prototype chain is empty
			// eslint-disable-next-line guard-for-in
			for (key in obj) {
				iterator.call(context, obj[key], key, obj);
			}
		} else if (typeof obj.hasOwnProperty === "function") {
			// Slow path for objects inheriting Object.prototype, hasOwnProperty check needed
			for (key in obj) {
				if (obj.hasOwnProperty(key)) {
					iterator.call(context, obj[key], key, obj);
				}
			}
		} else {
			// Slow path for objects which do not have a method `hasOwnProperty`
			for (key in obj) {
				if (hasOwnProperty.call(obj, key)) {
					iterator.call(context, obj[key], key, obj);
				}
			}
		}
	}
	return obj;
}

/**
 * Set or clear the hashkey for an object.
 * @param obj object
 * @param h the hashkey (!truthy to delete the hashkey)
 */
function setHashKey(obj, h) {
	if (h) {
		obj.$$hashKey = h;
	} else {
		delete obj.$$hashKey;
	}
}

function noop() {}

/**
 * @ngdoc function
 * @name angular.isUndefined
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is undefined.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is undefined.
 */
function isUndefined(value) {
	return typeof value === "undefined";
}

/**
 * @ngdoc function
 * @name angular.isDefined
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is defined.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is defined.
 */
function isDefined(value) {
	return typeof value !== "undefined";
}

/**
 * @ngdoc function
 * @name angular.isObject
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is an `Object`. Unlike `typeof` in JavaScript, `null`s are not
 * considered to be objects. Note that JavaScript arrays are objects.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is an `Object` but not `null`.
 */
function isObject(value) {
	// http://jsperf.com/isobject4
	return value !== null && typeof value === "object";
}

/**
 * Determine if a value is an object with a null prototype
 *
 * @returns {boolean} True if `value` is an `Object` with a null prototype
 */
function isBlankObject(value) {
	return value !== null && typeof value === "object" && !getPrototypeOf(value);
}

/**
 * @ngdoc function
 * @name angular.isString
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is a `String`.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is a `String`.
 */
function isString(value) {
	return typeof value === "string";
}

/**
 * @ngdoc function
 * @name angular.isNumber
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is a `Number`.
 *
 * This includes the "special" numbers `NaN`, `+Infinity` and `-Infinity`.
 *
 * If you wish to exclude these then you can use the native
 * [`isFinite'](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/isFinite)
 * method.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is a `Number`.
 */
function isNumber(value) {
	return typeof value === "number";
}

/**
 * @ngdoc function
 * @name angular.isFunction
 * @module ng
 * @kind function
 *
 * @description
 * Determines if a reference is a `Function`.
 *
 * @param {*} value Reference to check.
 * @returns {boolean} True if `value` is a `Function`.
 */
function isFunction(value) {
	return typeof value === "function";
}

/**
 * Checks if `obj` is a window object.
 *
 * @private
 * @param {*} obj Object to check
 * @returns {boolean} True if `obj` is a window obj.
 */
function isWindow(obj) {
	return obj && obj.window === obj;
}

function isScope(obj) {
	return obj && obj.$evalAsync && obj.$watch;
}

var TYPED_ARRAY_REGEXP =
	/^\[object (?:Uint8|Uint8Clamped|Uint16|Uint32|Int8|Int16|Int32|Float32|Float64)Array\]$/;
function isTypedArray(value) {
	return (
		value &&
		isNumber(value.length) &&
		TYPED_ARRAY_REGEXP.test(toString.call(value))
	);
}

function isArrayBuffer(obj) {
	return toString.call(obj) === "[object ArrayBuffer]";
}

function Lexer(options) {
	this.options = options || {};
}

Lexer.prototype = {
	constructor: Lexer,

	lex: function (text) {
		this.text = text;
		this.index = 0;
		this.tokens = [];

		while (this.index < this.text.length) {
			var ch = this.text.charAt(this.index);
			if (ch === '"' || ch === "'" || ch === "`") {
				this.readString(ch);
			} else if (
				this.isNumber(ch) ||
				(ch === "." && this.isNumber(this.peek()))
			) {
				this.readNumber();
			} else if (this.isIdentifierStart(this.peekMultichar())) {
				this.readIdent();
			} else if (this.is(ch, "(){}[].,;:?")) {
				this.tokens.push({ index: this.index, text: ch });
				this.index++;
			} else if (this.isWhitespace(ch)) {
				this.index++;
			} else {
				var ch2 = ch + this.peek();
				var ch3 = ch2 + this.peek(2);
				var op1 = OPERATORS[ch];
				var op2 = OPERATORS[ch2];
				var op3 = OPERATORS[ch3];
				if (op1 || op2 || op3) {
					var token = op3 ? ch3 : op2 ? ch2 : ch;
					this.tokens.push({ index: this.index, text: token, operator: true });
					this.index += token.length;
				} else {
					this.throwError(
						"Unexpected next character ",
						this.index,
						this.index + 1
					);
				}
			}
		}
		return this.tokens;
	},

	is: function (ch, chars) {
		return chars.indexOf(ch) !== -1;
	},

	peek: function (i) {
		var num = i || 1;
		return this.index + num < this.text.length
			? this.text.charAt(this.index + num)
			: false;
	},

	isNumber: function (ch) {
		return ch >= "0" && ch <= "9" && typeof ch === "string";
	},

	isWhitespace: function (ch) {
		// IE treats non-breaking space as \u00A0
		return (
			ch === " " ||
			ch === "\r" ||
			ch === "\t" ||
			ch === "\n" ||
			ch === "\v" ||
			ch === "\u00A0"
		);
	},

	isIdentifierStart: function (ch) {
		return this.options.isIdentifierStart
			? this.options.isIdentifierStart(ch, this.codePointAt(ch))
			: this.isValidIdentifierStart(ch);
	},

	isValidIdentifierStart: function (ch) {
		return (
			(ch >= "a" && ch <= "z") ||
			(ch >= "A" && ch <= "Z") ||
			ch === "_" ||
			ch === "$"
		);
	},

	isIdentifierContinue: function (ch) {
		return this.options.isIdentifierContinue
			? this.options.isIdentifierContinue(ch, this.codePointAt(ch))
			: this.isValidIdentifierContinue(ch);
	},

	isValidIdentifierContinue: function (ch, cp) {
		return this.isValidIdentifierStart(ch, cp) || this.isNumber(ch);
	},

	codePointAt: function (ch) {
		if (ch.length === 1) {
			return ch.charCodeAt(0);
		}

		return (ch.charCodeAt(0) << 10) + ch.charCodeAt(1) - 0x35fdc00;
	},

	peekMultichar: function () {
		var ch = this.text.charAt(this.index);
		var peek = this.peek();
		if (!peek) {
			return ch;
		}
		var cp1 = ch.charCodeAt(0);
		var cp2 = peek.charCodeAt(0);
		if (cp1 >= 0xd800 && cp1 <= 0xdbff && cp2 >= 0xdc00 && cp2 <= 0xdfff) {
			return ch + peek;
		}
		return ch;
	},

	isExpOperator: function (ch) {
		return ch === "-" || ch === "+" || this.isNumber(ch);
	},

	throwError: function (error, start, end) {
		end = end || this.index;
		var colStr = isDefined(start)
			? "s " +
				start +
				"-" +
				this.index +
				" [" +
				this.text.substring(start, end) +
				"]"
			: " " + end;
		throw $parseMinErr(
			"lexerr",
			"Lexer Error: {0} at column{1} in expression [{2}].",
			error,
			colStr,
			this.text
		);
	},

	readNumber: function () {
		var number = "";
		var start = this.index;
		while (this.index < this.text.length) {
			var ch = lowercase(this.text.charAt(this.index));
			if (ch === "." || this.isNumber(ch)) {
				number += ch;
			} else {
				var peekCh = this.peek();
				if (ch === "e" && this.isExpOperator(peekCh)) {
					number += ch;
				} else if (
					this.isExpOperator(ch) &&
					peekCh &&
					this.isNumber(peekCh) &&
					number.charAt(number.length - 1) === "e"
				) {
					number += ch;
				} else if (
					this.isExpOperator(ch) &&
					(!peekCh || !this.isNumber(peekCh)) &&
					number.charAt(number.length - 1) === "e"
				) {
					this.throwError("Invalid exponent");
				} else {
					break;
				}
			}
			this.index++;
		}
		this.tokens.push({
			index: start,
			text: number,
			constant: true,
			value: Number(number),
		});
	},

	readIdent: function () {
		var start = this.index;
		this.index += this.peekMultichar().length;
		while (this.index < this.text.length) {
			var ch = this.peekMultichar();
			if (!this.isIdentifierContinue(ch)) {
				break;
			}
			this.index += ch.length;
		}
		this.tokens.push({
			index: start,
			text: this.text.slice(start, this.index),
			identifier: true,
		});
	},

	readString: function (quote) {
		// quote will be ', " or `
		var start = this.index;
		this.index++;
		var string = "";
		var rawString = quote;
		var isTemplateLiteral = quote === "`";
		var escape = false;
		while (this.index < this.text.length) {
			var ch = this.text.charAt(this.index);
			if (
				isTemplateLiteral &&
				ch === "$" &&
				this.text.charAt(this.index + 1) === "{"
			) {
				this.tokens.push({
					index: start,
					text: rawString,
					constant: true,
					value: string,
				});
				var inside = this.text.indexOf("}", this.index);
				var myVariable = this.text.substr(
					this.index + 2,
					inside - this.index - 2
				);
				this.tokens.push({ index: this.index, text: "+", operator: true });
				var lexed = new Lexer(this.options).lex(myVariable);
				for (var i = 0, len = lexed.length; i < len; i++) {
					this.tokens.push(lexed[i]);
				}
				this.tokens.push({ index: this.index, text: "+", operator: true });
				this.index = inside;
				this.readString("`");
				return;
			}
			rawString += ch;
			if (escape) {
				if (ch === "u") {
					var hex = this.text.substring(this.index + 1, this.index + 5);
					if (!hex.match(/[\da-f]{4}/i)) {
						this.throwError("Invalid unicode escape [\\u" + hex + "]");
					}
					this.index += 4;
					string += String.fromCharCode(parseInt(hex, 16));
				} else {
					var rep = ESCAPE[ch];
					string = string + (rep || ch);
				}
				escape = false;
			} else if (ch === "\\") {
				escape = true;
			} else if (ch === quote) {
				// Matching closing quote
				this.index++;
				this.tokens.push({
					index: start,
					text: rawString,
					constant: true,
					value: string,
				});
				return;
			} else {
				string += ch;
			}
			this.index++;
		}
		this.throwError("Unterminated quote", start);
	},
};

function AST(lexer, options) {
	this.lexer = lexer;
	this.options = options;
}

AST.Program = "Program";
AST.ExpressionStatement = "ExpressionStatement";
AST.AssignmentExpression = "AssignmentExpression";
AST.ConditionalExpression = "ConditionalExpression";
AST.LogicalExpression = "LogicalExpression";
AST.BinaryExpression = "BinaryExpression";
AST.UnaryExpression = "UnaryExpression";
AST.CallExpression = "CallExpression";
AST.MemberExpression = "MemberExpression";
AST.Identifier = "Identifier";
AST.Literal = "Literal";
AST.ArrayExpression = "ArrayExpression";
AST.Property = "Property";
AST.ObjectExpression = "ObjectExpression";
AST.ThisExpression = "ThisExpression";
AST.LocalsExpression = "LocalsExpression";

// Internal use only
AST.NGValueParameter = "NGValueParameter";

AST.prototype = {
	ast: function (text) {
		this.text = text;
		this.tokens = this.lexer.lex(text);

		var value = this.program();

		if (this.tokens.length !== 0) {
			this.throwError("is an unexpected token", this.tokens[0]);
		}

		return value;
	},

	program: function () {
		var body = [];
		while (true) {
			if (this.tokens.length > 0 && !this.peek("}", ")", ";", "]")) {
				body.push(this.expressionStatement());
			}
			if (!this.expect(";")) {
				return { type: AST.Program, body: body };
			}
		}
	},

	expressionStatement: function () {
		return { type: AST.ExpressionStatement, expression: this.filterChain() };
	},

	filterChain: function () {
		var left = this.expression();
		while (this.expect("|")) {
			left = this.filter(left);
		}
		return left;
	},

	expression: function () {
		return this.assignment();
	},

	assignment: function () {
		var result = this.ternary();
		if (this.expect("=")) {
			if (!isAssignable(result)) {
				throw $parseMinErr("lval", "Trying to assign a value to a non l-value");
			}

			result = {
				type: AST.AssignmentExpression,
				left: result,
				right: this.assignment(),
				operator: "=",
			};
		}
		return result;
	},

	ternary: function () {
		var test = this.logicalOR();
		var alternate;
		var consequent;
		if (this.expect("?")) {
			alternate = this.expression();
			if (this.consume(":")) {
				consequent = this.expression();
				return {
					type: AST.ConditionalExpression,
					test: test,
					alternate: alternate,
					consequent: consequent,
				};
			}
		}
		return test;
	},

	logicalOR: function () {
		var left = this.logicalAND();
		while (this.expect("||")) {
			left = {
				type: AST.LogicalExpression,
				operator: "||",
				left: left,
				right: this.logicalAND(),
			};
		}
		return left;
	},

	logicalAND: function () {
		var left = this.equality();
		while (this.expect("&&")) {
			left = {
				type: AST.LogicalExpression,
				operator: "&&",
				left: left,
				right: this.equality(),
			};
		}
		return left;
	},

	equality: function () {
		var left = this.relational();
		var token;
		while ((token = this.expect("==", "!=", "===", "!=="))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.relational(),
			};
		}
		return left;
	},

	relational: function () {
		var left = this.additive();
		var token;
		while ((token = this.expect("<", ">", "<=", ">="))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.additive(),
			};
		}
		return left;
	},

	additive: function () {
		var left = this.multiplicative();
		var token;
		while ((token = this.expect("+", "-"))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.multiplicative(),
			};
		}
		return left;
	},

	multiplicative: function () {
		var left = this.unary();
		var token;
		while ((token = this.expect("*", "/", "%"))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.unary(),
			};
		}
		return left;
	},

	unary: function () {
		var token;
		if ((token = this.expect("+", "-", "!"))) {
			return {
				type: AST.UnaryExpression,
				operator: token.text,
				prefix: true,
				argument: this.unary(),
			};
		}
		return this.primary();
	},

	primary: function () {
		var primary;
		if (this.expect("(")) {
			primary = this.filterChain();
			this.consume(")");
		} else if (this.expect("[")) {
			primary = this.arrayDeclaration();
		} else if (this.expect("{")) {
			primary = this.object();
		} else if (this.selfReferential.hasOwnProperty(this.peek().text)) {
			primary = copy(this.selfReferential[this.consume().text]);
		} else if (this.options.literals.hasOwnProperty(this.peek().text)) {
			primary = {
				type: AST.Literal,
				value: this.options.literals[this.consume().text],
			};
		} else if (this.peek().identifier) {
			primary = this.identifier();
		} else if (this.peek().constant) {
			primary = this.constant();
		} else {
			this.throwError("not a primary expression", this.peek());
		}

		var next;
		while ((next = this.expect("(", "[", "."))) {
			if (next.text === "(") {
				primary = {
					type: AST.CallExpression,
					callee: primary,
					arguments: this.parseArguments(),
				};
				this.consume(")");
			} else if (next.text === "[") {
				primary = {
					type: AST.MemberExpression,
					object: primary,
					property: this.expression(),
					computed: true,
				};
				this.consume("]");
			} else if (next.text === ".") {
				primary = {
					type: AST.MemberExpression,
					object: primary,
					property: this.identifier(),
					computed: false,
				};
			} else {
				this.throwError("IMPOSSIBLE");
			}
		}
		return primary;
	},

	filter: function (baseExpression) {
		var args = [baseExpression];
		var result = {
			type: AST.CallExpression,
			callee: this.identifier(),
			arguments: args,
			filter: true,
		};

		while (this.expect(":")) {
			args.push(this.expression());
		}

		return result;
	},

	parseArguments: function () {
		var args = [];
		if (this.peekToken().text !== ")") {
			do {
				args.push(this.filterChain());
			} while (this.expect(","));
		}
		return args;
	},

	identifier: function () {
		var token = this.consume();
		if (!token.identifier) {
			this.throwError("is not a valid identifier", token);
		}
		return { type: AST.Identifier, name: token.text };
	},

	constant: function () {
		// TODO check that it is a constant
		return { type: AST.Literal, value: this.consume().value };
	},

	arrayDeclaration: function () {
		var elements = [];
		if (this.peekToken().text !== "]") {
			do {
				if (this.peek("]")) {
					// Support trailing commas per ES5.1.
					break;
				}
				elements.push(this.expression());
			} while (this.expect(","));
		}
		this.consume("]");

		return { type: AST.ArrayExpression, elements: elements };
	},

	object: function () {
		var properties = [],
			property;
		if (this.peekToken().text !== "}") {
			do {
				if (this.peek("}")) {
					// Support trailing commas per ES5.1.
					break;
				}
				property = { type: AST.Property, kind: "init" };
				if (this.peek().constant) {
					property.key = this.constant();
					property.computed = false;
					this.consume(":");
					property.value = this.expression();
				} else if (this.peek().identifier) {
					property.key = this.identifier();
					property.computed = false;
					if (this.peek(":")) {
						this.consume(":");
						property.value = this.expression();
					} else {
						property.value = property.key;
					}
				} else if (this.peek("[")) {
					this.consume("[");
					property.key = this.expression();
					this.consume("]");
					property.computed = true;
					this.consume(":");
					property.value = this.expression();
				} else {
					this.throwError("invalid key", this.peek());
				}
				properties.push(property);
			} while (this.expect(","));
		}
		this.consume("}");

		return { type: AST.ObjectExpression, properties: properties };
	},

	throwError: function (msg, token) {
		throw $parseMinErr(
			"syntax",
			"Syntax Error: Token '{0}' {1} at column {2} of the expression [{3}] starting at [{4}].",
			token.text,
			msg,
			token.index + 1,
			this.text,
			this.text.substring(token.index)
		);
	},

	consume: function (e1) {
		if (this.tokens.length === 0) {
			throw $parseMinErr(
				"ueoe",
				"Unexpected end of expression: {0}",
				this.text
			);
		}

		var token = this.expect(e1);
		if (!token) {
			this.throwError("is unexpected, expecting [" + e1 + "]", this.peek());
		}
		return token;
	},

	peekToken: function () {
		if (this.tokens.length === 0) {
			throw $parseMinErr(
				"ueoe",
				"Unexpected end of expression: {0}",
				this.text
			);
		}
		return this.tokens[0];
	},

	peek: function (e1, e2, e3, e4) {
		return this.peekAhead(0, e1, e2, e3, e4);
	},

	peekAhead: function (i, e1, e2, e3, e4) {
		if (this.tokens.length > i) {
			var token = this.tokens[i];
			var t = token.text;
			if (
				t === e1 ||
				t === e2 ||
				t === e3 ||
				t === e4 ||
				(!e1 && !e2 && !e3 && !e4)
			) {
				return token;
			}
		}
		return false;
	},

	expect: function (e1, e2, e3, e4) {
		var token = this.peek(e1, e2, e3, e4);
		if (token) {
			this.tokens.shift();
			return token;
		}
		return false;
	},
};

function ifDefined(v, d) {
	return typeof v !== "undefined" ? v : d;
}

function plusFn(l, r) {
	if (typeof l === "undefined") {
		return r;
	}
	if (typeof r === "undefined") {
		return l;
	}
	return l + r;
}

function isStateless($filter, filterName) {
	var fn = $filter(filterName);
	if (!fn) {
		throw new Error("Filter '" + filterName + "' is not defined");
	}
	return !fn.$stateful;
}

function findConstantAndWatchExpressions(ast, $filter) {
	var allConstants;
	var argsToWatch;
	var isStatelessFilter;
	switch (ast.type) {
		case AST.Program:
			allConstants = true;
			forEach(ast.body, function (expr) {
				findConstantAndWatchExpressions(expr.expression, $filter);
				allConstants = allConstants && expr.expression.constant;
			});
			ast.constant = allConstants;
			break;
		case AST.Literal:
			ast.constant = true;
			ast.toWatch = [];
			break;
		case AST.UnaryExpression:
			findConstantAndWatchExpressions(ast.argument, $filter);
			ast.constant = ast.argument.constant;
			ast.toWatch = ast.argument.toWatch;
			break;
		case AST.BinaryExpression:
			findConstantAndWatchExpressions(ast.left, $filter);
			findConstantAndWatchExpressions(ast.right, $filter);
			ast.constant = ast.left.constant && ast.right.constant;
			ast.toWatch = ast.left.toWatch.concat(ast.right.toWatch);
			break;
		case AST.LogicalExpression:
			findConstantAndWatchExpressions(ast.left, $filter);
			findConstantAndWatchExpressions(ast.right, $filter);
			ast.constant = ast.left.constant && ast.right.constant;
			ast.toWatch = ast.constant ? [] : [ast];
			break;
		case AST.ConditionalExpression:
			findConstantAndWatchExpressions(ast.test, $filter);
			findConstantAndWatchExpressions(ast.alternate, $filter);
			findConstantAndWatchExpressions(ast.consequent, $filter);
			ast.constant =
				ast.test.constant && ast.alternate.constant && ast.consequent.constant;
			ast.toWatch = ast.constant ? [] : [ast];
			break;
		case AST.Identifier:
			ast.constant = false;
			ast.toWatch = [ast];
			break;
		case AST.MemberExpression:
			findConstantAndWatchExpressions(ast.object, $filter);
			if (ast.computed) {
				findConstantAndWatchExpressions(ast.property, $filter);
			}
			ast.constant =
				ast.object.constant && (!ast.computed || ast.property.constant);
			ast.toWatch = [ast];
			break;
		case AST.CallExpression:
			isStatelessFilter = ast.filter
				? isStateless($filter, ast.callee.name)
				: false;
			allConstants = isStatelessFilter;
			argsToWatch = [];
			forEach(ast.arguments, function (expr) {
				findConstantAndWatchExpressions(expr, $filter);
				allConstants = allConstants && expr.constant;
				if (!expr.constant) {
					argsToWatch.push.apply(argsToWatch, expr.toWatch);
				}
			});
			ast.constant = allConstants;
			ast.toWatch = isStatelessFilter ? argsToWatch : [ast];
			break;
		case AST.AssignmentExpression:
			findConstantAndWatchExpressions(ast.left, $filter);
			findConstantAndWatchExpressions(ast.right, $filter);
			ast.constant = ast.left.constant && ast.right.constant;
			ast.toWatch = [ast];
			break;
		case AST.ArrayExpression:
			allConstants = true;
			argsToWatch = [];
			forEach(ast.elements, function (expr) {
				findConstantAndWatchExpressions(expr, $filter);
				allConstants = allConstants && expr.constant;
				if (!expr.constant) {
					argsToWatch.push.apply(argsToWatch, expr.toWatch);
				}
			});
			ast.constant = allConstants;
			ast.toWatch = argsToWatch;
			break;
		case AST.ObjectExpression:
			allConstants = true;
			argsToWatch = [];
			forEach(ast.properties, function (property) {
				findConstantAndWatchExpressions(property.value, $filter);
				allConstants =
					allConstants && property.value.constant && !property.computed;
				if (!property.value.constant) {
					argsToWatch.push.apply(argsToWatch, property.value.toWatch);
				}
			});
			ast.constant = allConstants;
			ast.toWatch = argsToWatch;
			break;
		case AST.ThisExpression:
			ast.constant = false;
			ast.toWatch = [];
			break;
		case AST.LocalsExpression:
			ast.constant = false;
			ast.toWatch = [];
			break;
	}
}

function getInputs(body) {
	if (body.length !== 1) {
		return;
	}
	var lastExpression = body[0].expression;
	var candidate = lastExpression.toWatch;
	if (candidate.length !== 1) {
		return candidate;
	}
	return candidate[0] !== lastExpression ? candidate : undefined;
}

function isAssignable(ast) {
	return ast.type === AST.Identifier || ast.type === AST.MemberExpression;
}

function assignableAST(ast) {
	if (ast.body.length === 1 && isAssignable(ast.body[0].expression)) {
		return {
			type: AST.AssignmentExpression,
			left: ast.body[0].expression,
			right: { type: AST.NGValueParameter },
			operator: "=",
		};
	}
}

function isLiteral(ast) {
	return (
		ast.body.length === 0 ||
		(ast.body.length === 1 &&
			(ast.body[0].expression.type === AST.Literal ||
				ast.body[0].expression.type === AST.ArrayExpression ||
				ast.body[0].expression.type === AST.ObjectExpression))
	);
}

function isConstant(ast) {
	return ast.constant;
}

function ASTCompiler(astBuilder, $filter) {
	this.astBuilder = astBuilder;
	this.$filter = $filter;
}

ASTCompiler.prototype = {
	compile: function (expression) {
		var self = this;
		var ast = this.astBuilder.ast(expression);
		this.state = {
			nextId: 0,
			filters: {},
			fn: { vars: [], body: [], own: {} },
			assign: { vars: [], body: [], own: {} },
			inputs: [],
		};
		findConstantAndWatchExpressions(ast, self.$filter);
		var extra = "";
		var assignable;
		this.stage = "assign";
		if ((assignable = assignableAST(ast))) {
			this.state.computing = "assign";
			var result = this.nextId();
			this.recurse(assignable, result);
			this.return_(result);
			extra = "fn.assign=" + this.generateFunction("assign", "s,v,l");
		}
		var toWatch = getInputs(ast.body);
		self.stage = "inputs";
		forEach(toWatch, function (watch, key) {
			var fnKey = "fn" + key;
			self.state[fnKey] = { vars: [], body: [], own: {} };
			self.state.computing = fnKey;
			var intoId = self.nextId();
			self.recurse(watch, intoId);
			self.return_(intoId);
			self.state.inputs.push(fnKey);
			watch.watchId = key;
		});
		this.state.computing = "fn";
		this.stage = "main";
		this.recurse(ast);
		var fnString =
			// The build and minification steps remove the string "use strict" from the code, but this is done using a regex.
			// This is a workaround for this until we do a better job at only removing the prefix only when we should.
			'"' +
			this.USE +
			" " +
			this.STRICT +
			'";\n' +
			this.filterPrefix() +
			"var fn=" +
			this.generateFunction("fn", "s,l,a,i") +
			extra +
			this.watchFns() +
			"return fn;";
		// eslint-disable-next-line no-new-func
		var fn = new Function(
			"$filter",
			"getStringValue",
			"ifDefined",
			"plus",
			fnString
		)(this.$filter, getStringValue, ifDefined, plusFn);

		this.state = this.stage = undefined;
		fn.ast = ast;
		fn.literal = isLiteral(ast);
		fn.constant = isConstant(ast);
		return fn;
	},

	USE: "use",

	STRICT: "strict",

	watchFns: function () {
		var result = [];
		var fns = this.state.inputs;
		var self = this;
		forEach(fns, function (name) {
			result.push("var " + name + "=" + self.generateFunction(name, "s"));
		});
		if (fns.length) {
			result.push("fn.inputs=[" + fns.join(",") + "];");
		}
		return result.join("");
	},

	generateFunction: function (name, params) {
		return (
			"function(" +
			params +
			"){" +
			this.varsPrefix(name) +
			this.body(name) +
			"};"
		);
	},

	filterPrefix: function () {
		var parts = [];
		var self = this;
		forEach(this.state.filters, function (id, filter) {
			parts.push(id + "=$filter(" + self.escape(filter) + ")");
		});
		if (parts.length) {
			return "var " + parts.join(",") + ";";
		}
		return "";
	},

	varsPrefix: function (section) {
		return this.state[section].vars.length
			? "var " + this.state[section].vars.join(",") + ";"
			: "";
	},

	body: function (section) {
		return this.state[section].body.join("");
	},

	recurse: function (
		ast,
		intoId,
		nameId,
		recursionFn,
		create,
		skipWatchIdCheck
	) {
		var left,
			right,
			self = this,
			args,
			expression,
			computed;
		recursionFn = recursionFn || noop;
		if (!skipWatchIdCheck && isDefined(ast.watchId)) {
			intoId = intoId || this.nextId();
			this.if_(
				"i",
				this.lazyAssign(intoId, this.unsafeComputedMember("i", ast.watchId)),
				this.lazyRecurse(ast, intoId, nameId, recursionFn, create, true)
			);
			return;
		}

		switch (ast.type) {
			case AST.Program:
				forEach(ast.body, function (expression, pos) {
					self.recurse(
						expression.expression,
						undefined,
						undefined,
						function (expr) {
							right = expr;
						}
					);
					if (pos !== ast.body.length - 1) {
						self.current().body.push(right, ";");
					} else {
						self.return_(right);
					}
				});
				break;
			case AST.Literal:
				expression = this.escape(ast.value);
				this.assign(intoId, expression);
				recursionFn(intoId || expression);
				break;
			case AST.UnaryExpression:
				this.recurse(ast.argument, undefined, undefined, function (expr) {
					right = expr;
				});
				expression = ast.operator + "(" + this.ifDefined(right, 0) + ")";
				this.assign(intoId, expression);
				recursionFn(expression);
				break;
			case AST.BinaryExpression:
				this.recurse(ast.left, undefined, undefined, function (expr) {
					left = expr;
				});
				this.recurse(ast.right, undefined, undefined, function (expr) {
					right = expr;
				});
				if (ast.operator === "+") {
					expression = this.plus(left, right);
				} else if (ast.operator === "-") {
					expression =
						this.ifDefined(left, 0) + ast.operator + this.ifDefined(right, 0);
				} else {
					expression = "(" + left + ")" + ast.operator + "(" + right + ")";
				}
				this.assign(intoId, expression);
				recursionFn(expression);
				break;
			case AST.LogicalExpression:
				intoId = intoId || this.nextId();
				self.recurse(ast.left, intoId);
				self.if_(
					ast.operator === "&&" ? intoId : self.not(intoId),
					self.lazyRecurse(ast.right, intoId)
				);
				recursionFn(intoId);
				break;
			case AST.ConditionalExpression:
				intoId = intoId || this.nextId();
				self.recurse(ast.test, intoId);
				self.if_(
					intoId,
					self.lazyRecurse(ast.alternate, intoId),
					self.lazyRecurse(ast.consequent, intoId)
				);
				recursionFn(intoId);
				break;
			case AST.Identifier:
				intoId = intoId || this.nextId();
				var inAssignment = self.current().inAssignment;
				if (nameId) {
					if (inAssignment) {
						nameId.context = this.assign(this.nextId(), "s");
					} else {
						nameId.context =
							self.stage === "inputs"
								? "s"
								: this.assign(
										this.nextId(),
										this.getHasOwnProperty("l", ast.name) + "?l:s"
									);
					}
					nameId.computed = false;
					nameId.name = ast.name;
				}
				self.if_(
					self.stage === "inputs" ||
						self.not(self.getHasOwnProperty("l", ast.name)),
					function () {
						self.if_(
							self.stage === "inputs" ||
								self.and_(
									"s",
									self.or_(
										self.isNull(self.nonComputedMember("s", ast.name)),
										self.hasOwnProperty_("s", ast.name)
									)
								),
							function () {
								if (create && create !== 1) {
									self.if_(
										self.isNull(self.nonComputedMember("s", ast.name)),
										self.lazyAssign(self.nonComputedMember("s", ast.name), "{}")
									);
								}
								self.assign(intoId, self.nonComputedMember("s", ast.name));
							}
						);
					},
					intoId &&
						self.lazyAssign(intoId, self.nonComputedMember("l", ast.name))
				);
				recursionFn(intoId);
				break;
			case AST.MemberExpression:
				left = (nameId && (nameId.context = this.nextId())) || this.nextId();
				intoId = intoId || this.nextId();
				self.recurse(
					ast.object,
					left,
					undefined,
					function () {
						var member = null;
						var inAssignment = self.current().inAssignment;
						if (ast.computed) {
							right = self.nextId();
							if (inAssignment || self.state.computing === "assign") {
								member = self.unsafeComputedMember(left, right);
							} else {
								member = self.computedMember(left, right);
							}
						} else {
							if (inAssignment || self.state.computing === "assign") {
								member = self.unsafeNonComputedMember(left, ast.property.name);
							} else {
								member = self.nonComputedMember(left, ast.property.name);
							}
							right = ast.property.name;
						}

						if (ast.computed) {
							if (ast.property.type === AST.Literal) {
								self.recurse(ast.property, right);
							}
						}
						self.if_(
							self.and_(
								self.notNull(left),
								self.or_(
									self.isNull(member),
									self.hasOwnProperty_(left, right, ast.computed)
								)
							),
							function () {
								if (ast.computed) {
									if (ast.property.type !== AST.Literal) {
										self.recurse(ast.property, right);
									}
									if (create && create !== 1) {
										self.if_(self.not(member), self.lazyAssign(member, "{}"));
									}
									self.assign(intoId, member);
									if (nameId) {
										nameId.computed = true;
										nameId.name = right;
									}
								} else {
									if (create && create !== 1) {
										self.if_(
											self.isNull(member),
											self.lazyAssign(member, "{}")
										);
									}
									self.assign(intoId, member);
									if (nameId) {
										nameId.computed = false;
										nameId.name = ast.property.name;
									}
								}
							},
							function () {
								self.assign(intoId, "undefined");
							}
						);
						recursionFn(intoId);
					},
					!!create
				);
				break;
			case AST.CallExpression:
				intoId = intoId || this.nextId();
				if (ast.filter) {
					right = self.filter(ast.callee.name);
					args = [];
					forEach(ast.arguments, function (expr) {
						var argument = self.nextId();
						self.recurse(expr, argument);
						args.push(argument);
					});
					expression = right + ".call(" + right + "," + args.join(",") + ")";
					self.assign(intoId, expression);
					recursionFn(intoId);
				} else {
					right = self.nextId();
					left = {};
					args = [];
					self.recurse(ast.callee, right, left, function () {
						self.if_(
							self.notNull(right),
							function () {
								forEach(ast.arguments, function (expr) {
									self.recurse(
										expr,
										ast.constant ? undefined : self.nextId(),
										undefined,
										function (argument) {
											args.push(argument);
										}
									);
								});
								if (left.name) {
									var x = self.member(left.context, left.name, left.computed);
									expression =
										"(" +
										x +
										" === null ? null : " +
										self.unsafeMember(left.context, left.name, left.computed) +
										".call(" +
										[left.context].concat(args).join(",") +
										"))";
								} else {
									expression = right + "(" + args.join(",") + ")";
								}
								self.assign(intoId, expression);
							},
							function () {
								self.assign(intoId, "undefined");
							}
						);
						recursionFn(intoId);
					});
				}
				break;
			case AST.AssignmentExpression:
				right = this.nextId();
				left = {};
				self.current().inAssignment = true;
				this.recurse(
					ast.left,
					undefined,
					left,
					function () {
						self.if_(
							self.and_(
								self.notNull(left.context),
								self.or_(
									self.hasOwnProperty_(left.context, left.name),
									self.isNull(
										self.member(left.context, left.name, left.computed)
									)
								)
							),
							function () {
								self.recurse(ast.right, right);
								expression =
									self.member(left.context, left.name, left.computed) +
									ast.operator +
									right;
								self.assign(intoId, expression);
								recursionFn(intoId || expression);
							}
						);
						self.current().inAssignment = false;
						self.recurse(ast.right, right);
						self.current().inAssignment = true;
					},
					1
				);
				self.current().inAssignment = false;
				break;
			case AST.ArrayExpression:
				args = [];
				forEach(ast.elements, function (expr) {
					self.recurse(
						expr,
						ast.constant ? undefined : self.nextId(),
						undefined,
						function (argument) {
							args.push(argument);
						}
					);
				});
				expression = "[" + args.join(",") + "]";
				this.assign(intoId, expression);
				recursionFn(intoId || expression);
				break;
			case AST.ObjectExpression:
				args = [];
				computed = false;
				forEach(ast.properties, function (property) {
					if (property.computed) {
						computed = true;
					}
				});
				if (computed) {
					intoId = intoId || this.nextId();
					this.assign(intoId, "{}");
					forEach(ast.properties, function (property) {
						if (property.computed) {
							left = self.nextId();
							self.recurse(property.key, left);
						} else {
							left =
								property.key.type === AST.Identifier
									? property.key.name
									: "" + property.key.value;
						}
						right = self.nextId();
						self.recurse(property.value, right);
						self.assign(
							self.unsafeMember(intoId, left, property.computed),
							right
						);
					});
				} else {
					forEach(ast.properties, function (property) {
						self.recurse(
							property.value,
							ast.constant ? undefined : self.nextId(),
							undefined,
							function (expr) {
								args.push(
									self.escape(
										property.key.type === AST.Identifier
											? property.key.name
											: "" + property.key.value
									) +
										":" +
										expr
								);
							}
						);
					});
					expression = "{" + args.join(",") + "}";
					this.assign(intoId, expression);
				}
				recursionFn(intoId || expression);
				break;
			case AST.ThisExpression:
				this.assign(intoId, "s");
				recursionFn(intoId || "s");
				break;
			case AST.LocalsExpression:
				this.assign(intoId, "l");
				recursionFn(intoId || "l");
				break;
			case AST.NGValueParameter:
				this.assign(intoId, "v");
				recursionFn(intoId || "v");
				break;
		}
	},

	getHasOwnProperty: function (element, property) {
		var key = element + "." + property;
		var own = this.current().own;
		if (!own.hasOwnProperty(key)) {
			own[key] = this.nextId(
				false,
				element + "&&(" + this.escape(property) + " in " + element + ")"
			);
		}
		return own[key];
	},

	assign: function (id, value) {
		if (!id) {
			return;
		}
		this.current().body.push(id, "=", value, ";");
		return id;
	},

	filter: function (filterName) {
		if (!this.state.filters.hasOwnProperty(filterName)) {
			this.state.filters[filterName] = this.nextId(true);
		}
		return this.state.filters[filterName];
	},

	ifDefined: function (id, defaultValue) {
		return "ifDefined(" + id + "," + this.escape(defaultValue) + ")";
	},

	plus: function (left, right) {
		return "plus(" + left + "," + right + ")";
	},

	return_: function (id) {
		this.current().body.push("return ", id, ";");
	},

	if_: function (test, alternate, consequent) {
		if (test === true) {
			alternate();
		} else {
			var body = this.current().body;
			body.push("if(", test, "){");
			alternate();
			body.push("}");
			if (consequent) {
				body.push("else{");
				consequent();
				body.push("}");
			}
		}
	},
	or_: function (expr1, expr2) {
		return "(" + expr1 + ") || (" + expr2 + ")";
	},
	hasOwnProperty_: function (obj, prop, computed) {
		if (computed) {
			return "(Object.prototype.hasOwnProperty.call(" + obj + "," + prop + "))";
		}
		return "(Object.prototype.hasOwnProperty.call(" + obj + ",'" + prop + "'))";
	},
	and_: function (expr1, expr2) {
		return "(" + expr1 + ") && (" + expr2 + ")";
	},
	not: function (expression) {
		return "!(" + expression + ")";
	},

	isNull: function (expression) {
		return expression + "==null";
	},

	notNull: function (expression) {
		return expression + "!=null";
	},

	nonComputedMember: function (left, right) {
		var SAFE_IDENTIFIER = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/;
		var UNSAFE_CHARACTERS = /[^$_a-zA-Z0-9]/g;
		var expr = "";
		if (SAFE_IDENTIFIER.test(right)) {
			expr = left + "." + right;
		} else {
			right = right.replace(UNSAFE_CHARACTERS, this.stringEscapeFn);
			expr = left + '["' + right + '"]';
		}

		return expr;
	},

	unsafeComputedMember: function (left, right) {
		return left + "[" + right + "]";
	},
	unsafeNonComputedMember: function (left, right) {
		return this.nonComputedMember(left, right);
	},

	computedMember: function (left, right) {
		if (this.state.computing === "assign") {
			return this.unsafeComputedMember(left, right);
		}
		// return left + "[" + right + "]";
		return (
			"(" +
			left +
			".hasOwnProperty(" +
			right +
			") ? " +
			left +
			"[" +
			right +
			"] : null)"
		);
	},

	unsafeMember: function (left, right, computed) {
		if (computed) {
			return this.unsafeComputedMember(left, right);
		}
		return this.unsafeNonComputedMember(left, right);
	},

	member: function (left, right, computed) {
		if (computed) {
			return this.computedMember(left, right);
		}
		return this.nonComputedMember(left, right);
	},

	getStringValue: function (item) {
		this.assign(item, "getStringValue(" + item + ")");
	},

	lazyRecurse: function (
		ast,
		intoId,
		nameId,
		recursionFn,
		create,
		skipWatchIdCheck
	) {
		var self = this;
		return function () {
			self.recurse(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck);
		};
	},

	lazyAssign: function (id, value) {
		var self = this;
		return function () {
			self.assign(id, value);
		};
	},

	stringEscapeRegex: /[^ a-zA-Z0-9]/g,

	stringEscapeFn: function (c) {
		return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
	},

	escape: function (value) {
		if (isString(value)) {
			return (
				"'" + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + "'"
			);
		}
		if (isNumber(value)) {
			return value.toString();
		}
		if (value === true) {
			return "true";
		}
		if (value === false) {
			return "false";
		}
		if (value === null) {
			return "null";
		}
		if (typeof value === "undefined") {
			return "undefined";
		}

		throw $parseMinErr("esc", "IMPOSSIBLE");
	},

	nextId: function (skip, init) {
		var id = "v" + this.state.nextId++;
		if (!skip) {
			this.current().vars.push(id + (init ? "=" + init : ""));
		}
		return id;
	},

	current: function () {
		return this.state[this.state.computing];
	},
};

function ASTInterpreter(astBuilder, $filter) {
	this.astBuilder = astBuilder;
	this.$filter = $filter;
}

ASTInterpreter.prototype = {
	compile: function (expression) {
		var self = this;
		var ast = this.astBuilder.ast(expression);
		findConstantAndWatchExpressions(ast, self.$filter);
		var assignable;
		var assign;
		if ((assignable = assignableAST(ast))) {
			assign = this.recurse(assignable);
		}
		var toWatch = getInputs(ast.body);
		var inputs;
		if (toWatch) {
			inputs = [];
			forEach(toWatch, function (watch, key) {
				var input = self.recurse(watch);
				watch.input = input;
				inputs.push(input);
				watch.watchId = key;
			});
		}
		var expressions = [];
		forEach(ast.body, function (expression) {
			expressions.push(self.recurse(expression.expression));
		});
		var fn =
			ast.body.length === 0
				? noop
				: ast.body.length === 1
					? expressions[0]
					: function (scope, locals) {
							var lastValue;
							forEach(expressions, function (exp) {
								lastValue = exp(scope, locals);
							});
							return lastValue;
						};

		if (assign) {
			fn.assign = function (scope, value, locals) {
				return assign(scope, locals, value);
			};
		}
		if (inputs) {
			fn.inputs = inputs;
		}
		fn.ast = ast;
		fn.literal = isLiteral(ast);
		fn.constant = isConstant(ast);
		return fn;
	},

	recurse: function (ast, context, create) {
		var left,
			right,
			self = this,
			args;
		if (ast.input) {
			return this.inputs(ast.input, ast.watchId);
		}
		switch (ast.type) {
			case AST.Literal:
				return this.value(ast.value, context);
			case AST.UnaryExpression:
				right = this.recurse(ast.argument);
				return this["unary" + ast.operator](right, context);
			case AST.BinaryExpression:
				left = this.recurse(ast.left);
				right = this.recurse(ast.right);
				return this["binary" + ast.operator](left, right, context);
			case AST.LogicalExpression:
				left = this.recurse(ast.left);
				right = this.recurse(ast.right);
				return this["binary" + ast.operator](left, right, context);
			case AST.ConditionalExpression:
				return this["ternary?:"](
					this.recurse(ast.test),
					this.recurse(ast.alternate),
					this.recurse(ast.consequent),
					context
				);
			case AST.Identifier:
				return self.identifier(ast.name, context, create);
			case AST.MemberExpression:
				left = this.recurse(ast.object, false, !!create);
				if (!ast.computed) {
					right = ast.property.name;
				}
				if (ast.computed) {
					right = this.recurse(ast.property);
				}

				return ast.computed
					? this.computedMember(left, right, context, create)
					: this.nonComputedMember(left, right, context, create);
			case AST.CallExpression:
				args = [];
				forEach(ast.arguments, function (expr) {
					args.push(self.recurse(expr));
				});
				if (ast.filter) {
					right = this.$filter(ast.callee.name);
				}
				if (!ast.filter) {
					right = this.recurse(ast.callee, true);
				}
				return ast.filter
					? function (scope, locals, assign, inputs) {
							var values = [];
							for (var i = 0; i < args.length; ++i) {
								values.push(args[i](scope, locals, assign, inputs));
							}
							var value = right.apply(undefined, values, inputs);
							return context
								? { context: undefined, name: undefined, value: value }
								: value;
						}
					: function (scope, locals, assign, inputs) {
							var rhs = right(scope, locals, assign, inputs);
							var value;
							if (rhs.value != null) {
								var values = [];
								for (var i = 0; i < args.length; ++i) {
									values.push(args[i](scope, locals, assign, inputs));
								}
								value = rhs.value.apply(rhs.context, values);
							}
							return context ? { value: value } : value;
						};
			case AST.AssignmentExpression:
				left = this.recurse(ast.left, true, 1);
				right = this.recurse(ast.right);
				return function (scope, locals, assign, inputs) {
					var lhs = left(scope, false, assign, inputs);
					var rhs = right(scope, locals, assign, inputs);
					lhs.context[lhs.name] = rhs;
					return context ? { value: rhs } : rhs;
				};
			case AST.ArrayExpression:
				args = [];
				forEach(ast.elements, function (expr) {
					args.push(self.recurse(expr));
				});
				return function (scope, locals, assign, inputs) {
					var value = [];
					for (var i = 0; i < args.length; ++i) {
						value.push(args[i](scope, locals, assign, inputs));
					}
					return context ? { value: value } : value;
				};
			case AST.ObjectExpression:
				args = [];
				forEach(ast.properties, function (property) {
					if (property.computed) {
						args.push({
							key: self.recurse(property.key),
							computed: true,
							value: self.recurse(property.value),
						});
					} else {
						args.push({
							key:
								property.key.type === AST.Identifier
									? property.key.name
									: "" + property.key.value,
							computed: false,
							value: self.recurse(property.value),
						});
					}
				});
				return function (scope, locals, assign, inputs) {
					var value = {};
					for (var i = 0; i < args.length; ++i) {
						if (args[i].computed) {
							value[args[i].key(scope, locals, assign, inputs)] = args[i].value(
								scope,
								locals,
								assign,
								inputs
							);
						} else {
							value[args[i].key] = args[i].value(scope, locals, assign, inputs);
						}
					}
					return context ? { value: value } : value;
				};
			case AST.ThisExpression:
				return function (scope) {
					return context ? { value: scope } : scope;
				};
			case AST.LocalsExpression:
				return function (scope, locals) {
					return context ? { value: locals } : locals;
				};
			case AST.NGValueParameter:
				return function (scope, locals, assign) {
					return context ? { value: assign } : assign;
				};
		}
	},

	"unary+": function (argument, context) {
		return function (scope, locals, assign, inputs) {
			var arg = argument(scope, locals, assign, inputs);
			if (isDefined(arg)) {
				arg = +arg;
			} else {
				arg = 0;
			}
			return context ? { value: arg } : arg;
		};
	},
	"unary-": function (argument, context) {
		return function (scope, locals, assign, inputs) {
			var arg = argument(scope, locals, assign, inputs);
			if (isDefined(arg)) {
				arg = -arg;
			} else {
				arg = -0;
			}
			return context ? { value: arg } : arg;
		};
	},
	"unary!": function (argument, context) {
		return function (scope, locals, assign, inputs) {
			var arg = !argument(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary+": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var lhs = left(scope, locals, assign, inputs);
			var rhs = right(scope, locals, assign, inputs);
			var arg = plusFn(lhs, rhs);
			return context ? { value: arg } : arg;
		};
	},
	"binary-": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var lhs = left(scope, locals, assign, inputs);
			var rhs = right(scope, locals, assign, inputs);
			var arg = (isDefined(lhs) ? lhs : 0) - (isDefined(rhs) ? rhs : 0);
			return context ? { value: arg } : arg;
		};
	},
	"binary*": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) *
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary/": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) /
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary%": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) %
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary===": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) ===
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary!==": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) !==
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary==": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) ==
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary!=": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) !=
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary<": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) <
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary>": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) >
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary<=": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) <=
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary>=": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) >=
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary&&": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) &&
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"binary||": function (left, right, context) {
		return function (scope, locals, assign, inputs) {
			var arg =
				left(scope, locals, assign, inputs) ||
				right(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	"ternary?:": function (test, alternate, consequent, context) {
		return function (scope, locals, assign, inputs) {
			var arg = test(scope, locals, assign, inputs)
				? alternate(scope, locals, assign, inputs)
				: consequent(scope, locals, assign, inputs);
			return context ? { value: arg } : arg;
		};
	},
	value: function (value, context) {
		return function () {
			return context
				? { context: undefined, name: undefined, value: value }
				: value;
		};
	},
	identifier: function (name, context, create) {
		return function (scope, locals) {
			var base = locals && name in locals ? locals : scope;
			if (create && create !== 1 && base && base[name] == null) {
				base[name] = {};
			}
			var value = base ? base[name] : undefined;
			if (context) {
				return { context: base, name: name, value: value };
			}
			return value;
		};
	},
	computedMember: function (left, right, context, create) {
		return function (scope, locals, assign, inputs) {
			var lhs = left(scope, locals, assign, inputs);
			var rhs;
			var value;
			if (lhs != null) {
				rhs = right(scope, locals, assign, inputs);
				rhs = getStringValue(rhs);
				if (create && create !== 1) {
					if (lhs && !lhs[rhs]) {
						lhs[rhs] = {};
					}
				}
				if (Object.prototype.hasOwnProperty.call(lhs, rhs)) {
					value = lhs[rhs];
				}
			}
			if (context) {
				return { context: lhs, name: rhs, value: value };
			}
			return value;
		};
	},
	nonComputedMember: function (left, right, context, create) {
		return function (scope, locals, assign, inputs) {
			var lhs = left(scope, locals, assign, inputs);
			if (create && create !== 1) {
				if (lhs && lhs[right] == null) {
					lhs[right] = {};
				}
			}
			var value = undefined;
			if (lhs != null && Object.prototype.hasOwnProperty.call(lhs, right)) {
				value = lhs[right];
			}

			if (context) {
				return { context: lhs, name: right, value: value };
			}
			return value;
		};
	},
	inputs: function (input, watchId) {
		return function (scope, value, locals, inputs) {
			if (inputs) {
				return inputs[watchId];
			}
			return input(scope, value, locals);
		};
	},
};

/**
 * @constructor
 */
var Parser = function Parser(lexer, $filter, options) {
	this.lexer = lexer;
	this.$filter = $filter;
	options = options || {};
	options.handleThis = options.handleThis != null ? options.handleThis : true;
	this.options = options;
	this.ast = new AST(lexer, options);
	this.ast.selfReferential = {
		$locals: { type: AST.LocalsExpression },
	};
	if (options.handleThis) {
		this.ast.selfReferential.this = { type: AST.ThisExpression };
	}
	this.astCompiler = options.csp
		? new ASTInterpreter(this.ast, $filter)
		: new ASTCompiler(this.ast, $filter);
};

Parser.prototype = {
	constructor: Parser,

	parse: function (text) {
		return this.astCompiler.compile(text);
	},
};

var parse = {
  Lexer: Lexer,
  Parser: Parser
}

/* node_module/angular-expressions/lib/main.js */
var filters = {};
var Lexer = parse.Lexer;
var Parser = parse.Parser;

function addOptionDefaults(options) {
	options = options || {};
	if (options.filters) {
		options.cache = options.cache || {};
	}
	options.cache = options.cache || compile.cache;
	options.filters = options.filters || filters;
	return options;
}

function getParserOptions(options) {
	return {
		handleThis: options.handleThis != null ? options.handleThis : true,
		csp: options.csp != null ? options.csp : false, // noUnsafeEval,
		literals:
			options.literals != null
				? options.literals
				: {
						// defined at: function $ParseProvider() {
						true: true,
						false: false,
						null: null,
						/*eslint no-undefined: 0*/
						undefined: undefined,
						/* eslint: no-undefined: 1  */
					},
	};
}

/**
 * Compiles src and returns a function that executes src on a target object.
 * To speed up further calls the compiled function is cached under compile.cache[src] if options.filters is not present.
 *
 * @param {string} src
 * @param {object | undefined} options
 * @returns {function}
 */
function compile(src, options) {
	if (typeof src !== "string") {
		throw new TypeError(
			"src must be a string, instead saw '" + typeof src + "'"
		);
	}
	options = addOptionDefaults(options);
	var lexerOptions = options;
	var parserOptions = getParserOptions(options);

	var lexer = new Lexer(lexerOptions);
	var parser = new Parser(
		lexer,
		function getFilter(name) {
			return options.filters[name];
		},
		parserOptions
	);

	if (!options.cache) {
		return parser.parse(src);
	}
	delete options.src;
	var cacheKey = JSON.stringify(Object.assign({ src: src }, options));

	var cached = options.cache[cacheKey];
	if (!cached) {
		cached = options.cache[cacheKey] = parser.parse(src);
	}
	return cached;
}

/**
 * A cache containing all compiled functions. The src is used as key.
 * Set this on false to disable the cache.
 *
 * @type {object}
 */
compile.cache = Object.create(null);

exports.Lexer = Lexer;
exports.Parser = Parser;
exports.compile = compile;
exports.filters = filters;

/* node_modules/angular-expressions/lib/parse.js */

/**
 * @constructor
 */
function Lexer(options) {
	this.options = options || {};
}

Lexer.prototype = {
	constructor: Lexer,

	lex: function (text) {
		this.text = text;
		this.index = 0;
		this.tokens = [];

		while (this.index < this.text.length) {
			var ch = this.text.charAt(this.index);
			if (ch === '"' || ch === "'" || ch === "`") {
				this.readString(ch);
			} else if (
				this.isNumber(ch) ||
				(ch === "." && this.isNumber(this.peek()))
			) {
				this.readNumber();
			} else if (this.isIdentifierStart(this.peekMultichar())) {
				this.readIdent();
			} else if (this.is(ch, "(){}[].,;:?")) {
				this.tokens.push({ index: this.index, text: ch });
				this.index++;
			} else if (this.isWhitespace(ch)) {
				this.index++;
			} else {
				var ch2 = ch + this.peek();
				var ch3 = ch2 + this.peek(2);
				var op1 = OPERATORS[ch];
				var op2 = OPERATORS[ch2];
				var op3 = OPERATORS[ch3];
				if (op1 || op2 || op3) {
					var token = op3 ? ch3 : op2 ? ch2 : ch;
					this.tokens.push({ index: this.index, text: token, operator: true });
					this.index += token.length;
				} else {
					this.throwError(
						"Unexpected next character ",
						this.index,
						this.index + 1
					);
				}
			}
		}
		return this.tokens;
	},

	is: function (ch, chars) {
		return chars.indexOf(ch) !== -1;
	},

	peek: function (i) {
		var num = i || 1;
		return this.index + num < this.text.length
			? this.text.charAt(this.index + num)
			: false;
	},

	isNumber: function (ch) {
		return ch >= "0" && ch <= "9" && typeof ch === "string";
	},

	isWhitespace: function (ch) {
		// IE treats non-breaking space as \u00A0
		return (
			ch === " " ||
			ch === "\r" ||
			ch === "\t" ||
			ch === "\n" ||
			ch === "\v" ||
			ch === "\u00A0"
		);
	},

	isIdentifierStart: function (ch) {
		return this.options.isIdentifierStart
			? this.options.isIdentifierStart(ch, this.codePointAt(ch))
			: this.isValidIdentifierStart(ch);
	},

	isValidIdentifierStart: function (ch) {
		return (
			(ch >= "a" && ch <= "z") ||
			(ch >= "A" && ch <= "Z") ||
			ch === "_" ||
			ch === "$"
		);
	},

	isIdentifierContinue: function (ch) {
		return this.options.isIdentifierContinue
			? this.options.isIdentifierContinue(ch, this.codePointAt(ch))
			: this.isValidIdentifierContinue(ch);
	},

	isValidIdentifierContinue: function (ch, cp) {
		return this.isValidIdentifierStart(ch, cp) || this.isNumber(ch);
	},

	codePointAt: function (ch) {
		if (ch.length === 1) {
			return ch.charCodeAt(0);
		}

		return (ch.charCodeAt(0) << 10) + ch.charCodeAt(1) - 0x35fdc00;
	},

	peekMultichar: function () {
		var ch = this.text.charAt(this.index);
		var peek = this.peek();
		if (!peek) {
			return ch;
		}
		var cp1 = ch.charCodeAt(0);
		var cp2 = peek.charCodeAt(0);
		if (cp1 >= 0xd800 && cp1 <= 0xdbff && cp2 >= 0xdc00 && cp2 <= 0xdfff) {
			return ch + peek;
		}
		return ch;
	},

	isExpOperator: function (ch) {
		return ch === "-" || ch === "+" || this.isNumber(ch);
	},

	throwError: function (error, start, end) {
		end = end || this.index;
		var colStr = isDefined(start)
			? "s " +
				start +
				"-" +
				this.index +
				" [" +
				this.text.substring(start, end) +
				"]"
			: " " + end;
		throw $parseMinErr(
			"lexerr",
			"Lexer Error: {0} at column{1} in expression [{2}].",
			error,
			colStr,
			this.text
		);
	},

	readNumber: function () {
		var number = "";
		var start = this.index;
		while (this.index < this.text.length) {
			var ch = lowercase(this.text.charAt(this.index));
			if (ch === "." || this.isNumber(ch)) {
				number += ch;
			} else {
				var peekCh = this.peek();
				if (ch === "e" && this.isExpOperator(peekCh)) {
					number += ch;
				} else if (
					this.isExpOperator(ch) &&
					peekCh &&
					this.isNumber(peekCh) &&
					number.charAt(number.length - 1) === "e"
				) {
					number += ch;
				} else if (
					this.isExpOperator(ch) &&
					(!peekCh || !this.isNumber(peekCh)) &&
					number.charAt(number.length - 1) === "e"
				) {
					this.throwError("Invalid exponent");
				} else {
					break;
				}
			}
			this.index++;
		}
		this.tokens.push({
			index: start,
			text: number,
			constant: true,
			value: Number(number),
		});
	},

	readIdent: function () {
		var start = this.index;
		this.index += this.peekMultichar().length;
		while (this.index < this.text.length) {
			var ch = this.peekMultichar();
			if (!this.isIdentifierContinue(ch)) {
				break;
			}
			this.index += ch.length;
		}
		this.tokens.push({
			index: start,
			text: this.text.slice(start, this.index),
			identifier: true,
		});
	},

	readString: function (quote) {
		// quote will be ', " or `
		var start = this.index;
		this.index++;
		var string = "";
		var rawString = quote;
		var isTemplateLiteral = quote === "`";
		var escape = false;
		while (this.index < this.text.length) {
			var ch = this.text.charAt(this.index);
			if (
				isTemplateLiteral &&
				ch === "$" &&
				this.text.charAt(this.index + 1) === "{"
			) {
				this.tokens.push({
					index: start,
					text: rawString,
					constant: true,
					value: string,
				});
				var inside = this.text.indexOf("}", this.index);
				var myVariable = this.text.substr(
					this.index + 2,
					inside - this.index - 2
				);
				this.tokens.push({ index: this.index, text: "+", operator: true });
				var lexed = new Lexer(this.options).lex(myVariable);
				for (var i = 0, len = lexed.length; i < len; i++) {
					this.tokens.push(lexed[i]);
				}
				this.tokens.push({ index: this.index, text: "+", operator: true });
				this.index = inside;
				this.readString("`");
				return;
			}
			rawString += ch;
			if (escape) {
				if (ch === "u") {
					var hex = this.text.substring(this.index + 1, this.index + 5);
					if (!hex.match(/[\da-f]{4}/i)) {
						this.throwError("Invalid unicode escape [\\u" + hex + "]");
					}
					this.index += 4;
					string += String.fromCharCode(parseInt(hex, 16));
				} else {
					var rep = ESCAPE[ch];
					string = string + (rep || ch);
				}
				escape = false;
			} else if (ch === "\\") {
				escape = true;
			} else if (ch === quote) {
				// Matching closing quote
				this.index++;
				this.tokens.push({
					index: start,
					text: rawString,
					constant: true,
					value: string,
				});
				return;
			} else {
				string += ch;
			}
			this.index++;
		}
		this.throwError("Unterminated quote", start);
	},
};

function ASTCompiler(astBuilder, $filter) {
	this.astBuilder = astBuilder;
	this.$filter = $filter;
}

ASTCompiler.prototype = {
	compile: function (expression) {
		var self = this;
		var ast = this.astBuilder.ast(expression);
		this.state = {
			nextId: 0,
			filters: {},
			fn: { vars: [], body: [], own: {} },
			assign: { vars: [], body: [], own: {} },
			inputs: [],
		};
		findConstantAndWatchExpressions(ast, self.$filter);
		var extra = "";
		var assignable;
		this.stage = "assign";
		if ((assignable = assignableAST(ast))) {
			this.state.computing = "assign";
			var result = this.nextId();
			this.recurse(assignable, result);
			this.return_(result);
			extra = "fn.assign=" + this.generateFunction("assign", "s,v,l");
		}
		var toWatch = getInputs(ast.body);
		self.stage = "inputs";
		forEach(toWatch, function (watch, key) {
			var fnKey = "fn" + key;
			self.state[fnKey] = { vars: [], body: [], own: {} };
			self.state.computing = fnKey;
			var intoId = self.nextId();
			self.recurse(watch, intoId);
			self.return_(intoId);
			self.state.inputs.push(fnKey);
			watch.watchId = key;
		});
		this.state.computing = "fn";
		this.stage = "main";
		this.recurse(ast);
		var fnString =
			// The build and minification steps remove the string "use strict" from the code, but this is done using a regex.
			// This is a workaround for this until we do a better job at only removing the prefix only when we should.
			'"' +
			this.USE +
			" " +
			this.STRICT +
			'";\n' +
			this.filterPrefix() +
			"var fn=" +
			this.generateFunction("fn", "s,l,a,i") +
			extra +
			this.watchFns() +
			"return fn;";
    /* Vulnerability is manifested around here: */
    // console.log(fnString);
		// eslint-disable-next-line no-new-func
		var fn = new Function(
			"$filter",
			"getStringValue",
			"ifDefined",
			"plus",
			fnString
		)(this.$filter, getStringValue, ifDefined, plusFn);

		this.state = this.stage = undefined;
		fn.ast = ast;
		fn.literal = isLiteral(ast);
		fn.constant = isConstant(ast);
		return fn;
	},

	USE: "use",

	STRICT: "strict",

	watchFns: function () {
		var result = [];
		var fns = this.state.inputs;
		var self = this;
		forEach(fns, function (name) {
			result.push("var " + name + "=" + self.generateFunction(name, "s"));
		});
		if (fns.length) {
			result.push("fn.inputs=[" + fns.join(",") + "];");
		}
		return result.join("");
	},

	generateFunction: function (name, params) {
		return (
			"function(" +
			params +
			"){" +
			this.varsPrefix(name) +
			this.body(name) +
			"};"
		);
	},

	filterPrefix: function () {
		var parts = [];
		var self = this;
		forEach(this.state.filters, function (id, filter) {
			parts.push(id + "=$filter(" + self.escape(filter) + ")");
		});
		if (parts.length) {
			return "var " + parts.join(",") + ";";
		}
		return "";
	},

	varsPrefix: function (section) {
		return this.state[section].vars.length
			? "var " + this.state[section].vars.join(",") + ";"
			: "";
	},

	body: function (section) {
		return this.state[section].body.join("");
	},

	recurse: function (
		ast,
		intoId,
		nameId,
		recursionFn,
		create,
		skipWatchIdCheck
	) {
		var left,
			right,
			self = this,
			args,
			expression,
			computed;
		recursionFn = recursionFn || noop;
		if (!skipWatchIdCheck && isDefined(ast.watchId)) {
			intoId = intoId || this.nextId();
			this.if_(
				"i",
				this.lazyAssign(intoId, this.unsafeComputedMember("i", ast.watchId)),
				this.lazyRecurse(ast, intoId, nameId, recursionFn, create, true)
			);
			return;
		}

		switch (ast.type) {
			case AST.Program:
				forEach(ast.body, function (expression, pos) {
					self.recurse(
						expression.expression,
						undefined,
						undefined,
						function (expr) {
							right = expr;
						}
					);
					if (pos !== ast.body.length - 1) {
						self.current().body.push(right, ";");
					} else {
						self.return_(right);
					}
				});
				break;
			case AST.Literal:
				expression = this.escape(ast.value);
				this.assign(intoId, expression);
				recursionFn(intoId || expression);
				break;
			case AST.UnaryExpression:
				this.recurse(ast.argument, undefined, undefined, function (expr) {
					right = expr;
				});
				expression = ast.operator + "(" + this.ifDefined(right, 0) + ")";
				this.assign(intoId, expression);
				recursionFn(expression);
				break;
			case AST.BinaryExpression:
				this.recurse(ast.left, undefined, undefined, function (expr) {
					left = expr;
				});
				this.recurse(ast.right, undefined, undefined, function (expr) {
					right = expr;
				});
				if (ast.operator === "+") {
					expression = this.plus(left, right);
				} else if (ast.operator === "-") {
					expression =
						this.ifDefined(left, 0) + ast.operator + this.ifDefined(right, 0);
				} else {
					expression = "(" + left + ")" + ast.operator + "(" + right + ")";
				}
				this.assign(intoId, expression);
				recursionFn(expression);
				break;
			case AST.LogicalExpression:
				intoId = intoId || this.nextId();
				self.recurse(ast.left, intoId);
				self.if_(
					ast.operator === "&&" ? intoId : self.not(intoId),
					self.lazyRecurse(ast.right, intoId)
				);
				recursionFn(intoId);
				break;
			case AST.ConditionalExpression:
				intoId = intoId || this.nextId();
				self.recurse(ast.test, intoId);
				self.if_(
					intoId,
					self.lazyRecurse(ast.alternate, intoId),
					self.lazyRecurse(ast.consequent, intoId)
				);
				recursionFn(intoId);
				break;
			case AST.Identifier:
				intoId = intoId || this.nextId();
				var inAssignment = self.current().inAssignment;
				if (nameId) {
					if (inAssignment) {
						nameId.context = this.assign(this.nextId(), "s");
					} else {
						nameId.context =
							self.stage === "inputs"
								? "s"
								: this.assign(
										this.nextId(),
										this.getHasOwnProperty("l", ast.name) + "?l:s"
									);
					}
					nameId.computed = false;
					nameId.name = ast.name;
				}
				self.if_(
					self.stage === "inputs" ||
						self.not(self.getHasOwnProperty("l", ast.name)),
					function () {
						self.if_(
							self.stage === "inputs" ||
								self.and_(
									"s",
									self.or_(
										self.isNull(self.nonComputedMember("s", ast.name)),
										self.hasOwnProperty_("s", ast.name)
									)
								),
							function () {
								if (create && create !== 1) {
									self.if_(
										self.isNull(self.nonComputedMember("s", ast.name)),
										self.lazyAssign(self.nonComputedMember("s", ast.name), "{}")
									);
								}
								self.assign(intoId, self.nonComputedMember("s", ast.name));
							}
						);
					},
					intoId &&
						self.lazyAssign(intoId, self.nonComputedMember("l", ast.name))
				);
				recursionFn(intoId);
				break;
			case AST.MemberExpression:
				left = (nameId && (nameId.context = this.nextId())) || this.nextId();
				intoId = intoId || this.nextId();
				self.recurse(
					ast.object,
					left,
					undefined,
					function () {
						var member = null;
						var inAssignment = self.current().inAssignment;
						if (ast.computed) {
							right = self.nextId();
							if (inAssignment || self.state.computing === "assign") {
								member = self.unsafeComputedMember(left, right);
							} else {
								member = self.computedMember(left, right);
							}
						} else {
							if (inAssignment || self.state.computing === "assign") {
								member = self.unsafeNonComputedMember(left, ast.property.name);
							} else {
								member = self.nonComputedMember(left, ast.property.name);
							}
							right = ast.property.name;
						}

						if (ast.computed) {
							if (ast.property.type === AST.Literal) {
								self.recurse(ast.property, right);
							}
						}
						self.if_(
							self.and_(
								self.notNull(left),
								self.or_(
									self.isNull(member),
									self.hasOwnProperty_(left, right, ast.computed)
								)
							),
							function () {
								if (ast.computed) {
									if (ast.property.type !== AST.Literal) {
										self.recurse(ast.property, right);
									}
									if (create && create !== 1) {
										self.if_(self.not(member), self.lazyAssign(member, "{}"));
									}
									self.assign(intoId, member);
									if (nameId) {
										nameId.computed = true;
										nameId.name = right;
									}
								} else {
									if (create && create !== 1) {
										self.if_(
											self.isNull(member),
											self.lazyAssign(member, "{}")
										);
									}
									self.assign(intoId, member);
									if (nameId) {
										nameId.computed = false;
										nameId.name = ast.property.name;
									}
								}
							},
							function () {
								self.assign(intoId, "undefined");
							}
						);
						recursionFn(intoId);
					},
					!!create
				);
				break;
			case AST.CallExpression:
				intoId = intoId || this.nextId();
				if (ast.filter) {
					right = self.filter(ast.callee.name);
					args = [];
					forEach(ast.arguments, function (expr) {
						var argument = self.nextId();
						self.recurse(expr, argument);
						args.push(argument);
					});
					expression = right + ".call(" + right + "," + args.join(",") + ")";
					self.assign(intoId, expression);
					recursionFn(intoId);
				} else {
					right = self.nextId();
					left = {};
					args = [];
					self.recurse(ast.callee, right, left, function () {
						self.if_(
							self.notNull(right),
							function () {
								forEach(ast.arguments, function (expr) {
									self.recurse(
										expr,
										ast.constant ? undefined : self.nextId(),
										undefined,
										function (argument) {
											args.push(argument);
										}
									);
								});
								if (left.name) {
									var x = self.member(left.context, left.name, left.computed);
									expression =
										"(" +
										x +
										" === null ? null : " +
										self.unsafeMember(left.context, left.name, left.computed) +
										".call(" +
										[left.context].concat(args).join(",") +
										"))";
								} else {
									expression = right + "(" + args.join(",") + ")";
								}
								self.assign(intoId, expression);
							},
							function () {
								self.assign(intoId, "undefined");
							}
						);
						recursionFn(intoId);
					});
				}
				break;
			case AST.AssignmentExpression:
				right = this.nextId();
				left = {};
				self.current().inAssignment = true;
				this.recurse(
					ast.left,
					undefined,
					left,
					function () {
						self.if_(
							self.and_(
								self.notNull(left.context),
								self.or_(
									self.hasOwnProperty_(left.context, left.name),
									self.isNull(
										self.member(left.context, left.name, left.computed)
									)
								)
							),
							function () {
								self.recurse(ast.right, right);
								expression =
									self.member(left.context, left.name, left.computed) +
									ast.operator +
									right;
								self.assign(intoId, expression);
								recursionFn(intoId || expression);
							}
						);
						self.current().inAssignment = false;
						self.recurse(ast.right, right);
						self.current().inAssignment = true;
					},
					1
				);
				self.current().inAssignment = false;
				break;
			case AST.ArrayExpression:
				args = [];
				forEach(ast.elements, function (expr) {
					self.recurse(
						expr,
						ast.constant ? undefined : self.nextId(),
						undefined,
						function (argument) {
							args.push(argument);
						}
					);
				});
				expression = "[" + args.join(",") + "]";
				this.assign(intoId, expression);
				recursionFn(intoId || expression);
				break;
			case AST.ObjectExpression:
				args = [];
				computed = false;
				forEach(ast.properties, function (property) {
					if (property.computed) {
						computed = true;
					}
				});
				if (computed) {
					intoId = intoId || this.nextId();
					this.assign(intoId, "{}");
					forEach(ast.properties, function (property) {
						if (property.computed) {
							left = self.nextId();
							self.recurse(property.key, left);
						} else {
							left =
								property.key.type === AST.Identifier
									? property.key.name
									: "" + property.key.value;
						}
						right = self.nextId();
						self.recurse(property.value, right);
						self.assign(
							self.unsafeMember(intoId, left, property.computed),
							right
						);
					});
				} else {
					forEach(ast.properties, function (property) {
						self.recurse(
							property.value,
							ast.constant ? undefined : self.nextId(),
							undefined,
							function (expr) {
								args.push(
									self.escape(
										property.key.type === AST.Identifier
											? property.key.name
											: "" + property.key.value
									) +
										":" +
										expr
								);
							}
						);
					});
					expression = "{" + args.join(",") + "}";
					this.assign(intoId, expression);
				}
				recursionFn(intoId || expression);
				break;
			case AST.ThisExpression:
				this.assign(intoId, "s");
				recursionFn(intoId || "s");
				break;
			case AST.LocalsExpression:
				this.assign(intoId, "l");
				recursionFn(intoId || "l");
				break;
			case AST.NGValueParameter:
				this.assign(intoId, "v");
				recursionFn(intoId || "v");
				break;
		}
	},

	getHasOwnProperty: function (element, property) {
		var key = element + "." + property;
		var own = this.current().own;
		if (!own.hasOwnProperty(key)) {
			own[key] = this.nextId(
				false,
				element + "&&(" + this.escape(property) + " in " + element + ")"
			);
		}
		return own[key];
	},

	assign: function (id, value) {
		if (!id) {
			return;
		}
		this.current().body.push(id, "=", value, ";");
		return id;
	},

	filter: function (filterName) {
		if (!this.state.filters.hasOwnProperty(filterName)) {
			this.state.filters[filterName] = this.nextId(true);
		}
		return this.state.filters[filterName];
	},

	ifDefined: function (id, defaultValue) {
		return "ifDefined(" + id + "," + this.escape(defaultValue) + ")";
	},

	plus: function (left, right) {
		return "plus(" + left + "," + right + ")";
	},

	return_: function (id) {
		this.current().body.push("return ", id, ";");
	},

	if_: function (test, alternate, consequent) {
		if (test === true) {
			alternate();
		} else {
			var body = this.current().body;
			body.push("if(", test, "){");
			alternate();
			body.push("}");
			if (consequent) {
				body.push("else{");
				consequent();
				body.push("}");
			}
		}
	},
	or_: function (expr1, expr2) {
		return "(" + expr1 + ") || (" + expr2 + ")";
	},
	hasOwnProperty_: function (obj, prop, computed) {
		if (computed) {
			return "(Object.prototype.hasOwnProperty.call(" + obj + "," + prop + "))";
		}
		return "(Object.prototype.hasOwnProperty.call(" + obj + ",'" + prop + "'))";
	},
	and_: function (expr1, expr2) {
		return "(" + expr1 + ") && (" + expr2 + ")";
	},
	not: function (expression) {
		return "!(" + expression + ")";
	},

	isNull: function (expression) {
		return expression + "==null";
	},

	notNull: function (expression) {
		return expression + "!=null";
	},

	nonComputedMember: function (left, right) {
		var SAFE_IDENTIFIER = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/;
		var UNSAFE_CHARACTERS = /[^$_a-zA-Z0-9]/g;
		var expr = "";
		if (SAFE_IDENTIFIER.test(right)) {
			expr = left + "." + right;
		} else {
			right = right.replace(UNSAFE_CHARACTERS, this.stringEscapeFn);
			expr = left + '["' + right + '"]';
		}

		return expr;
	},

	unsafeComputedMember: function (left, right) {
		return left + "[" + right + "]";
	},
	unsafeNonComputedMember: function (left, right) {
		return this.nonComputedMember(left, right);
	},

	computedMember: function (left, right) {
		if (this.state.computing === "assign") {
			return this.unsafeComputedMember(left, right);
		}
		// return left + "[" + right + "]";
		return (
			"(" +
			left +
			".hasOwnProperty(" +
			right +
			") ? " +
			left +
			"[" +
			right +
			"] : null)"
		);
	},

	unsafeMember: function (left, right, computed) {
		if (computed) {
			return this.unsafeComputedMember(left, right);
		}
		return this.unsafeNonComputedMember(left, right);
	},

	member: function (left, right, computed) {
		if (computed) {
			return this.computedMember(left, right);
		}
		return this.nonComputedMember(left, right);
	},

	getStringValue: function (item) {
		this.assign(item, "getStringValue(" + item + ")");
	},

	lazyRecurse: function (
		ast,
		intoId,
		nameId,
		recursionFn,
		create,
		skipWatchIdCheck
	) {
		var self = this;
		return function () {
			self.recurse(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck);
		};
	},

	lazyAssign: function (id, value) {
		var self = this;
		return function () {
			self.assign(id, value);
		};
	},

	stringEscapeRegex: /[^ a-zA-Z0-9]/g,

	stringEscapeFn: function (c) {
		return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
	},

	escape: function (value) {
		if (isString(value)) {
			return (
				"'" + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + "'"
			);
		}
		if (isNumber(value)) {
			return value.toString();
		}
		if (value === true) {
			return "true";
		}
		if (value === false) {
			return "false";
		}
		if (value === null) {
			return "null";
		}
		if (typeof value === "undefined") {
			return "undefined";
		}

		throw $parseMinErr("esc", "IMPOSSIBLE");
	},

	nextId: function (skip, init) {
		var id = "v" + this.state.nextId++;
		if (!skip) {
			this.current().vars.push(id + (init ? "=" + init : ""));
		}
		return id;
	},

	current: function () {
		return this.state[this.state.computing];
	},
};

/**
 * @constructor
 */
var Parser = function Parser(lexer, $filter, options) {
	this.lexer = lexer;
	this.$filter = $filter;
	options = options || {};
	options.handleThis = options.handleThis != null ? options.handleThis : true;
	this.options = options;
	this.ast = new AST(lexer, options);
	this.ast.selfReferential = {
		$locals: { type: AST.LocalsExpression },
	};
	if (options.handleThis) {
		this.ast.selfReferential.this = { type: AST.ThisExpression };
	}
	this.astCompiler = options.csp
		? new ASTInterpreter(this.ast, $filter)
		: new ASTCompiler(this.ast, $filter);
};

Parser.prototype = {
	constructor: Parser,

	parse: function (text) {
		return this.astCompiler.compile(text);
	},
};

function AST(lexer, options) {
	this.lexer = lexer;
	this.options = options;
}

AST.Program = "Program";
AST.ExpressionStatement = "ExpressionStatement";
AST.AssignmentExpression = "AssignmentExpression";
AST.ConditionalExpression = "ConditionalExpression";
AST.LogicalExpression = "LogicalExpression";
AST.BinaryExpression = "BinaryExpression";
AST.UnaryExpression = "UnaryExpression";
AST.CallExpression = "CallExpression";
AST.MemberExpression = "MemberExpression";
AST.Identifier = "Identifier";
AST.Literal = "Literal";
AST.ArrayExpression = "ArrayExpression";
AST.Property = "Property";
AST.ObjectExpression = "ObjectExpression";
AST.ThisExpression = "ThisExpression";
AST.LocalsExpression = "LocalsExpression";

// Internal use only
AST.NGValueParameter = "NGValueParameter";

AST.prototype = {
	ast: function (text) {
		this.text = text;
		this.tokens = this.lexer.lex(text);

		var value = this.program();

		if (this.tokens.length !== 0) {
			this.throwError("is an unexpected token", this.tokens[0]);
		}

		return value;
	},

	program: function () {
		var body = [];
		while (true) {
			if (this.tokens.length > 0 && !this.peek("}", ")", ";", "]")) {
				body.push(this.expressionStatement());
			}
			if (!this.expect(";")) {
				return { type: AST.Program, body: body };
			}
		}
	},

	expressionStatement: function () {
		return { type: AST.ExpressionStatement, expression: this.filterChain() };
	},

	filterChain: function () {
		var left = this.expression();
		while (this.expect("|")) {
			left = this.filter(left);
		}
		return left;
	},

	expression: function () {
		return this.assignment();
	},

	assignment: function () {
		var result = this.ternary();
		if (this.expect("=")) {
			if (!isAssignable(result)) {
				throw $parseMinErr("lval", "Trying to assign a value to a non l-value");
			}

			result = {
				type: AST.AssignmentExpression,
				left: result,
				right: this.assignment(),
				operator: "=",
			};
		}
		return result;
	},

	ternary: function () {
		var test = this.logicalOR();
		var alternate;
		var consequent;
		if (this.expect("?")) {
			alternate = this.expression();
			if (this.consume(":")) {
				consequent = this.expression();
				return {
					type: AST.ConditionalExpression,
					test: test,
					alternate: alternate,
					consequent: consequent,
				};
			}
		}
		return test;
	},

	logicalOR: function () {
		var left = this.logicalAND();
		while (this.expect("||")) {
			left = {
				type: AST.LogicalExpression,
				operator: "||",
				left: left,
				right: this.logicalAND(),
			};
		}
		return left;
	},

	logicalAND: function () {
		var left = this.equality();
		while (this.expect("&&")) {
			left = {
				type: AST.LogicalExpression,
				operator: "&&",
				left: left,
				right: this.equality(),
			};
		}
		return left;
	},

	equality: function () {
		var left = this.relational();
		var token;
		while ((token = this.expect("==", "!=", "===", "!=="))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.relational(),
			};
		}
		return left;
	},

	relational: function () {
		var left = this.additive();
		var token;
		while ((token = this.expect("<", ">", "<=", ">="))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.additive(),
			};
		}
		return left;
	},

	additive: function () {
		var left = this.multiplicative();
		var token;
		while ((token = this.expect("+", "-"))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.multiplicative(),
			};
		}
		return left;
	},

	multiplicative: function () {
		var left = this.unary();
		var token;
		while ((token = this.expect("*", "/", "%"))) {
			left = {
				type: AST.BinaryExpression,
				operator: token.text,
				left: left,
				right: this.unary(),
			};
		}
		return left;
	},

	unary: function () {
		var token;
		if ((token = this.expect("+", "-", "!"))) {
			return {
				type: AST.UnaryExpression,
				operator: token.text,
				prefix: true,
				argument: this.unary(),
			};
		}
		return this.primary();
	},

	primary: function () {
		var primary;
		if (this.expect("(")) {
			primary = this.filterChain();
			this.consume(")");
		} else if (this.expect("[")) {
			primary = this.arrayDeclaration();
		} else if (this.expect("{")) {
			primary = this.object();
		} else if (this.selfReferential.hasOwnProperty(this.peek().text)) {
			primary = copy(this.selfReferential[this.consume().text]);
		} else if (this.options.literals.hasOwnProperty(this.peek().text)) {
			primary = {
				type: AST.Literal,
				value: this.options.literals[this.consume().text],
			};
		} else if (this.peek().identifier) {
			primary = this.identifier();
		} else if (this.peek().constant) {
			primary = this.constant();
		} else {
			this.throwError("not a primary expression", this.peek());
		}

		var next;
		while ((next = this.expect("(", "[", "."))) {
			if (next.text === "(") {
				primary = {
					type: AST.CallExpression,
					callee: primary,
					arguments: this.parseArguments(),
				};
				this.consume(")");
			} else if (next.text === "[") {
				primary = {
					type: AST.MemberExpression,
					object: primary,
					property: this.expression(),
					computed: true,
				};
				this.consume("]");
			} else if (next.text === ".") {
				primary = {
					type: AST.MemberExpression,
					object: primary,
					property: this.identifier(),
					computed: false,
				};
			} else {
				this.throwError("IMPOSSIBLE");
			}
		}
		return primary;
	},

	filter: function (baseExpression) {
		var args = [baseExpression];
		var result = {
			type: AST.CallExpression,
			callee: this.identifier(),
			arguments: args,
			filter: true,
		};

		while (this.expect(":")) {
			args.push(this.expression());
		}

		return result;
	},

	parseArguments: function () {
		var args = [];
		if (this.peekToken().text !== ")") {
			do {
				args.push(this.filterChain());
			} while (this.expect(","));
		}
		return args;
	},

	identifier: function () {
		var token = this.consume();
		if (!token.identifier) {
			this.throwError("is not a valid identifier", token);
		}
		return { type: AST.Identifier, name: token.text };
	},

	constant: function () {
		// TODO check that it is a constant
		return { type: AST.Literal, value: this.consume().value };
	},

	arrayDeclaration: function () {
		var elements = [];
		if (this.peekToken().text !== "]") {
			do {
				if (this.peek("]")) {
					// Support trailing commas per ES5.1.
					break;
				}
				elements.push(this.expression());
			} while (this.expect(","));
		}
		this.consume("]");

		return { type: AST.ArrayExpression, elements: elements };
	},

	object: function () {
		var properties = [],
			property;
		if (this.peekToken().text !== "}") {
			do {
				if (this.peek("}")) {
					// Support trailing commas per ES5.1.
					break;
				}
				property = { type: AST.Property, kind: "init" };
				if (this.peek().constant) {
					property.key = this.constant();
					property.computed = false;
					this.consume(":");
					property.value = this.expression();
				} else if (this.peek().identifier) {
					property.key = this.identifier();
					property.computed = false;
					if (this.peek(":")) {
						this.consume(":");
						property.value = this.expression();
					} else {
						property.value = property.key;
					}
				} else if (this.peek("[")) {
					this.consume("[");
					property.key = this.expression();
					this.consume("]");
					property.computed = true;
					this.consume(":");
					property.value = this.expression();
				} else {
					this.throwError("invalid key", this.peek());
				}
				properties.push(property);
			} while (this.expect(","));
		}
		this.consume("}");

		return { type: AST.ObjectExpression, properties: properties };
	},

	throwError: function (msg, token) {
		throw $parseMinErr(
			"syntax",
			"Syntax Error: Token '{0}' {1} at column {2} of the expression [{3}] starting at [{4}].",
			token.text,
			msg,
			token.index + 1,
			this.text,
			this.text.substring(token.index)
		);
	},

	consume: function (e1) {
		if (this.tokens.length === 0) {
			throw $parseMinErr(
				"ueoe",
				"Unexpected end of expression: {0}",
				this.text
			);
		}

		var token = this.expect(e1);
		if (!token) {
			this.throwError("is unexpected, expecting [" + e1 + "]", this.peek());
		}
		return token;
	},

	peekToken: function () {
		if (this.tokens.length === 0) {
			throw $parseMinErr(
				"ueoe",
				"Unexpected end of expression: {0}",
				this.text
			);
		}
		return this.tokens[0];
	},

	peek: function (e1, e2, e3, e4) {
		return this.peekAhead(0, e1, e2, e3, e4);
	},

	peekAhead: function (i, e1, e2, e3, e4) {
		if (this.tokens.length > i) {
			var token = this.tokens[i];
			var t = token.text;
			if (
				t === e1 ||
				t === e2 ||
				t === e3 ||
				t === e4 ||
				(!e1 && !e2 && !e3 && !e4)
			) {
				return token;
			}
		}
		return false;
	},

	expect: function (e1, e2, e3, e4) {
		var token = this.peek(e1, e2, e3, e4);
		if (token) {
			this.tokens.shift();
			return token;
		}
		return false;
	},
};

