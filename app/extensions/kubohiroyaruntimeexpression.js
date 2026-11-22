// Name: Runtime Expression
// ID: kubohiroyaruntimeexpression
// Description: Safely evaluate JavaScript-like conditions over Temporary Variables runtime variables.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyaruntimeexpression",
	slug: "runtime-expression",
	name: "Runtime Expression",
	description: "Safely evaluate JavaScript-like conditions over Temporary Variables runtime variables.",
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: true,
	docsURI: "https://kubohiroya.github.io/turbowarp-runtime-expression/",
	color1: "#6f5bd3",
	color2: "#5845b8",
	color3: "#40328e",
	blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><path d=\"M6 36h13V14h23\" fill=\"none\" stroke=\"#E6533C\" stroke-width=\"4.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"19\" cy=\"25\" r=\"5\" fill=\"#FFAB19\"/></svg>")}`
};
var block_editor_fixed_inputs_schema_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	$id: "https://kubohiroya.github.io/turbowarp-runtime-expression/schemas/block-editor-fixed-inputs.schema.json",
	title: "turbowarp-runtime-expression fixed editing contracts",
	$defs: { "registerConditionalBroadcast": {
		"type": "object",
		"properties": { "TIMEOUT": { "type": "number" } },
		"additionalProperties": false
	} }
};
//#endregion
//#region src/fixed-input-editors.ts
var contracts = block_editor_fixed_inputs_schema_default.$defs;
var repository = "turbowarp-runtime-expression";
var extensionId = "kubohiroyaruntimeexpression";
var token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
function readNumber(value) {
	if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Invalid numeric projection.");
	if (typeof value === "string" && value.trim() === "") throw new TypeError("Existing blank field is readonly.");
	const number = Number(value);
	if (!Number.isFinite(number)) throw new TypeError("Existing nonfinite field is readonly.");
	return number;
}
function newNumberToken(value) {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Invalid new number.");
		return Object.is(value, -0) ? "-0" : String(value);
	}
	if (typeof value !== "string" || !token.test(value.trim()) || !Number.isFinite(Number(value))) throw new TypeError("Invalid new number.");
	return value.trim();
}
function existingChoice(_opcode, value) {
	if (typeof value !== "string") throw new TypeError("Invalid string projection.");
	return value;
}
function candidateValid(_opcode, _argument, schema, value) {
	if (schema.type === "number" || schema.type === "integer") {
		let number;
		try {
			number = readNumber(value);
		} catch {
			return false;
		}
		if (schema.type === "integer" && !Number.isInteger(number)) return false;
		if (schema.minimum !== void 0 && number < schema.minimum) return false;
		if (schema.maximum !== void 0 && number > schema.maximum) return false;
		if (schema.exclusiveMinimum !== void 0 && number <= schema.exclusiveMinimum) return false;
		if (schema.enum && !schema.enum.includes(number)) return false;
		return true;
	}
	return typeof value === "string" && schema.enum.includes(value);
}
function fixedInputEditorOptions() {
	return Object.entries(contracts).map(([opcode, contract]) => ({
		apiVersion: 1,
		extensionId,
		editorId: `${extensionId}.fixed.${opcode}`,
		opcodes: [`${extensionId}_${opcode}`],
		contractId: `${repository}.${opcode}.fixed`,
		contractRevision: "fixed-inputs-v1",
		validationContext: () => ({
			consumerId: repository,
			nowMs: 0,
			settings: null
		}),
		bindings: Object.entries(contract.properties).map(([argument, schema]) => {
			const numeric = schema.type === "number" || schema.type === "integer";
			const source = {
				repository,
				path: "schemas/block-editor-fixed-inputs.schema.json",
				symbol: `/$defs/${opcode}/properties/${argument}`
			};
			return {
				argument,
				schemaBundle: {
					identity: {
						ownerId: repository,
						contractId: `${opcode}.${argument}`,
						revision: "fixed-inputs-v1",
						variantId: "fixed"
					},
					dialect: "draft-07",
					root: {
						retrievalUri: `${block_editor_fixed_inputs_schema_default.$id}?binding=${opcode}.${argument}`,
						document: schema,
						artifact: {
							role: "canonical-schema",
							source
						}
					},
					resources: [],
					provenance: {
						canonicalSources: [
							source,
							{
								repository,
								path: "src/block-definitions.json"
							},
							{
								repository,
								path: "src/extension.ts",
								symbol: opcode
							}
						],
						generatedFiles: [],
						referenceSchemas: [],
						generationSources: []
					}
				},
				control: numeric ? { kind: "number" } : {
					kind: "enum",
					choices: schema.enum.map((value) => ({
						value,
						label: String(value)
					}))
				},
				read: (value) => numeric ? readNumber(value) : existingChoice(opcode, value),
				encode: (value) => {
					if (numeric) return newNumberToken(value);
					if (typeof value !== "string" || !schema.enum.includes(value)) throw new TypeError("Invalid new enum value.");
					return value;
				},
				validateCandidate: (value) => candidateValid(opcode, argument, schema, value) ? [] : [{
					path: argument,
					message: "Check this value before saving."
				}]
			};
		})
	}));
}
/**
* Register only visible static contracts; ordinary composition consumers load no editor runtime.
* Every project load disposes the runtime while the extension stays loaded for the next project,
* so RUNTIME_DISPOSED only releases the registrations and the next PROJECT_LOADED registers the
* same ones again. The returned dispose is final.
*/
function registerFixedInputEditors(scratch, runtime, visibleBlocks) {
	const api = scratch.gui?.blockEditors;
	if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return void 0;
	const registerEditor = api.registerFixedInputEditor;
	const visibleOpcodes = new Set(visibleBlocks.flatMap((block) => {
		if (typeof block !== "object" || block === null || !("opcode" in block)) return [];
		return typeof block.opcode === "string" ? [block.opcode] : [];
	}));
	const visibleOptions = fixedInputEditorOptions().filter((options) => options.opcodes.some((opcode) => visibleOpcodes.has(opcode.slice(28))));
	const events = runtime;
	const removers = [];
	let registered = false;
	let disposed = false;
	const release = () => {
		registered = false;
		for (const remove of removers.splice(0).reverse()) remove();
	};
	const register = () => {
		if (disposed || registered) return;
		registered = true;
		try {
			for (const options of visibleOptions) removers.push(registerEditor.call(api, options));
		} catch (error) {
			release();
			throw error;
		}
	};
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		events?.off?.("RUNTIME_DISPOSED", release);
		events?.off?.("PROJECT_LOADED", register);
		release();
	};
	try {
		register();
		events?.on?.("RUNTIME_DISPOSED", release);
		events?.on?.("PROJECT_LOADED", register);
	} catch (error) {
		dispose();
		throw error;
	}
	return dispose;
}
var block_definitions_default = {
	extensionName: "Runtime Expression",
	blocks: [
		{
			"opcode": "validateConditionSyntax",
			"blockType": "REPORTER",
			"text": "validate condition syntax [EXPRESSION]",
			"description": "Returns a JSON syntax-validation result without reading runtime variables or evaluating the expression.",
			"hideFromPalette": true,
			"arguments": { "EXPRESSION": {
				"type": "STRING",
				"defaultValue": "state == \"ready\""
			} }
		},
		{
			"opcode": "runtimeCondition",
			"blockType": "BOOLEAN",
			"text": "condition [EXPRESSION]",
			"description": "Safely evaluates a JavaScript-like condition using Temporary Variables runtime variables.",
			"featureFlag": "runtimeExpression",
			"arguments": { "EXPRESSION": {
				"type": "STRING",
				"defaultValue": "state == \"ready\""
			} }
		},
		{
			"opcode": "registerConditionalBroadcast",
			"blockType": "COMMAND",
			"text": "register [ID] conditional broadcast [CONDITION] [MESSAGE_ON_TRUE] / [MESSAGE_ON_FALSE] with [TIMEOUT] seconds timeout",
			"description": "Registers broadcasts for false-to-true and true-to-false runtime condition changes.",
			"featureFlag": "conditionalBroadcast",
			"arguments": {
				"ID": {
					"type": "STRING",
					"defaultValue": "watcher"
				},
				"CONDITION": {
					"type": "STRING",
					"defaultValue": "state == \"ready\""
				},
				"MESSAGE_ON_TRUE": {
					"type": "STRING",
					"defaultValue": "state ready"
				},
				"MESSAGE_ON_FALSE": {
					"type": "STRING",
					"defaultValue": "state not ready"
				},
				"TIMEOUT": {
					"type": "NUMBER",
					"defaultValue": 0
				}
			}
		},
		{
			"opcode": "unregisterConditionalBroadcast",
			"blockType": "COMMAND",
			"text": "unregister [ID] conditional broadcast",
			"description": "Unregisters the conditional broadcast with the matching ID.",
			"featureFlag": "conditionalBroadcast",
			"arguments": { "ID": {
				"type": "STRING",
				"defaultValue": "watcher"
			} }
		}
	]
};
//#endregion
//#region config/feature-flags.ts
var FEATURE_FLAGS = {
	conditionalBroadcast: true,
	runtimeExpression: true
};
//#endregion
//#region \0@oxc-project+runtime@0.148.0/helpers/esm/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
		return typeof o;
	} : function(o) {
		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
	}, _typeof(o);
}
//#endregion
//#region \0@oxc-project+runtime@0.148.0/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
	if ("object" != _typeof(t) || !t) return t;
	var e = t[Symbol.toPrimitive];
	if (void 0 !== e) {
		var i = e.call(t, r || "default");
		if ("object" != _typeof(i)) return i;
		throw new TypeError("@@toPrimitive must return a primitive value.");
	}
	return ("string" === r ? String : Number)(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.148.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.148.0/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
		value: t,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[r] = t, e;
}
//#endregion
//#region src/condition.ts
var MAX_EXPRESSION_LENGTH = 4096;
function collectRuntimeVariableNames(expression) {
	const names = /* @__PURE__ */ new Set();
	const visit = (node) => {
		switch (node.kind) {
			case "literal": return;
			case "variable":
				names.add(node.name);
				return;
			case "unary":
				visit(node.operand);
				return;
			case "binary":
				visit(node.left);
				visit(node.right);
		}
	};
	visit(expression);
	return [...names];
}
var MULTI_CHAR_OPERATORS = [
	"===",
	"!==",
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||"
];
var SIMPLE_ESCAPES = {
	"\\": "\\",
	"\"": "\"",
	"'": "'",
	n: "\n",
	r: "\r",
	t: "	"
};
var ConditionSyntaxError = class extends Error {
	constructor(message, position) {
		super(`${message} at position ${position}.`);
		_defineProperty(this, "position", void 0);
		this.position = position;
		this.name = "ConditionSyntaxError";
	}
};
function tokenizeCondition(expression) {
	if (expression.length > 4096) throw new ConditionSyntaxError(`Expression exceeds the ${MAX_EXPRESSION_LENGTH} character limit`, MAX_EXPRESSION_LENGTH);
	const tokens = [];
	let index = 0;
	const push = (token) => {
		tokens.push(token);
		if (tokens.length > 512) throw new ConditionSyntaxError(`Expression exceeds the 512 token limit`, token.position);
	};
	while (index < expression.length) {
		const character = expression[index];
		if (/\s/u.test(character)) {
			index += 1;
			continue;
		}
		const position = index;
		const operator = MULTI_CHAR_OPERATORS.find((candidate) => expression.startsWith(candidate, index));
		if (operator) {
			push({
				kind: "operator",
				value: operator,
				position
			});
			index += operator.length;
			continue;
		}
		if ("!+-*/%<>".includes(character)) {
			push({
				kind: "operator",
				value: character,
				position
			});
			index += 1;
			continue;
		}
		if ("()[]".includes(character)) {
			push({
				kind: "punctuation",
				value: character,
				position
			});
			index += 1;
			continue;
		}
		if (character === "\"" || character === "'") {
			const quote = character;
			let value = "";
			index += 1;
			let closed = false;
			while (index < expression.length) {
				const next = expression[index];
				if (next === quote) {
					closed = true;
					index += 1;
					break;
				}
				if (next === "\n" || next === "\r") throw new ConditionSyntaxError("Unescaped newline in string literal", index);
				if (next !== "\\") {
					value += next;
					index += 1;
					continue;
				}
				const escapePosition = index;
				index += 1;
				const escaped = expression[index];
				if (escaped === void 0) throw new ConditionSyntaxError("Unterminated string escape", escapePosition);
				if (escaped === "u") {
					const hexadecimal = expression.slice(index + 1, index + 5);
					if (!/^[0-9a-fA-F]{4}$/u.test(hexadecimal)) throw new ConditionSyntaxError("Invalid Unicode escape", escapePosition);
					value += String.fromCharCode(Number.parseInt(hexadecimal, 16));
					index += 5;
					continue;
				}
				const replacement = SIMPLE_ESCAPES[escaped];
				if (replacement === void 0) throw new ConditionSyntaxError(`Unsupported string escape \\${escaped}`, escapePosition);
				value += replacement;
				index += 1;
			}
			if (!closed) throw new ConditionSyntaxError("Unterminated string literal", position);
			push({
				kind: "string",
				value,
				position
			});
			continue;
		}
		const rest = expression.slice(index);
		const numberMatch = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(rest);
		if (numberMatch?.[0]) {
			const value = Number(numberMatch[0]);
			if (!Number.isFinite(value)) throw new ConditionSyntaxError("Number literal must be finite", position);
			push({
				kind: "number",
				value,
				position
			});
			index += numberMatch[0].length;
			continue;
		}
		const identifierMatch = /^[A-Za-z_$][A-Za-z0-9_$]*/u.exec(rest);
		if (identifierMatch?.[0]) {
			push({
				kind: "identifier",
				value: identifierMatch[0],
				position
			});
			index += identifierMatch[0].length;
			continue;
		}
		throw new ConditionSyntaxError(`Unexpected character ${JSON.stringify(character)}`, position);
	}
	push({
		kind: "eof",
		position: expression.length
	});
	return tokens;
}
var ConditionParser = class {
	constructor(tokens) {
		_defineProperty(this, "tokens", void 0);
		_defineProperty(this, "index", 0);
		_defineProperty(this, "depth", 0);
		this.tokens = tokens;
	}
	parse() {
		if (this.current().kind === "eof") throw new ConditionSyntaxError("Expression is empty", this.current().position);
		const expression = this.parseLogicalOr();
		const trailing = this.current();
		if (trailing.kind !== "eof") throw new ConditionSyntaxError("Unexpected trailing token", trailing.position);
		return expression;
	}
	parseLogicalOr() {
		let expression = this.parseLogicalAnd();
		while (this.matchOperator("||")) expression = {
			kind: "binary",
			operator: "||",
			left: expression,
			right: this.parseLogicalAnd()
		};
		return expression;
	}
	parseLogicalAnd() {
		let expression = this.parseEquality();
		while (this.matchOperator("&&")) expression = {
			kind: "binary",
			operator: "&&",
			left: expression,
			right: this.parseEquality()
		};
		return expression;
	}
	parseEquality() {
		let expression = this.parseRelational();
		while (this.isOperator("==", "!=", "===", "!==")) expression = {
			kind: "binary",
			operator: this.advanceOperator(),
			left: expression,
			right: this.parseRelational()
		};
		return expression;
	}
	parseRelational() {
		let expression = this.parseAdditive();
		while (this.isOperator("<", "<=", ">", ">=")) expression = {
			kind: "binary",
			operator: this.advanceOperator(),
			left: expression,
			right: this.parseAdditive()
		};
		return expression;
	}
	parseAdditive() {
		let expression = this.parseMultiplicative();
		while (this.isOperator("+", "-")) expression = {
			kind: "binary",
			operator: this.advanceOperator(),
			left: expression,
			right: this.parseMultiplicative()
		};
		return expression;
	}
	parseMultiplicative() {
		let expression = this.parseUnary();
		while (this.isOperator("*", "/", "%")) expression = {
			kind: "binary",
			operator: this.advanceOperator(),
			left: expression,
			right: this.parseUnary()
		};
		return expression;
	}
	parseUnary() {
		if (this.isOperator("!", "+", "-")) {
			const token = this.current();
			const operator = this.advanceOperator();
			return this.withDepth(token.position, () => ({
				kind: "unary",
				operator,
				operand: this.parseUnary()
			}));
		}
		return this.parsePrimary();
	}
	parsePrimary() {
		const token = this.current();
		if (token.kind === "number" || token.kind === "string") {
			this.index += 1;
			return {
				kind: "literal",
				value: token.value
			};
		}
		if (token.kind === "identifier") {
			this.index += 1;
			if (token.value === "true") return {
				kind: "literal",
				value: true
			};
			if (token.value === "false") return {
				kind: "literal",
				value: false
			};
			if (token.value === "null") return {
				kind: "literal",
				value: null
			};
			if (token.value === "undefined") return {
				kind: "literal",
				value: void 0
			};
			if (token.value === "vars" && this.matchPunctuation("[")) {
				const nameToken = this.current();
				if (nameToken.kind !== "string") throw new ConditionSyntaxError("vars[...] requires a string literal variable name", nameToken.position);
				this.index += 1;
				this.expectPunctuation("]");
				return {
					kind: "variable",
					name: nameToken.value
				};
			}
			return {
				kind: "variable",
				name: token.value
			};
		}
		if (this.matchPunctuation("(")) return this.withDepth(token.position, () => {
			const expression = this.parseLogicalOr();
			this.expectPunctuation(")");
			return expression;
		});
		throw new ConditionSyntaxError("Expected a literal, variable, or parenthesized expression", token.position);
	}
	withDepth(position, action) {
		this.depth += 1;
		if (this.depth > 64) throw new ConditionSyntaxError(`Expression exceeds the 64 nesting limit`, position);
		try {
			return action();
		} finally {
			this.depth -= 1;
		}
	}
	current() {
		return this.tokens[this.index] ?? {
			kind: "eof",
			position: 0
		};
	}
	isOperator(...operators) {
		const token = this.current();
		return token.kind === "operator" && operators.includes(token.value);
	}
	matchOperator(operator) {
		if (!this.isOperator(operator)) return false;
		this.index += 1;
		return true;
	}
	advanceOperator() {
		const token = this.current();
		if (token.kind !== "operator") throw new ConditionSyntaxError("Expected an operator", token.position);
		this.index += 1;
		return token.value;
	}
	matchPunctuation(punctuation) {
		const token = this.current();
		if (token.kind !== "punctuation" || token.value !== punctuation) return false;
		this.index += 1;
		return true;
	}
	expectPunctuation(punctuation) {
		const token = this.current();
		if (token.kind !== "punctuation" || token.value !== punctuation) throw new ConditionSyntaxError(`Expected ${punctuation}`, token.position);
		this.index += 1;
	}
};
function parseCondition(expression) {
	return new ConditionParser(tokenizeCondition(expression)).parse();
}
function validateConditionSyntax(expression) {
	try {
		parseCondition(expression);
		return { ok: true };
	} catch (error) {
		if (!(error instanceof ConditionSyntaxError)) throw error;
		return {
			ok: false,
			code: "CONDITION_SYNTAX_ERROR",
			position: error.position,
			message: error.message
		};
	}
}
function evaluateConditionExpression(expression, resolveVariable) {
	switch (expression.kind) {
		case "literal": return expression.value;
		case "variable": return resolveVariable(expression.name);
		case "unary": {
			const value = evaluateConditionExpression(expression.operand, resolveVariable);
			if (expression.operator === "!") return !value;
			if (expression.operator === "+") return Number(value);
			return -Number(value);
		}
		case "binary": {
			const left = evaluateConditionExpression(expression.left, resolveVariable);
			if (expression.operator === "&&") return left && evaluateConditionExpression(expression.right, resolveVariable);
			if (expression.operator === "||") return left || evaluateConditionExpression(expression.right, resolveVariable);
			const right = evaluateConditionExpression(expression.right, resolveVariable);
			switch (expression.operator) {
				case "==": return left == right;
				case "!=": return left != right;
				case "===": return left === right;
				case "!==": return left !== right;
				case "<": return left < right;
				case "<=": return left <= right;
				case ">": return left > right;
				case ">=": return left >= right;
				case "+": return left + right;
				case "-": return left - right;
				case "*": return left * right;
				case "/": return left / right;
				case "%": return left % right;
			}
		}
	}
}
var ConditionEvaluator = class {
	constructor() {
		_defineProperty(this, "cache", /* @__PURE__ */ new Map());
	}
	clearCache() {
		this.cache.clear();
	}
	parse(expression) {
		const cached = this.cache.get(expression);
		if (cached) {
			this.cache.delete(expression);
			this.cache.set(expression, cached);
			return cached;
		}
		const parsed = parseCondition(expression);
		this.cache.set(expression, parsed);
		if (this.cache.size > 128) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== void 0) this.cache.delete(oldest);
		}
		return parsed;
	}
	evaluate(expression, resolveVariable) {
		return Boolean(evaluateConditionExpression(this.parse(expression), resolveVariable));
	}
};
//#endregion
//#region src/runtime-variables.ts
function getRuntimeVariablesIfAvailable(runtime) {
	const extension = runtime.ext_lmsTempVars2;
	if (!extension || typeof extension.setRuntimeVariable !== "function" || typeof extension.getRuntimeVariable !== "function" || typeof extension.runtimeVariableExists !== "function") return;
	return extension;
}
function requireRuntimeVariables(runtime) {
	const extension = getRuntimeVariablesIfAvailable(runtime);
	if (extension) return extension;
	throw new Error("Temporary Variables (lmsTempVars2) must be loaded before using Runtime Expression.");
}
function readRuntimeVariableState(extension, name) {
	const exists = extension.runtimeVariableExists({ VAR: name });
	return {
		exists,
		value: exists ? extension.getRuntimeVariable({ VAR: name }) : void 0
	};
}
function readRuntimeVariable(extension, name) {
	return readRuntimeVariableState(extension, name).value;
}
//#endregion
//#region src/conditional-broadcast.ts
var ConditionalBroadcastManager = class {
	constructor(runtime, evaluator = new ConditionEvaluator(), now = () => performance.now()) {
		_defineProperty(this, "runtime", void 0);
		_defineProperty(this, "evaluator", void 0);
		_defineProperty(this, "now", void 0);
		_defineProperty(this, "registrations", /* @__PURE__ */ new Map());
		this.runtime = runtime;
		this.evaluator = evaluator;
		this.now = now;
	}
	register(input) {
		const runtimeVariables = requireRuntimeVariables(this.runtime);
		const expression = this.evaluator.parse(input.condition);
		const dependencies = collectRuntimeVariableNames(expression);
		const snapshot = captureSnapshot(dependencies, (name) => readRuntimeVariableState(runtimeVariables, name));
		const result = evaluateSnapshot(expression, snapshot);
		const expiresAt = input.timeoutSeconds > 0 ? this.now() + input.timeoutSeconds * 1e3 : null;
		this.registrations.set(input.id, {
			expression,
			dependencies,
			snapshot,
			result,
			messageOnTrue: input.messageOnTrue,
			messageOnFalse: input.messageOnFalse,
			expiresAt
		});
	}
	unregister(id) {
		this.registrations.delete(id);
	}
	clear() {
		this.registrations.clear();
	}
	processFrame() {
		if (this.registrations.size === 0) return;
		const now = this.now();
		for (const [id, registration] of this.registrations) if (registration.expiresAt !== null && now >= registration.expiresAt) this.registrations.delete(id);
		if (this.registrations.size === 0) return;
		const runtimeVariables = getRuntimeVariablesIfAvailable(this.runtime);
		if (!runtimeVariables) return;
		const readState = createCachedStateReader(runtimeVariables);
		for (const registration of this.registrations.values()) {
			const snapshot = captureSnapshot(registration.dependencies, readState);
			if (snapshotsEqual(registration.snapshot, snapshot)) continue;
			const result = evaluateSnapshot(registration.expression, snapshot);
			const previousResult = registration.result;
			registration.snapshot = snapshot;
			registration.result = result;
			if (result === previousResult) continue;
			const message = result ? registration.messageOnTrue : registration.messageOnFalse;
			this.runtime.startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: message });
		}
	}
};
function captureSnapshot(dependencies, readState) {
	return new Map(dependencies.map((name) => [name, readState(name)]));
}
function createCachedStateReader(extension) {
	const cache = /* @__PURE__ */ new Map();
	return (name) => {
		const cached = cache.get(name);
		if (cached) return cached;
		const state = readRuntimeVariableState(extension, name);
		cache.set(name, state);
		return state;
	};
}
function evaluateSnapshot(expression, snapshot) {
	return Boolean(evaluateConditionExpression(expression, (name) => snapshot.get(name)?.value));
}
function snapshotsEqual(left, right) {
	if (left.size !== right.size) return false;
	for (const [name, leftState] of left) {
		const rightState = right.get(name);
		if (!rightState || leftState.exists !== rightState.exists || !Object.is(leftState.value, rightState.value)) return false;
	}
	return true;
}
//#endregion
//#region src/extension.ts
var EXTENSION_ID = extensionConfig.id;
var DOCS_URI = extensionConfig.docsURI;
var BLOCK_ICON_URI = extensionConfig.blockIconURI;
var blockDefinitions = block_definitions_default.blocks;
var RuntimeExpressionExtension = class {
	constructor() {
		_defineProperty(this, "fixedEditorsDispose", void 0);
		_defineProperty(this, "runtime", Scratch.vm.runtime);
		_defineProperty(this, "evaluator", new ConditionEvaluator());
		_defineProperty(this, "conditionalBroadcasts", new ConditionalBroadcastManager(this.runtime, this.evaluator));
		this.runtime.on("BEFORE_EXECUTE", () => this.conditionalBroadcasts.processFrame());
		const clearConditionalBroadcasts = () => this.conditionalBroadcasts.clear();
		this.runtime.on("PROJECT_START", clearConditionalBroadcasts);
		this.runtime.on("PROJECT_STOP_ALL", clearConditionalBroadcasts);
	}
	getInfo() {
		const info = {
			id: EXTENSION_ID,
			name: Scratch.translate(block_definitions_default.extensionName),
			docsURI: DOCS_URI,
			blockIconURI: BLOCK_ICON_URI,
			color1: extensionConfig.color1,
			color2: extensionConfig.color2,
			color3: extensionConfig.color3,
			blocks: blockDefinitions.filter((block) => !block.featureFlag || FEATURE_FLAGS[block.featureFlag]).map((block) => ({
				opcode: block.opcode,
				blockType: Scratch.BlockType[block.blockType],
				text: Scratch.translate(block.text),
				...block.hideFromPalette ? { hideFromPalette: true } : {},
				arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
					type: Scratch.ArgumentType[argument.type],
					defaultValue: argument.defaultValue
				}]))
			}))
		};
		this.fixedEditorsDispose ?? (this.fixedEditorsDispose = registerFixedInputEditors(Scratch, this.runtime, info.blocks));
		return info;
	}
	runtimeCondition(args) {
		const runtimeVariables = requireRuntimeVariables(this.runtime);
		return this.evaluator.evaluate(String(args.EXPRESSION ?? ""), (name) => readRuntimeVariable(runtimeVariables, name));
	}
	validateConditionSyntax(args) {
		return JSON.stringify(validateConditionSyntax(String(args.EXPRESSION ?? "")));
	}
	registerConditionalBroadcast(args) {
		this.conditionalBroadcasts.register({
			id: String(args.ID ?? ""),
			condition: String(args.CONDITION ?? ""),
			messageOnTrue: String(args.MESSAGE_ON_TRUE ?? ""),
			messageOnFalse: String(args.MESSAGE_ON_FALSE ?? ""),
			timeoutSeconds: Number(args.TIMEOUT ?? 0)
		});
	}
	unregisterConditionalBroadcast(args) {
		this.conditionalBroadcasts.unregister(String(args.ID ?? ""));
	}
};
//#endregion
//#region src/index.ts
if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
Scratch.extensions.register(new RuntimeExpressionExtension());
//#endregion

})(Scratch);
