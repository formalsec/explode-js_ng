"use strict";


//main.js
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

//parse.js

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

