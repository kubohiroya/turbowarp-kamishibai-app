// Name: Text Lines
// ID: kubohiroyatextlines
// Description: Count, read, and split text by lines in TurboWarp.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyatextlines",
	slug: "text-lines",
	name: "Text Lines",
	description: "Count, read, and split text by lines in TurboWarp.",
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: true,
	docsURI: "https://kubohiroya.github.io/turbowarp-text-lines/",
	color1: "#5B80A5",
	blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><g fill=\"#4C97FF\"><circle cx=\"11\" cy=\"16\" r=\"2.6\"/><circle cx=\"11\" cy=\"24\" r=\"2.6\"/><circle cx=\"11\" cy=\"32\" r=\"2.6\"/></g><path d=\"M19 16h20M19 24h20M19 32h13\" fill=\"none\" stroke=\"#59C059\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>")}`
};
//#endregion
//#region node_modules/.pnpm/@kubohiroya+turbowarp-extension-data-editor@0.11.2_react@18.3.1/node_modules/@kubohiroya/turbowarp-extension-data-editor/dist/fixed-input-schema.js
var numberToken = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
var invalidNumber = Object.freeze({
	kind: "invalid",
	code: "fixed-number-input-invalid"
});
/**
* Parse a NEW numeric draft according to NP-finite-new-input-v1.
* Never apply this to opening/no-op raw values or use it as an owner validator.
* Keep the validated token so negative zero, precision and exponent spelling survive.
*/
function parseFixedNumberInput(input) {
	if (typeof input === "number") {
		if (!Number.isFinite(input)) return invalidNumber;
		return Object.freeze({
			kind: "valid",
			token: Object.is(input, -0) ? "-0" : String(input),
			value: input
		});
	}
	if (typeof input !== "string") return invalidNumber;
	const token = input.trim();
	if (!numberToken.test(token)) return invalidNumber;
	const value = Number(token);
	return Number.isFinite(value) ? Object.freeze({
		kind: "valid",
		token,
		value
	}) : invalidNumber;
}
var block_editor_fixed_inputs_schema_default = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://kubohiroya.github.io/turbowarp-text-lines/schemas/block-editor-fixed-inputs.schema.json",
	$defs: { "lineAt": {
		"type": "object",
		"properties": { "LINE": { "type": "number" } },
		"required": ["LINE"],
		"additionalProperties": true
	} }
};
//#endregion
//#region src/fixed-input-schema.ts
var repository$1 = "turbowarp-text-lines";
/** The owner JSON document is canonical; this selects a primitive field fragment. */
function fixedInputBundle(opcode, argument) {
	const source = {
		repository: repository$1,
		path: "schemas/block-editor-fixed-inputs.schema.json",
		symbol: `#/$defs/${opcode}/properties/${argument}`
	};
	const blocks = block_editor_fixed_inputs_schema_default.$defs;
	return {
		identity: {
			ownerId: repository$1,
			contractId: opcode,
			revision: "fixed-inputs-v1",
			variantId: argument
		},
		dialect: "2020-12",
		root: {
			retrievalUri: block_editor_fixed_inputs_schema_default.$id,
			document: blocks[opcode].properties[argument],
			artifact: {
				role: "canonical-schema",
				source
			}
		},
		resources: [],
		provenance: {
			canonicalSources: [source, {
				repository: repository$1,
				path: "src/extension.ts",
				symbol: opcode
			}],
			generatedFiles: [],
			referenceSchemas: [],
			generationSources: []
		}
	};
}
//#endregion
//#region src/fixed-input-editors.ts
var extensionId = "kubohiroyatextlines";
var repository = "turbowarp-text-lines";
var fields = [{
	"opcode": "lineAt",
	"argument": "LINE",
	"control": "number",
	"choices": [],
	"normalization": "identity",
	"shape": "math_number.NUM",
	"maxBytes": false
}];
function literalString(value) {
	if (typeof value !== "string") throw new TypeError("Expected a string literal.");
	return value;
}
/** Legacy nonempty finite aliases are projections; opening never creates a write. */
function existingFixedNumber(value) {
	if (typeof value !== "string" && typeof value !== "number" || typeof value === "string" && value.trim() === "") throw new TypeError("Unavailable numeric projection.");
	const number = Number(value);
	if (!Number.isFinite(number)) throw new TypeError("Unavailable numeric projection.");
	return number;
}
function normalizeChoice(field, raw) {
	if (field.normalization === "lowercase") return raw.toLowerCase();
	if (field.normalization === "method") return raw.trim().toUpperCase();
	if (field.normalization === "trim") return raw.trim();
	if (field.normalization === "parse-format") {
		const lower = raw.trim().toLowerCase();
		return lower === "json" ? "JSON" : lower === "yaml" ? "YAML" : lower === "auto" ? "auto" : raw;
	}
	return raw;
}
function binding(field) {
	return {
		argument: field.argument,
		schemaBundle: fixedInputBundle(field.opcode, field.argument),
		control: {
			kind: field.control,
			...field.control === "enum" ? { choices: field.choices.map((value) => ({ value })) } : {}
		},
		read(value) {
			return field.control === "number" ? existingFixedNumber(value) : normalizeChoice(field, literalString(value));
		},
		encode(value) {
			if (field.control === "number") {
				const parsed = parseFixedNumberInput(value);
				if (parsed.kind !== "valid") throw new TypeError("Invalid new numeric input.");
				return parsed.token;
			}
			const raw = literalString(value), normalized = normalizeChoice(field, raw);
			if (!field.choices.includes(normalized)) throw new TypeError("Unsupported fixed choice.");
			return field.shape === "menu-shadow" || field.shape === "direct-field-dropdown" ? normalized : raw;
		},
		validateCandidate(value) {
			try {
				if (field.control === "number") {
					const number = existingFixedNumber(value);
					if (field.maxBytes && (!Number.isSafeInteger(Math.trunc(number)) || Math.trunc(number) < 1)) return [{ message: "Invalid named body size." }];
					return [];
				}
				return field.choices.includes(normalizeChoice(field, literalString(value))) ? [] : [{ message: "Unsupported fixed choice." }];
			} catch {
				return [{ message: "Invalid fixed input." }];
			}
		}
	};
}
var fixedInputEditors = [...new Set(fields.map((f) => f.opcode))].map((opcode) => ({
	apiVersion: 1,
	extensionId,
	editorId: `${opcode}-fixed-inputs`,
	opcodes: [`${extensionId}_${opcode}`],
	contractId: `${repository}/${opcode}`,
	contractRevision: "fixed-inputs-v1",
	bindings: fields.filter((field) => field.opcode === opcode).map(binding),
	validationContext: () => ({
		consumerId: repository,
		nowMs: 0,
		settings: null
	})
}));
/**
* Registration follows the advertised opcode membership and the optional host capability.
* Loading a project disposes the runtime, which releases the registrations, but the extension
* stays loaded for the next project: they are registered again once that project has loaded.
* Only the owner's dispose is final.
*/
function fixedInputRegistration(scratch) {
	const host = scratch ?? {};
	let active;
	let membership = "";
	const removers = [];
	let stopped = false;
	let released = false;
	let requested = [];
	const clear = () => {
		host.vm?.runtime?.off?.("RUNTIME_DISPOSED", release);
		host.vm?.runtime?.off?.("PROJECT_LOADED", restore);
		for (const remove of removers.splice(0).reverse()) remove();
		active = void 0;
		membership = "";
	};
	const register = (visibleOpcodes) => {
		const api = host.gui?.blockEditors;
		const definitions = fixedInputEditors.filter((definition) => definition.opcodes.every((opcode) => visibleOpcodes.includes(opcode)));
		const key = definitions.map((definition) => definition.editorId).join(",");
		if (api === active && membership === key) return;
		clear();
		if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function" || !definitions.length) return;
		try {
			for (const definition of definitions) {
				const remove = api.registerFixedInputEditor.call(api, definition);
				if (typeof remove !== "function") throw new TypeError("Invalid fixed input cleanup.");
				removers.push(remove);
			}
			active = api;
			membership = key;
			host.vm?.runtime?.on?.("RUNTIME_DISPOSED", release);
		} catch (error) {
			clear();
			throw error;
		}
	};
	/** The runtime of this project is gone; wait for the next project before registering again. */
	const release = () => {
		clear();
		released = true;
		host.vm?.runtime?.on?.("PROJECT_LOADED", restore);
	};
	const restore = () => {
		if (stopped || !released) return;
		released = false;
		try {
			register(requested);
		} catch {}
	};
	const shutdown = () => {
		stopped = true;
		released = false;
		clear();
	};
	return {
		ensure(visibleOpcodes) {
			requested = visibleOpcodes;
			if (stopped || released) return;
			register(visibleOpcodes);
		},
		dispose: shutdown
	};
}
var block_definitions_default = {
	extensionName: "Text Lines",
	blocks: [
		{
			"opcode": "lineCount",
			"blockType": "REPORTER",
			"text": "number of lines in [TEXT]",
			"description": "Returns the number of lines in the supplied text.",
			"arguments": { "TEXT": {
				"type": "STRING",
				"defaultValue": "first line\nsecond line"
			} }
		},
		{
			"opcode": "lineAt",
			"blockType": "REPORTER",
			"text": "line [LINE] of [TEXT]",
			"description": "Returns one line using a one-based line number. Invalid line numbers return an empty string.",
			"arguments": {
				"TEXT": {
					"type": "STRING",
					"defaultValue": "first line\nsecond line"
				},
				"LINE": {
					"type": "NUMBER",
					"defaultValue": 1
				}
			}
		},
		{
			"opcode": "linesJson",
			"blockType": "REPORTER",
			"text": "lines of [TEXT] as JSON",
			"description": "Returns every line as a JSON array of strings, with as many items as the line count.",
			"arguments": { "TEXT": {
				"type": "STRING",
				"defaultValue": "first line\nsecond line"
			} }
		},
		{
			"opcode": "writeLinesToList",
			"blockType": "COMMAND",
			"text": "put lines of [TEXT] into list [LIST]",
			"description": "Replaces the contents of the named Scratch list with the lines of the supplied text.",
			"arguments": {
				"TEXT": {
					"type": "STRING",
					"defaultValue": "first line\nsecond line"
				},
				"LIST": {
					"type": "STRING",
					"menu": "LIST_MENU"
				}
			}
		}
	]
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
//#region src/extension.ts
var BLOCK_ICON_URI = extensionConfig.blockIconURI;
var blockDefinitions = block_definitions_default.blocks;
var TextLinesExtension = class {
	constructor() {
		_defineProperty(this, "fixedInputs", fixedInputRegistration(typeof Scratch === "undefined" ? void 0 : Scratch));
	}
	dispose() {
		this.fixedInputs.dispose();
	}
	getInfo() {
		this.fixedInputs.ensure(blockDefinitions.map((block) => `${extensionConfig.id}_${block.opcode}`));
		const translate = Scratch.translate;
		return {
			id: extensionConfig.id,
			name: translate(block_definitions_default.extensionName),
			docsURI: extensionConfig.docsURI,
			blockIconURI: BLOCK_ICON_URI,
			color1: extensionConfig.color1,
			blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
			menus: { LIST_MENU: {
				acceptReporters: true,
				items: "getLists"
			} }
		};
	}
	getLists() {
		const stage = Scratch.vm.runtime.getTargetForStage();
		const editingTarget = Scratch.vm.editingTarget;
		const lists = [...stage ? Object.values(stage.variables) : [], ...editingTarget && editingTarget !== stage ? Object.values(editingTarget.variables) : []].filter((variable) => variable.type === "list");
		if (lists.length === 0) return [""];
		return lists.map((list) => ({
			text: list.name,
			value: list.id
		}));
	}
	lineCount(args) {
		return splitLines(Scratch.Cast.toString(args.TEXT)).length;
	}
	lineAt(args) {
		const lines = splitLines(Scratch.Cast.toString(args.TEXT));
		const line = Math.trunc(Scratch.Cast.toNumber(args.LINE));
		if (!Number.isFinite(line) || line < 1 || line > lines.length) return "";
		return lines[line - 1] ?? "";
	}
	linesJson(args) {
		return JSON.stringify(splitLines(Scratch.Cast.toString(args.TEXT)));
	}
	writeLinesToList(args, util) {
		const listIdOrName = Scratch.Cast.toString(args.LIST);
		const stage = Scratch.vm.runtime.getTargetForStage();
		const variable = util.target.lookupVariableById(listIdOrName) ?? stage?.lookupVariableById(listIdOrName) ?? util.target.lookupVariableByNameAndType(listIdOrName, "list") ?? stage?.lookupVariableByNameAndType(listIdOrName, "list");
		if (!variable || variable.type !== "list") throw new Error(`List not found: ${listIdOrName}`);
		variable.value = splitLines(Scratch.Cast.toString(args.TEXT));
		variable._monitorUpToDate = false;
	}
	toScratchBlock(block) {
		return {
			opcode: block.opcode,
			blockType: Scratch.BlockType[block.blockType],
			text: Scratch.translate(block.text),
			arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, Object.fromEntries(Object.entries({
				type: Scratch.ArgumentType[argument.type],
				defaultValue: argument.defaultValue,
				menu: argument.menu
			}).filter(([, value]) => value !== void 0))]))
		};
	}
};
function splitLines(text) {
	return text.split(/\r\n|\n|\r/);
}
//#endregion
//#region src/index.ts
if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed to write to Scratch lists.`);
Scratch.extensions.register(new TextLinesExtension());
//#endregion

})(Scratch);
