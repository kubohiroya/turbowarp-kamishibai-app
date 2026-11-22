// Name: Teachable Machine
// ID: kubohiroyatm
// Description: Use Teachable Machine pose, image, or audio models for recognition in TurboWarp.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyatm",
	slug: "teachable-machine",
	name: "Teachable Machine",
	description: "Use Teachable Machine pose, image, or audio models for recognition in TurboWarp.",
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: true,
	blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><circle cx=\"24\" cy=\"15\" r=\"4\" fill=\"#4C97FF\"/><path d=\"M24 20v10M24 23l-7 4M24 23l7 4M24 30l-5 9M24 30l5 9\" fill=\"none\" stroke=\"#4C97FF\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M9 15V9h6M39 15V9h-6M9 33v6h6M39 33v6h-6\" fill=\"none\" stroke=\"#59C059\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>")}`
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
	$id: "https://kubohiroya.github.io/turbowarp-teachable-machine/schemas/block-editor-fixed-inputs.schema.json",
	title: "turbowarp-teachable-machine fixed input registration schema",
	$defs: {
		"setRecognitionMode": {
			"type": "object",
			"properties": { "MODE": {
				"type": "string",
				"enum": [
					"pose",
					"image",
					"audio"
				]
			} }
		},
		"setComputeMode": {
			"type": "object",
			"properties": { "MODE": {
				"type": "string",
				"enum": [
					"auto",
					"webgpu",
					"webgl",
					"wasm",
					"cpu"
				]
			} }
		},
		"setPreviewOpacity": {
			"type": "object",
			"properties": { "OPACITY": {
				"type": "number",
				"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
			} }
		},
		"setPreviewPosition": {
			"type": "object",
			"properties": { "POSITION": {
				"type": "string",
				"enum": [
					"top-left",
					"top-right",
					"bottom-left",
					"bottom-right",
					"center",
					"full-stage"
				]
			} }
		},
		"setPreviewMirroring": {
			"type": "object",
			"properties": { "MIRRORING": {
				"type": "string",
				"enum": ["mirrored", "unmirrored"]
			} }
		},
		"setPoseOverlayVisibility": {
			"type": "object",
			"properties": { "VISIBILITY": {
				"type": "string",
				"enum": ["on", "off"]
			} }
		},
		"setPoseJointStyle": {
			"type": "object",
			"properties": {
				"PART": {
					"type": "string",
					"enum": [
						"nose",
						"leftEye",
						"rightEye",
						"leftEar",
						"rightEar",
						"leftShoulder",
						"rightShoulder",
						"leftElbow",
						"rightElbow",
						"leftWrist",
						"rightWrist",
						"leftHip",
						"rightHip",
						"leftKnee",
						"rightKnee",
						"leftAnkle",
						"rightAnkle"
					]
				},
				"OPACITY": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				},
				"RADIUS": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				}
			}
		},
		"setPoseBoneStyle": {
			"type": "object",
			"properties": {
				"OPACITY": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				},
				"WIDTH": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				}
			}
		},
		"setPoseOverlayMinimumConfidence": {
			"type": "object",
			"properties": { "CONFIDENCE": {
				"type": "number",
				"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
			} }
		},
		"setPoseConfidenceScaling": {
			"type": "object",
			"properties": {
				"PROPERTY": {
					"type": "string",
					"enum": [
						"joint-opacity",
						"joint-radius",
						"bone-opacity",
						"bone-width"
					]
				},
				"STATE": {
					"type": "string",
					"enum": ["on", "off"]
				}
			}
		},
		"setAccumulatedPoseParameters": {
			"type": "object",
			"properties": {
				"ACCUMULATION": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				},
				"DECAY": {
					"type": "number",
					"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
				}
			}
		},
		"setAccumulatedPoseThreshold": {
			"type": "object",
			"properties": { "THRESHOLD": {
				"type": "number",
				"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
			} }
		},
		"isPoseWithThreshold": {
			"type": "object",
			"properties": { "THRESHOLD": {
				"type": "number",
				"$comment": "New finite numeric input uses NP-finite-new-input-v1. Existing raw is preserved on no-op; runtime clamp/floor is not applied to stored raw."
			} }
		}
	}
};
//#endregion
//#region src/fixed-input-schema.ts
/** Owner canonical fragments, distinct from older SOURCE/editor schemas. */
function fixedInputBundle(opcode, argument) {
	const source = {
		repository: "turbowarp-teachable-machine",
		path: "schemas/block-editor-fixed-inputs.schema.json",
		symbol: `#/$defs/${opcode}/properties/${argument}`
	};
	const fragment = block_editor_fixed_inputs_schema_default.$defs[opcode].properties[argument];
	return {
		identity: {
			ownerId: "turbowarp-teachable-machine",
			contractId: "fixed-inputs",
			revision: "1",
			variantId: `${opcode}.${argument}`
		},
		dialect: "2020-12",
		root: {
			retrievalUri: block_editor_fixed_inputs_schema_default.$id,
			document: fragment,
			artifact: {
				role: "canonical-schema",
				source
			}
		},
		resources: [],
		provenance: {
			canonicalSources: [source, {
				repository: "turbowarp-teachable-machine",
				path: "src/extension.ts",
				symbol: opcode
			}],
			generatedFiles: [],
			referenceSchemas: [],
			generationSources: []
		}
	};
}
block_editor_fixed_inputs_schema_default.$defs;
//#endregion
//#region src/fixed-input-editors.ts
var existingNumber = (value) => {
	if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && value.trim() === "") throw new TypeError("Expected a numeric literal.");
	const number = Number(value);
	if (!Number.isFinite(number)) throw new TypeError("Expected a finite number.");
	return number;
};
var newNumber = (value) => {
	const parsed = parseFixedNumberInput(value);
	if (parsed.kind !== "valid") throw new TypeError("Invalid new numeric input.");
	return parsed.token;
};
var aliases = {
	"setRecognitionMode.MODE": {
		"pose": "pose",
		"poses": "pose",
		"body": "pose",
		"image": "image",
		"images": "image",
		"object": "image",
		"card": "image",
		"marker": "image",
		"audio": "audio",
		"sound": "audio",
		"voice": "audio",
		"microphone": "audio",
		"mic": "audio",
		"ポーズ": "pose",
		"姿勢": "pose",
		"画像": "image",
		"物体": "image",
		"カード": "image",
		"記号": "image",
		"音声": "audio",
		"音": "audio",
		"声": "audio",
		"マイク": "audio"
	},
	"setPreviewPosition.POSITION": {
		"左上": "top-left",
		"右上": "top-right",
		"左下": "bottom-left",
		"右下": "bottom-right",
		"中央": "center",
		"ステージ全体": "full-stage",
		"top-left": "top-left",
		"top-right": "top-right",
		"bottom-left": "bottom-left",
		"bottom-right": "bottom-right",
		"center": "center",
		"full-stage": "full-stage"
	},
	"setPreviewMirroring.MIRRORING": {
		"mirrored": "mirrored",
		"unmirrored": "unmirrored",
		"mirror": "mirrored",
		"normal": "unmirrored",
		"左右反転": "mirrored",
		"そのまま": "unmirrored"
	},
	"setPoseOverlayVisibility.VISIBILITY": {
		"on": "on",
		"off": "off",
		"show": "on",
		"hide": "off",
		"true": "on",
		"false": "off",
		"表示": "on",
		"非表示": "off"
	},
	"setPoseConfidenceScaling.STATE": {
		"on": "on",
		"off": "off",
		"show": "on",
		"hide": "off",
		"true": "on",
		"false": "off",
		"表示": "on",
		"非表示": "off"
	},
	"setComputeMode.MODE": {
		"auto": "auto",
		"automatic": "auto",
		"default": "auto",
		"fastest": "auto",
		"自動": "auto",
		"おまかせ": "auto",
		"webgpu": "webgpu",
		"gpu": "webgpu",
		"webgl": "webgl",
		"wasm": "wasm",
		"webassembly": "wasm",
		"simd": "wasm",
		"cpu": "cpu",
		"javascript": "cpu"
	}
};
function binding(opcode, argument, values) {
	return {
		argument,
		schemaBundle: fixedInputBundle(opcode, argument),
		control: values ? {
			kind: "enum",
			choices: values.map((value) => ({ value }))
		} : { kind: "number" },
		read(value) {
			if (!values) return existingNumber(value);
			if (typeof value !== "string") throw new TypeError("Expected a string.");
			return projectEnum(opcode, argument, value);
		},
		encode(value) {
			if (!values) return newNumber(value);
			if (typeof value !== "string" || !values.includes(value)) throw new TypeError("Invalid selection.");
			return value;
		},
		validateCandidate(value) {
			try {
				if (!values) existingNumber(value);
				else if (typeof value !== "string" || !values.includes(value)) throw new TypeError("Invalid selection.");
				return [];
			} catch {
				return [{ message: "Invalid fixed input." }];
			}
		}
	};
}
function projectEnum(opcode, argument, value) {
	const key = `${opcode}.${argument}`;
	const token = argument === "POSITION" ? value : value.trim().toLowerCase();
	return aliases[key]?.[token] ?? value;
}
var fixedInputEditors = [
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setRecognitionMode",
		opcodes: ["kubohiroyatm_setRecognitionMode"],
		contractId: "turbowarp-teachable-machine/setRecognitionMode",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setRecognitionMode", "MODE", [
			"pose",
			"image",
			"audio"
		])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setComputeMode",
		opcodes: ["kubohiroyatm_setComputeMode"],
		contractId: "turbowarp-teachable-machine/setComputeMode",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setComputeMode", "MODE", [
			"auto",
			"webgpu",
			"webgl",
			"wasm",
			"cpu"
		])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPreviewOpacity",
		opcodes: ["kubohiroyatm_setPreviewOpacity"],
		contractId: "turbowarp-teachable-machine/setPreviewOpacity",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPreviewOpacity", "OPACITY")]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPreviewPosition",
		opcodes: ["kubohiroyatm_setPreviewPosition"],
		contractId: "turbowarp-teachable-machine/setPreviewPosition",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPreviewPosition", "POSITION", [
			"top-left",
			"top-right",
			"bottom-left",
			"bottom-right",
			"center",
			"full-stage"
		])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPreviewMirroring",
		opcodes: ["kubohiroyatm_setPreviewMirroring"],
		contractId: "turbowarp-teachable-machine/setPreviewMirroring",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPreviewMirroring", "MIRRORING", ["mirrored", "unmirrored"])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPoseOverlayVisibility",
		opcodes: ["kubohiroyatm_setPoseOverlayVisibility"],
		contractId: "turbowarp-teachable-machine/setPoseOverlayVisibility",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPoseOverlayVisibility", "VISIBILITY", ["on", "off"])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPoseJointStyle",
		opcodes: ["kubohiroyatm_setPoseJointStyle"],
		contractId: "turbowarp-teachable-machine/setPoseJointStyle",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [
			binding("setPoseJointStyle", "PART", [
				"nose",
				"leftEye",
				"rightEye",
				"leftEar",
				"rightEar",
				"leftShoulder",
				"rightShoulder",
				"leftElbow",
				"rightElbow",
				"leftWrist",
				"rightWrist",
				"leftHip",
				"rightHip",
				"leftKnee",
				"rightKnee",
				"leftAnkle",
				"rightAnkle"
			]),
			binding("setPoseJointStyle", "OPACITY"),
			binding("setPoseJointStyle", "RADIUS")
		]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPoseBoneStyle",
		opcodes: ["kubohiroyatm_setPoseBoneStyle"],
		contractId: "turbowarp-teachable-machine/setPoseBoneStyle",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPoseBoneStyle", "OPACITY"), binding("setPoseBoneStyle", "WIDTH")]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPoseOverlayMinimumConfidence",
		opcodes: ["kubohiroyatm_setPoseOverlayMinimumConfidence"],
		contractId: "turbowarp-teachable-machine/setPoseOverlayMinimumConfidence",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPoseOverlayMinimumConfidence", "CONFIDENCE")]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setPoseConfidenceScaling",
		opcodes: ["kubohiroyatm_setPoseConfidenceScaling"],
		contractId: "turbowarp-teachable-machine/setPoseConfidenceScaling",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setPoseConfidenceScaling", "PROPERTY", [
			"joint-opacity",
			"joint-radius",
			"bone-opacity",
			"bone-width"
		]), binding("setPoseConfidenceScaling", "STATE", ["on", "off"])]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setAccumulatedPoseParameters",
		opcodes: ["kubohiroyatm_setAccumulatedPoseParameters"],
		contractId: "turbowarp-teachable-machine/setAccumulatedPoseParameters",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setAccumulatedPoseParameters", "ACCUMULATION"), binding("setAccumulatedPoseParameters", "DECAY")]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-setAccumulatedPoseThreshold",
		opcodes: ["kubohiroyatm_setAccumulatedPoseThreshold"],
		contractId: "turbowarp-teachable-machine/setAccumulatedPoseThreshold",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("setAccumulatedPoseThreshold", "THRESHOLD")]
	},
	{
		apiVersion: 1,
		extensionId: "kubohiroyatm",
		editorId: "fixed-isPoseWithThreshold",
		opcodes: ["kubohiroyatm_isPoseWithThreshold"],
		contractId: "turbowarp-teachable-machine/isPoseWithThreshold",
		contractRevision: "1",
		validationContext: () => ({
			consumerId: "turbowarp-teachable-machine",
			nowMs: 0,
			settings: null
		}),
		bindings: [binding("isPoseWithThreshold", "THRESHOLD")]
	}
];
/**
* Register only currently declared opcodes; release obsolete feature-flag scopes.
* Loading a project disposes the runtime, which releases the registrations, but the extension
* stays loaded for the next project: they are registered again once that project has loaded.
* Only the owner's dispose is final.
*/
function fixedInputRegistration(scratch) {
	const host = typeof scratch === "object" && scratch !== null ? scratch : {};
	let active;
	let activeOpcodes = "";
	const removers = [];
	let disposed = false;
	let released = false;
	let requested = [];
	const dispose = () => {
		host.vm?.runtime?.off?.("RUNTIME_DISPOSED", release);
		host.vm?.runtime?.off?.("PROJECT_LOADED", restore);
		for (const remove of removers.splice(0).reverse()) remove();
		active = void 0;
		activeOpcodes = "";
	};
	const register = (opcodes) => {
		const api = host.gui?.blockEditors;
		const signature = [...new Set(opcodes)].sort().join("\0");
		if (api === active && signature === activeOpcodes) return;
		dispose();
		if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return;
		try {
			for (const definition of fixedInputEditors) if (definition.opcodes.every((opcode) => opcodes.includes(opcode))) {
				const remove = api.registerFixedInputEditor.call(api, definition);
				if (typeof remove !== "function") throw new TypeError("Invalid fixed registration cleanup.");
				removers.push(remove);
			}
			active = api;
			activeOpcodes = signature;
			host.vm?.runtime?.on?.("RUNTIME_DISPOSED", release);
		} catch (error) {
			dispose();
			throw error;
		}
	};
	/** The runtime of this project is gone; wait for the next project before registering again. */
	const release = () => {
		dispose();
		released = true;
		host.vm?.runtime?.on?.("PROJECT_LOADED", restore);
	};
	const restore = () => {
		if (disposed || !released) return;
		released = false;
		try {
			register(requested);
		} catch {}
	};
	const shutdown = () => {
		disposed = true;
		released = false;
		dispose();
	};
	return {
		ensure(opcodes) {
			requested = opcodes;
			if (disposed || released) return;
			register(opcodes);
		},
		dispose: shutdown
	};
}
var block_definitions_default = {
	extensionName: "Teachable Machine",
	blocks: [
		{
			"opcode": "versionReporter",
			"blockType": "REPORTER",
			"text": "Teachable Machine version",
			"description": "Returns the extension version."
		},
		{
			"opcode": "setRecognitionMode",
			"blockType": "COMMAND",
			"text": "set recognition mode to [MODE]",
			"description": "Selects whether the current Teachable Machine model recognizes poses, images, or audio.",
			"arguments": { "MODE": {
				"type": "STRING",
				"menu": "recognitionModeMenu",
				"defaultValue": "pose"
			} }
		},
		{
			"opcode": "recognitionModeReporter",
			"blockType": "REPORTER",
			"text": "recognition mode",
			"description": "Returns the current recognition mode."
		},
		{
			"opcode": "setComputeMode",
			"blockType": "COMMAND",
			"text": "set compute mode to [MODE]",
			"description": "Selects the TensorFlow.js compute backend. \"auto\" negotiates WebGPU, WebGL, WASM, and CPU in that order and falls back automatically when a backend is unusable. Changing the mode releases a model that was loaded from a URL so it can be reloaded on the new backend.",
			"arguments": { "MODE": {
				"type": "STRING",
				"menu": "computeModeMenu",
				"defaultValue": "auto"
			} }
		},
		{
			"opcode": "computeModeReporter",
			"blockType": "REPORTER",
			"text": "compute mode",
			"description": "Returns the requested compute mode."
		},
		{
			"opcode": "computeBackendReporter",
			"blockType": "REPORTER",
			"text": "active compute backend",
			"description": "Returns the TensorFlow.js backend recognition is actually running on, which can differ from the requested mode when the browser could not provide it."
		},
		{
			"opcode": "setModelURL",
			"blockType": "COMMAND",
			"text": "set model URL to [URL]",
			"description": "Sets the Teachable Machine model URL.",
			"arguments": { "URL": {
				"type": "STRING",
				"defaultValue": "https://teachablemachine.withgoogle.com/models/XXXX/"
			} }
		},
		{
			"opcode": "startCamera",
			"blockType": "COMMAND",
			"text": "start camera",
			"description": "Starts the camera and attaches the preview."
		},
		{
			"opcode": "stopCamera",
			"blockType": "COMMAND",
			"text": "stop camera",
			"description": "Stops the camera and recognition loop."
		},
		{
			"opcode": "isCameraRunning",
			"blockType": "BOOLEAN",
			"text": "camera is running?",
			"description": "Reports whether the camera is running."
		},
		{
			"opcode": "refreshCameraList",
			"blockType": "COMMAND",
			"text": "refresh camera list",
			"description": "Refreshes the list of available video input devices."
		},
		{
			"opcode": "setCameraSelection",
			"blockType": "COMMAND",
			"text": "set camera to [CAMERA]",
			"description": "Selects the default, front, back, or a detected camera and switches a running camera.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"menu": "cameraMenu",
				"defaultValue": "default"
			} }
		},
		{
			"opcode": "cameraCountReporter",
			"blockType": "REPORTER",
			"text": "camera count",
			"description": "Returns the number of video input devices found by the latest refresh."
		},
		{
			"opcode": "cameraDeviceIdReporter",
			"blockType": "REPORTER",
			"text": "camera device ID",
			"description": "Returns the active camera device ID when available."
		},
		{
			"opcode": "cameraDeviceNameReporter",
			"blockType": "REPORTER",
			"text": "camera device name",
			"description": "Returns the active camera device name when available."
		},
		{
			"opcode": "showPreview",
			"blockType": "COMMAND",
			"text": "show camera preview",
			"description": "Shows the camera preview."
		},
		{
			"opcode": "hidePreview",
			"blockType": "COMMAND",
			"text": "hide camera preview",
			"description": "Hides the camera preview."
		},
		{
			"opcode": "isPreviewVisible",
			"blockType": "BOOLEAN",
			"text": "camera preview is visible?",
			"description": "Reports whether the preview is configured as visible."
		},
		{
			"opcode": "setPreviewOpacity",
			"blockType": "COMMAND",
			"text": "set camera preview opacity to [OPACITY]",
			"description": "Sets preview opacity from 0 to 1.",
			"arguments": { "OPACITY": {
				"type": "NUMBER",
				"defaultValue": .6
			} }
		},
		{
			"opcode": "setPreviewPosition",
			"blockType": "COMMAND",
			"text": "set camera preview position to [POSITION]",
			"description": "Sets the preview position on the stage.",
			"arguments": { "POSITION": {
				"type": "STRING",
				"menu": "positionMenu",
				"defaultValue": "bottom-right"
			} }
		},
		{
			"opcode": "setPreviewMirroring",
			"blockType": "COMMAND",
			"text": "set camera preview to [MIRRORING]",
			"description": "Sets whether the preview is mirrored without changing the recognition input.",
			"arguments": { "MIRRORING": {
				"type": "STRING",
				"menu": "previewMirroringMenu",
				"defaultValue": "mirrored"
			} }
		},
		{
			"opcode": "previewMirroringReporter",
			"blockType": "REPORTER",
			"text": "camera preview mirroring",
			"description": "Returns mirrored or unmirrored for the current preview setting."
		},
		{
			"opcode": "setPoseOverlayVisibility",
			"blockType": "COMMAND",
			"text": "set pose overlay [VISIBILITY]",
			"description": "Shows or hides the SVG pose overlay without stopping recognition.",
			"featureFlag": "poseOverlay",
			"arguments": { "VISIBILITY": {
				"type": "STRING",
				"menu": "poseOverlayVisibilityMenu",
				"defaultValue": "on"
			} }
		},
		{
			"opcode": "isPoseOverlayVisible",
			"blockType": "BOOLEAN",
			"text": "pose overlay is visible?",
			"description": "Reports whether the SVG pose overlay is configured as visible.",
			"featureFlag": "poseOverlay"
		},
		{
			"opcode": "setPoseJointStyle",
			"blockType": "COMMAND",
			"text": "set [PART] joint color [COLOR] opacity [OPACITY] radius [RADIUS]",
			"description": "Sets the SVG circle style for one PoseNet joint.",
			"featureFlag": "poseOverlay",
			"arguments": {
				"PART": {
					"type": "STRING",
					"menu": "poseKeypointMenu",
					"defaultValue": "nose"
				},
				"COLOR": {
					"type": "STRING",
					"defaultValue": "#00e5ff"
				},
				"OPACITY": {
					"type": "NUMBER",
					"defaultValue": 1
				},
				"RADIUS": {
					"type": "NUMBER",
					"defaultValue": 4
				}
			}
		},
		{
			"opcode": "setPoseBoneStyle",
			"blockType": "COMMAND",
			"text": "set pose bone color [COLOR] opacity [OPACITY] width [WIDTH]",
			"description": "Sets the color, opacity, and line width for all SVG pose bones.",
			"featureFlag": "poseOverlay",
			"arguments": {
				"COLOR": {
					"type": "STRING",
					"defaultValue": "#00e5ff"
				},
				"OPACITY": {
					"type": "NUMBER",
					"defaultValue": .9
				},
				"WIDTH": {
					"type": "NUMBER",
					"defaultValue": 3
				}
			}
		},
		{
			"opcode": "setPoseOverlayMinimumConfidence",
			"blockType": "COMMAND",
			"text": "set pose overlay minimum confidence to [CONFIDENCE]",
			"description": "Hides joints and bones whose keypoint confidence is below the given value.",
			"featureFlag": "poseOverlay",
			"arguments": { "CONFIDENCE": {
				"type": "NUMBER",
				"defaultValue": .5
			} }
		},
		{
			"opcode": "setPoseConfidenceScaling",
			"blockType": "COMMAND",
			"text": "set pose [PROPERTY] confidence scaling [STATE]",
			"description": "Scales the selected SVG style property from zero to its configured value using keypoint confidence.",
			"featureFlag": "poseOverlay",
			"arguments": {
				"PROPERTY": {
					"type": "STRING",
					"menu": "poseConfidencePropertyMenu",
					"defaultValue": "joint-opacity"
				},
				"STATE": {
					"type": "STRING",
					"menu": "poseOverlayVisibilityMenu",
					"defaultValue": "off"
				}
			}
		},
		{
			"opcode": "loadModel",
			"blockType": "COMMAND",
			"text": "load model",
			"description": "Loads the configured Teachable Machine model."
		},
		{
			"opcode": "isModelLoaded",
			"blockType": "BOOLEAN",
			"text": "model is loaded?",
			"description": "Reports whether the model is loaded."
		},
		{
			"opcode": "startRecognition",
			"blockType": "COMMAND",
			"text": "start recognition",
			"description": "Starts recognition."
		},
		{
			"opcode": "stopRecognition",
			"blockType": "COMMAND",
			"text": "stop recognition",
			"description": "Stops recognition."
		},
		{
			"opcode": "isRecognizing",
			"blockType": "BOOLEAN",
			"text": "recognition is running?",
			"description": "Reports whether recognition is running."
		},
		{
			"opcode": "currentPoseReporter",
			"blockType": "REPORTER",
			"text": "current label",
			"description": "Returns the highest-scoring label."
		},
		{
			"opcode": "scoreReporter",
			"blockType": "REPORTER",
			"text": "confidence",
			"description": "Returns the confidence of the current label."
		},
		{
			"opcode": "poseScoreReporter",
			"blockType": "REPORTER",
			"text": "confidence of [NAME]",
			"description": "Returns the confidence for a named label.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "jump"
			} }
		},
		{
			"opcode": "setAccumulatedPoseParameters",
			"blockType": "COMMAND",
			"text": "set accumulated pose accumulation [ACCUMULATION] decay [DECAY]",
			"description": "Sets the accumulation rate per second and the decay retained per second; decay changes apply to the next recognition session.",
			"featureFlag": "temporalPoseScoring",
			"arguments": {
				"ACCUMULATION": {
					"type": "NUMBER",
					"defaultValue": 1
				},
				"DECAY": {
					"type": "NUMBER",
					"defaultValue": .9
				}
			}
		},
		{
			"opcode": "setAccumulatedPoseThreshold",
			"blockType": "COMMAND",
			"text": "set accumulated pose threshold [THRESHOLD]",
			"description": "Sets the minimum accumulated score required to report a pose; values below the threshold report an empty string.",
			"featureFlag": "temporalPoseScoring",
			"arguments": { "THRESHOLD": {
				"type": "NUMBER",
				"defaultValue": 0
			} }
		},
		{
			"opcode": "resetAccumulatedPose",
			"blockType": "COMMAND",
			"text": "reset accumulated pose scores",
			"description": "Clears all accumulated pose scores.",
			"featureFlag": "temporalPoseScoring"
		},
		{
			"opcode": "accumulatedPoseReporter",
			"blockType": "REPORTER",
			"text": "accumulated pose",
			"description": "Returns the pose label whose accumulated score is highest and meets the threshold, or an empty string otherwise.",
			"featureFlag": "temporalPoseScoring"
		},
		{
			"opcode": "accumulatedScoreReporter",
			"blockType": "REPORTER",
			"text": "accumulated score",
			"description": "Returns the highest accumulated pose score without rounding.",
			"featureFlag": "temporalPoseScoring"
		},
		{
			"opcode": "accumulatedPoseScoreReporter",
			"blockType": "REPORTER",
			"text": "accumulated score of [NAME]",
			"description": "Returns the accumulated score for a named pose without rounding.",
			"featureFlag": "temporalPoseScoring",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "jump"
			} }
		},
		{
			"opcode": "isPose",
			"blockType": "BOOLEAN",
			"text": "label is [NAME]?",
			"description": "Reports whether the named label has at least 0.75 confidence.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "jump"
			} }
		},
		{
			"opcode": "isPoseWithThreshold",
			"blockType": "BOOLEAN",
			"text": "label is [NAME] with confidence at least [THRESHOLD]?",
			"description": "Reports whether the named label meets the given threshold.",
			"arguments": {
				"NAME": {
					"type": "STRING",
					"defaultValue": "jump"
				},
				"THRESHOLD": {
					"type": "NUMBER",
					"defaultValue": .75
				}
			}
		},
		{
			"opcode": "cameraMsReporter",
			"blockType": "REPORTER",
			"text": "camera startup time (ms)",
			"description": "Returns camera startup time in milliseconds."
		},
		{
			"opcode": "modelLoadMsReporter",
			"blockType": "REPORTER",
			"text": "model load time (ms)",
			"description": "Returns model load time in milliseconds."
		},
		{
			"opcode": "firstRecognitionMsReporter",
			"blockType": "REPORTER",
			"text": "first recognition time (ms)",
			"description": "Returns first recognition time in milliseconds."
		},
		{
			"opcode": "lastErrorReporter",
			"blockType": "REPORTER",
			"text": "last error",
			"description": "Returns the latest recorded error message."
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
//#region src/compute-backend.ts
/**
* Compute backend negotiation for the reviewed TensorFlow.js runtime.
*
* TensorFlow.js binds every tensor to the backend that was active when the
* tensor was created, so the backend has to be settled before a Teachable
* Machine model is loaded. This module keeps the ordering and fallback rules
* free of any TensorFlow.js or DOM dependency so they stay testable.
*/
var COMPUTE_MODES = [
	"auto",
	"webgpu",
	"webgl",
	"wasm",
	"cpu"
];
Object.freeze([
	"webgpu",
	"webgl",
	"wasm",
	"cpu"
]);
var COMPUTE_MODE_ALIASES = Object.freeze({
	auto: "auto",
	automatic: "auto",
	default: "auto",
	fastest: "auto",
	自動: "auto",
	おまかせ: "auto",
	webgpu: "webgpu",
	gpu: "webgpu",
	webgl: "webgl",
	wasm: "wasm",
	webassembly: "wasm",
	simd: "wasm",
	cpu: "cpu",
	javascript: "cpu"
});
function normalizeComputeMode(value, fallback = "auto") {
	const text = String(value ?? "").trim().toLowerCase();
	if (text === "") return fallback;
	return COMPUTE_MODE_ALIASES[text] ?? fallback;
}
//#endregion
//#region src/config/feature-flags.ts
var FEATURE_FLAGS = {
	/**
	* Per-frame confidence flickers near a decision boundary, so the accumulated
	* score blocks — which integrate confidence over time and decay it — are the
	* built-in answer to a noisy recognition result. They are on by default; the
	* event bridge that republishes those changes to other extensions is not.
	*/
	temporalPoseScoring: true,
	accumulatedPoseEvents: false,
	poseOverlay: true
};
//#endregion
//#region src/pose-overlay.ts
var POSE_KEYPOINT_NAMES = [
	"nose",
	"leftEye",
	"rightEye",
	"leftEar",
	"rightEar",
	"leftShoulder",
	"rightShoulder",
	"leftElbow",
	"rightElbow",
	"leftWrist",
	"rightWrist",
	"leftHip",
	"rightHip",
	"leftKnee",
	"rightKnee",
	"leftAnkle",
	"rightAnkle"
];
var POSE_BONE_CONNECTIONS = Object.freeze([
	["leftHip", "leftShoulder"],
	["leftElbow", "leftShoulder"],
	["leftElbow", "leftWrist"],
	["leftHip", "leftKnee"],
	["leftKnee", "leftAnkle"],
	["rightHip", "rightShoulder"],
	["rightElbow", "rightShoulder"],
	["rightElbow", "rightWrist"],
	["rightHip", "rightKnee"],
	["rightKnee", "rightAnkle"],
	["leftShoulder", "rightShoulder"],
	["leftHip", "rightHip"]
]);
var DEFAULT_POSE_JOINT_STYLE = Object.freeze({
	color: "#00e5ff",
	opacity: 1,
	radius: 4
});
var DEFAULT_POSE_BONE_STYLE = Object.freeze({
	color: "#00e5ff",
	opacity: .9,
	width: 3
});
var DEFAULT_POSE_OVERLAY_CONFIDENCE_SCALING = Object.freeze({
	jointOpacity: false,
	jointRadius: false,
	boneOpacity: false,
	boneWidth: false
});
function isPoseKeypointName(value) {
	return POSE_KEYPOINT_NAMES.includes(value);
}
function confidenceMultiplier(value) {
	const confidence = Number(value);
	if (!Number.isFinite(confidence)) return 0;
	return Math.max(0, Math.min(1, confidence));
}
var package_default = {
	name: "@kubohiroya/turbowarp-teachable-machine",
	version: "4.4.0",
	description: "A TurboWarp extension for recognition using Teachable Machine pose, image, and audio models.",
	author: {
		"name": "Hiroya Kubo",
		"email": "hiroya@cuc.ac.jp",
		"url": "https://github.com/kubohiroya"
	},
	license: "MPL-2.0",
	homepage: "https://github.com/kubohiroya/turbowarp-teachable-machine#readme",
	repository: {
		"type": "git",
		"url": "git+https://github.com/kubohiroya/turbowarp-teachable-machine.git"
	},
	bugs: { "url": "https://github.com/kubohiroya/turbowarp-teachable-machine/issues" },
	exports: {
		"./composition": {
			"types": "./dist/types/composition.d.ts",
			"import": "./dist/composition.js"
		},
		"./posenet": {
			"types": "./dist/types/posenet.d.ts",
			"import": "./dist/posenet.js"
		},
		"./posenet-assets/*": "./dist/posenet/mobilenet-v1-075-stride16/*",
		"./wasm-assets/*": "./dist/wasm/*",
		"./dist/backend-wasm.js": "./dist/backend-wasm.js",
		"./dist/backend-webgpu.js": "./dist/backend-webgpu.js",
		"./runtime": "./dist/runtime.js",
		"./dist/teachable-machine.js": "./dist/teachable-machine.js",
		"./package.json": "./package.json",
		"./dist/teachable-machine-webgpu.js": "./dist/teachable-machine-webgpu.js",
		"./dist/teachable-machine-wasm.js": "./dist/teachable-machine-wasm.js"
	},
	type: "module",
	files: [
		"assets/block-icon.svg",
		"dist/",
		"README.md",
		"README.ja.md",
		"LICENSE",
		"THIRD_PARTY_NOTICES.md",
		"schemas/",
		"docs/fixed-input-editors.ja.md"
	],
	unpkg: "./dist/teachable-machine.js",
	jsdelivr: "./dist/teachable-machine.js",
	publishConfig: {
		"access": "public",
		"registry": "https://registry.npmjs.org/"
	},
	packageManager: "pnpm@11.28.8",
	engines: { "node": ">=24" },
	scripts: {
		"dev": "vite build --watch",
		"typecheck": "tsc --noEmit",
		"build": "pnpm build:extension && pnpm build:standalone && pnpm build:composition && pnpm build:runtime && pnpm build:backends && pnpm build:posenet && pnpm build:notices && pnpm build:types",
		"build:extension": "vite build",
		"build:composition": "vite build --config vite.composition.config.ts",
		"build:runtime": "vite build --config vite.runtime.config.ts",
		"build:backends": "vite build --config vite.backend-wasm.config.ts && vite build --config vite.backend-webgpu.config.ts && node scripts/copy-wasm-assets.ts",
		"build:posenet": "vite build --config vite.posenet.config.ts && node scripts/copy-posenet-assets.ts",
		"build:notices": "node scripts/copy-third-party-notices.ts",
		"build:types": "tsc --project tsconfig.build.json",
		"types:composition:check": "tsc --project tsconfig.composition-consumer.json",
		"types:posenet:check": "tsc --project tsconfig.posenet-consumer.json",
		"test": "vitest run",
		"docs": "node scripts/generate-readme.ts",
		"docs:check": "npm run docs && git diff --exit-code -- README.md",
		"docs:pages:check": "node scripts/check-pages.ts",
		"release:consistency:check": "node scripts/check-release-consistency.ts",
		"check:dist": "npm run build && git diff --exit-code -- dist",
		"archive:check": "node scripts/check-github-archive.ts",
		"pack:check": "npm pack --dry-run --ignore-scripts",
		"release:check": "npm publish --dry-run --access public --tag latest",
		"check": "npm run typecheck && npm run test && npm run build && npm run types:composition:check && npm run types:posenet:check && npm run docs:check && npm run docs:pages:check && npm run release:consistency:check && npm run check:dist && npm run archive:check && npm run pack:check",
		"prepack": "npm run build && npm run release:consistency:check",
		"build:standalone": "vite build --config vite.standalone.config.ts --mode webgpu && vite build --config vite.standalone.config.ts --mode wasm"
	},
	devDependencies: {
		"@kubohiroya/turbowarp-camera-source": "^0.25.0",
		"@kubohiroya/vite-plugin-turbowarp-extension": "^0.11.0",
		"@teachablemachine/image": "0.8.5",
		"@teachablemachine/pose": "0.8.6",
		"@tensorflow-models/posenet": "2.2.2",
		"@tensorflow-models/speech-commands": "0.5.4",
		"@tensorflow/tfjs": "4.22.0",
		"@tensorflow/tfjs-backend-wasm": "4.22.0",
		"@tensorflow/tfjs-backend-webgpu": "4.22.0",
		"@types/node": "^22.20.1",
		"typescript": "^5.9.3",
		"vite": "^8.2.2",
		"vitest": "^4.0.14",
		"@kubohiroya/turbowarp-extension-data-editor": "^0.11.2"
	},
	keywords: [
		"turbowarp",
		"scratch",
		"extension",
		"pose",
		"image",
		"audio",
		"camera",
		"teachable-machine"
	],
	turbowarpExtension: { "resourceDeclaration": {
		"schemaVersion": 1,
		"resources": [
			{
				"type": "camera",
				"usage": "conditional",
				"purpose": {
					"en": "Read frames for image or pose recognition",
					"ja": "画像認識・姿勢認識用に映像を読み取る"
				},
				"condition": {
					"en": "In image or pose recognition mode",
					"ja": "画像・姿勢認識モードを使う場合"
				},
				"via": ["@kubohiroya/turbowarp-camera-source"]
			},
			{
				"type": "microphone",
				"usage": "conditional",
				"purpose": {
					"en": "Read audio segments for sound recognition",
					"ja": "音声認識用にマイクの音声を読み取る"
				},
				"condition": {
					"en": "In audio recognition mode",
					"ja": "音声認識モードを使う場合"
				}
			},
			{
				"type": "network",
				"usage": "conditional",
				"purpose": {
					"en": "Download recognition models and runtime libraries",
					"ja": "認識モデルと実行ライブラリーを取得する"
				},
				"condition": {
					"en": "When loading a model URL or a runtime not already supplied by the host",
					"ja": "モデルURLを読み込む場合、またはホストが未提供の実行ライブラリーを読み込む場合"
				},
				"data": {
					"direction": "download",
					"content": {
						"en": "Model files and runtime libraries; camera frames and microphone audio are not uploaded by this recognition path",
						"ja": "モデルファイルと実行ライブラリー。この認識経路はカメラ映像・マイク音声をアップロードしない"
					}
				}
			}
		]
	} }
};
//#endregion
//#region src/extension.ts
/**
* Where Camera Source puts itself on the VM runtime.
*
* Declared here rather than imported as a value, because this file is bundled into a single-file
* extension and no dependency's code has ever been inlined into it. The key and the member read
* below are pinned against Camera Source's own published constant and narrowing function in the
* tests, which import both and are not shipped, so a rename upstream fails here rather than
* silently reading an absent extension as "not loaded".
*/
var CAMERA_SOURCE_RUNTIME_KEY = "ext_kubohiroyacamerasource";
function readCameraSource(runtime) {
	if (typeof runtime !== "object" || runtime === null) return void 0;
	const candidate = runtime[CAMERA_SOURCE_RUNTIME_KEY];
	if (typeof candidate !== "object" || candidate === null) return void 0;
	const { acquireCamera } = candidate;
	return typeof acquireCamera === "function" ? candidate : void 0;
}
var EXTENSION_ID = "kubohiroyatm";
var VERSION = `${package_default.version}-typescript`;
var DOCS_URI = "https://kubohiroya.github.io/turbowarp-teachable-machine/";
var ACCUMULATED_POSE_CHANGED_EVENT = "TM_ACCUMULATED_POSE_CHANGED";
var BLOCK_ICON_URI = extensionConfig.blockIconURI;
/**
* Put keypoints where the preview shows them: in the camera frame's own space.
*
* The model sees a square centre crop with the pixels mirrored, so a keypoint comes back measured
* from the mirrored square's left edge. Undoing the mirror and adding the crop's offset puts it
* back on the frame, which is what the preview shows and what the overlay's viewBox spans. The
* preview's own mirroring is a CSS transform over both the video and the overlay, so these
* coordinates stay in frame space either way.
*/
function mapKeypointsToFrame(keypoints, crop) {
	if (!Array.isArray(keypoints) || !(crop.size > 0)) return keypoints;
	return keypoints.map((keypoint) => {
		if (typeof keypoint !== "object" || keypoint === null) return keypoint;
		const position = keypoint.position;
		const x = Number(position?.x);
		const y = Number(position?.y);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return keypoint;
		return {
			...keypoint,
			position: {
				...position,
				x: crop.left + (crop.size - x),
				y: crop.top + y
			}
		};
	});
}
var BROWSER_RUNTIME_URL = `https://cdn.jsdelivr.net/npm/${package_default.name}@${package_default.version}/dist/runtime.js`;
var POSITION_ITEMS = [
	{
		text: "top left",
		value: "top-left"
	},
	{
		text: "top right",
		value: "top-right"
	},
	{
		text: "bottom left",
		value: "bottom-left"
	},
	{
		text: "bottom right",
		value: "bottom-right"
	},
	{
		text: "center",
		value: "center"
	},
	{
		text: "full stage",
		value: "full-stage"
	}
];
var POSITION_ALIASES = {
	左上: "top-left",
	右上: "top-right",
	左下: "bottom-left",
	右下: "bottom-right",
	中央: "center",
	ステージ全体: "full-stage",
	"top-left": "top-left",
	"top-right": "top-right",
	"bottom-left": "bottom-left",
	"bottom-right": "bottom-right",
	center: "center",
	"full-stage": "full-stage"
};
var PREVIEW_MIRRORING_ITEMS = [{
	text: "mirrored",
	value: "mirrored"
}, {
	text: "unmirrored",
	value: "unmirrored"
}];
var PREVIEW_MIRRORING_ALIASES = {
	mirrored: true,
	unmirrored: false,
	mirror: true,
	normal: false,
	"左右反転": true,
	"そのまま": false
};
var COMPUTE_MODE_ITEMS = COMPUTE_MODES.map((value) => ({
	text: value,
	value
}));
var RECOGNITION_MODE_ITEMS = [
	{
		text: "pose",
		value: "pose"
	},
	{
		text: "image",
		value: "image"
	},
	{
		text: "audio",
		value: "audio"
	}
];
var RECOGNITION_MODE_ALIASES = {
	pose: "pose",
	poses: "pose",
	body: "pose",
	image: "image",
	images: "image",
	object: "image",
	card: "image",
	marker: "image",
	audio: "audio",
	sound: "audio",
	voice: "audio",
	microphone: "audio",
	mic: "audio",
	"ポーズ": "pose",
	"姿勢": "pose",
	"画像": "image",
	"物体": "image",
	"カード": "image",
	"記号": "image",
	"音声": "audio",
	"音": "audio",
	"声": "audio",
	"マイク": "audio"
};
var POSE_OVERLAY_VISIBILITY_ITEMS = [{
	text: "on",
	value: "on"
}, {
	text: "off",
	value: "off"
}];
var POSE_OVERLAY_VISIBILITY_ALIASES = {
	on: true,
	off: false,
	show: true,
	hide: false,
	true: true,
	false: false,
	表示: true,
	非表示: false
};
var POSE_CONFIDENCE_PROPERTY_ITEMS = [
	{
		text: "joint opacity",
		value: "joint-opacity"
	},
	{
		text: "joint radius",
		value: "joint-radius"
	},
	{
		text: "bone opacity",
		value: "bone-opacity"
	},
	{
		text: "bone width",
		value: "bone-width"
	}
];
var CAMERA_SELECTION_ITEMS = [
	{
		text: "default camera",
		value: "default"
	},
	{
		text: "front camera",
		value: "front"
	},
	{
		text: "back camera",
		value: "back"
	}
];
var CAMERA_SELECTION_ALIASES = {
	default: "default",
	front: "front",
	back: "back",
	user: "front",
	environment: "back",
	"既定": "default",
	"インカメラ": "front",
	"前面カメラ": "front",
	"背面カメラ": "back"
};
var loadingPromises = /* @__PURE__ */ new Map();
function normalizePosition(value) {
	return POSITION_ALIASES[String(value ?? "bottom-right")] ?? "bottom-right";
}
function normalizePreviewMirroring(value) {
	return PREVIEW_MIRRORING_ALIASES[String(value ?? "mirrored").trim().toLowerCase()] ?? true;
}
function normalizeRecognitionMode(value) {
	return RECOGNITION_MODE_ALIASES[String(value ?? "pose").trim().toLowerCase()] ?? "pose";
}
function normalizeCameraSelection(value) {
	const selection = String(value ?? "default").trim();
	const normalized = CAMERA_SELECTION_ALIASES[selection.toLowerCase() || "default"];
	if (normalized === "default" || normalized === "front" || normalized === "back") return {
		kind: "preference",
		value: normalized
	};
	return {
		kind: "device",
		value: selection
	};
}
function normalizePoseOverlayVisibility(value) {
	return POSE_OVERLAY_VISIBILITY_ALIASES[String(value ?? "on").trim().toLowerCase()] ?? true;
}
function normalizePoseStyleNumber(value, fallback, maximum) {
	const number = value === "" ? fallback : Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(0, maximum === void 0 ? number : Math.min(maximum, number));
}
function normalizePoseColor(value, fallback) {
	return String(value ?? "").trim() || fallback;
}
function cameraConstraints(selection) {
	if (selection.kind === "device") return { deviceId: { exact: selection.value } };
	if (selection.value === "front") return { facingMode: { ideal: "user" } };
	if (selection.value === "back") return { facingMode: { ideal: "environment" } };
}
function scriptLoadedFor(src) {
	if (src === BROWSER_RUNTIME_URL) return typeof globalThis.tf !== "undefined" && typeof globalThis.tmPose !== "undefined" && typeof globalThis.tmImage !== "undefined" && typeof globalThis.tmAudio !== "undefined";
	return false;
}
function loadScript(src) {
	if (scriptLoadedFor(src)) return Promise.resolve();
	const active = loadingPromises.get(src);
	if (active) return active;
	const existing = Array.from(document.scripts).find((script) => script.src === src);
	if (existing?.dataset.kubohiroyatmLoaded === "true") return Promise.resolve();
	const promise = new Promise((resolve, reject) => {
		const script = existing ?? document.createElement("script");
		const cleanup = () => {
			script.removeEventListener("load", handleLoad);
			script.removeEventListener("error", handleError);
		};
		const handleLoad = () => {
			cleanup();
			script.dataset.kubohiroyatmLoaded = "true";
			resolve();
		};
		const handleError = () => {
			cleanup();
			loadingPromises.delete(src);
			reject(/* @__PURE__ */ new Error("TM: Failed to load script: " + src));
		};
		script.addEventListener("load", handleLoad, { once: true });
		script.addEventListener("error", handleError, { once: true });
		if (!existing) {
			script.src = src;
			document.head.appendChild(script);
		} else queueMicrotask(() => {
			if (scriptLoadedFor(src)) handleLoad();
		});
	});
	loadingPromises.set(src, promise);
	return promise;
}
function rectanglesIntersect(left, right) {
	return left.right > right.left && left.left < right.right && left.bottom > right.top && left.top < right.bottom;
}
function canvasScore(width, height) {
	if (width <= 0 || height <= 0) return Number.NEGATIVE_INFINITY;
	return width * height / (1 + Math.abs(width / height - 4 / 3) * 4);
}
function isDocumentHidden() {
	return typeof document !== "undefined" && document.visibilityState === "hidden";
}
/**
* Initialize the camera canvas before Teachable Machine or TensorFlow.js requests its context.
* The camera path is independent of the selected compute mode: whichever backend recognition runs
* on, TM intentionally uses the browser's normal Canvas2D context here. Its one-draw/one-read
* camera path does not demonstrate a repeatable end-to-end benefit from forcing a
* readback-optimized context, and the legacy backend parameter remains accepted for compatibility.
*/
function initializeCameraReadbackContext(canvas, _tensorflowBackend) {
	if (typeof canvas !== "object" || canvas === null || typeof canvas.getContext !== "function") throw new Error("TM: Webcam canvas does not provide a 2D context.");
	const context = canvas.getContext("2d");
	if (!context) throw new Error("TM: Webcam canvas 2D context is unavailable.");
	return context;
}
var TMExtension = class {
	constructor(featureFlags = {}, dependencies = {}) {
		_defineProperty(this, "fixedEditors", fixedInputRegistration(typeof Scratch === "undefined" ? void 0 : Scratch));
		this.featureFlags = {
			...FEATURE_FLAGS,
			...featureFlags
		};
		this.tmPoseRuntime = dependencies.poseRuntime ?? dependencies.runtime ?? null;
		this.tmImageRuntime = dependencies.imageRuntime ?? null;
		this.tmAudioRuntime = dependencies.audioRuntime ?? null;
		this.tmComputeRuntime = dependencies.compute ?? null;
		this.computeMode = normalizeComputeMode(dependencies.computeMode);
		this.computeSelection = null;
		this.modelOwnedByExtension = false;
		this.allowRemoteLibraries = dependencies.allowRemoteLibraries ?? true;
		this.onAccumulatedPoseChanged = dependencies.onAccumulatedPoseChanged ?? null;
		this.recognitionMode = "pose";
		this.modelURL = "";
		this.model = null;
		this.webcam = null;
		this.cameraLease = null;
		this.cameraRunning = false;
		this.cameraSelection = "default";
		this.cameraSelectionIsDeviceId = false;
		this.cameraDevices = [];
		this.activeCameraDeviceId = "";
		this.activeCameraDeviceName = "";
		this.cameraSelectionQueue = Promise.resolve();
		this.recognizing = false;
		this.audioListening = false;
		this.loopStarted = false;
		this.loopGeneration = 0;
		this.activeModelOperations = /* @__PURE__ */ new Map();
		this.currentPoseName = "";
		this.score = 0;
		this.predictions = {};
		this.accumulationCoefficient = 1;
		this.decayCoefficient = .9;
		this.activeDecayCoefficient = .9;
		this.accumulatedPoseThreshold = 0;
		this.accumulatedPoseName = "";
		this.accumulatedScore = 0;
		this.accumulatedPredictions = {};
		this.lastAccumulationTime = null;
		this.previewOpacity = .6;
		this.previewPosition = "bottom-right";
		this.previewMirrored = true;
		this.previewVisible = true;
		this.previewCanvas = null;
		this.previewStageElement = null;
		this.poseOverlayVisible = true;
		this.poseOverlayMinimumConfidence = .5;
		this.poseJointStyles = Object.fromEntries(POSE_KEYPOINT_NAMES.map((part) => [part, { ...DEFAULT_POSE_JOINT_STYLE }]));
		this.poseBoneStyle = { ...DEFAULT_POSE_BONE_STYLE };
		this.poseConfidenceScaling = { ...DEFAULT_POSE_OVERLAY_CONFIDENCE_SCALING };
		this.poseOverlaySvg = null;
		this.poseOverlayJointElements = /* @__PURE__ */ new Map();
		this.poseOverlayBoneElements = [];
		this.latestPoseKeypoints = [];
		this.cameraMs = 0;
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
		this.lastError = "";
		this.accumulatedPosePausedForBackground = isDocumentHidden();
		this.visibilityChangeListener = () => this.handleDocumentVisibilityChange();
		if (this.featureFlags.temporalPoseScoring && typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibilityChangeListener);
	}
	getInfo() {
		const visibleOpcodes = block_definitions_default.blocks.filter((block) => !block.featureFlag || this.featureFlags[block.featureFlag]).map((block) => `${EXTENSION_ID}_${block.opcode}`);
		this.fixedEditors.ensure(visibleOpcodes);
		return {
			id: EXTENSION_ID,
			name: Scratch.translate(block_definitions_default.extensionName),
			docsURI: DOCS_URI,
			blockIconURI: BLOCK_ICON_URI,
			blocks: block_definitions_default.blocks.filter((block) => !block.featureFlag || this.featureFlags[block.featureFlag]).map((block) => ({
				opcode: block.opcode,
				blockType: Scratch.BlockType[block.blockType],
				text: Scratch.translate(block.text),
				...block.disableMonitor ? { disableMonitor: true } : {},
				...block.arguments ? { arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
					type: Scratch.ArgumentType[argument.type],
					defaultValue: argument.defaultValue,
					...argument.menu ? { menu: argument.menu } : {}
				}])) } : {}
			})),
			menus: {
				positionMenu: {
					acceptReporters: true,
					items: POSITION_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				previewMirroringMenu: {
					acceptReporters: true,
					items: PREVIEW_MIRRORING_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				recognitionModeMenu: {
					acceptReporters: true,
					items: RECOGNITION_MODE_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				computeModeMenu: {
					acceptReporters: true,
					items: COMPUTE_MODE_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				poseOverlayVisibilityMenu: {
					acceptReporters: true,
					items: POSE_OVERLAY_VISIBILITY_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				poseKeypointMenu: {
					acceptReporters: true,
					items: POSE_KEYPOINT_NAMES.map((part) => ({
						text: part,
						value: part
					}))
				},
				poseConfidencePropertyMenu: {
					acceptReporters: true,
					items: POSE_CONFIDENCE_PROPERTY_ITEMS.map((item) => ({
						text: Scratch.translate(item.text),
						value: item.value
					}))
				},
				cameraMenu: {
					acceptReporters: true,
					items: "getCameraMenuItems"
				}
			}
		};
	}
	versionReporter() {
		return VERSION;
	}
	setLastError(error) {
		this.lastError = String(error?.message ?? error);
	}
	setRecognitionMode(args) {
		const mode = normalizeRecognitionMode(args.MODE);
		if (mode === this.recognitionMode) return;
		if (this.recognizing) throw new Error("Teachable Machine: Stop recognition before changing recognition mode.");
		if (this.cameraRunning) throw new Error("Teachable Machine: Stop the camera before changing recognition mode.");
		this.recognitionMode = mode;
		this.model = null;
		this.modelOwnedByExtension = false;
		this.modelURL = "";
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
		this.currentPoseName = "";
		this.score = 0;
		this.predictions = {};
		this.clearPoseOverlay();
		this.resetAccumulatedPose();
	}
	recognitionModeReporter() {
		return this.recognitionMode;
	}
	activeComputeRuntime() {
		if (this.tmComputeRuntime) return this.tmComputeRuntime;
		const runtime = globalThis.tmCompute;
		return runtime && typeof runtime.select === "function" ? runtime : null;
	}
	/**
	* TensorFlow.js binds every tensor to the backend that was active when the
	* tensor was created, so the backend is negotiated before any model loads. A
	* host that preloads a runtime without a compute controller keeps whatever
	* backend TensorFlow.js selected for itself.
	*/
	async ensureComputeBackend() {
		const compute = this.activeComputeRuntime();
		if (!compute) return null;
		const selection = await compute.select(this.computeMode);
		this.computeSelection = selection;
		if (selection.fallback) this.setLastError(/* @__PURE__ */ new Error(`Teachable Machine: The ${selection.requested} compute backend was unavailable, so ${selection.backend} is in use.`));
		return selection;
	}
	async setComputeMode(args) {
		const mode = normalizeComputeMode(args.MODE, this.computeMode);
		if (mode === this.computeMode) return;
		if (this.recognizing) throw new Error("Teachable Machine: Stop recognition before changing the compute mode.");
		if (this.model && !this.modelOwnedByExtension) throw new Error("Teachable Machine: Release the prepared model before changing the compute mode.");
		const previousModel = this.model;
		this.computeMode = mode;
		this.computeSelection = null;
		this.model = null;
		this.modelOwnedByExtension = false;
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
		if (previousModel) await this.releaseOwnedModel(previousModel);
		if (this.activeComputeRuntime()) await this.ensureComputeBackend();
	}
	async releaseOwnedModel(model) {
		try {
			await this.waitForPreparedModelIdle(model);
			await model.dispose?.();
		} catch (error) {
			this.setLastError(error);
		}
	}
	computeModeReporter() {
		return this.computeMode;
	}
	computeBackendReporter() {
		const compute = this.activeComputeRuntime();
		if (!compute) return "";
		return this.computeSelection?.backend ?? compute.getBackend() ?? "";
	}
	setModelURL(args) {
		this.modelURL = String(args.URL || "").trim();
		if (this.modelURL && !this.modelURL.endsWith("/")) this.modelURL += "/";
		this.model = null;
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
	}
	activeRuntime() {
		if (this.recognitionMode === "audio") return this.tmAudioRuntime;
		return this.recognitionMode === "image" ? this.tmImageRuntime : this.tmPoseRuntime;
	}
	async ensureLibrariesLoaded() {
		if (this.activeRuntime()) {
			if (this.activeComputeRuntime()) await this.ensureComputeBackend();
			return;
		}
		if (!this.allowRemoteLibraries) throw new Error("Teachable Machine: A preloaded runtime is required.");
		if (typeof globalThis.tf === "undefined" || typeof globalThis.tmPose === "undefined" || typeof globalThis.tmImage === "undefined" || typeof globalThis.tmAudio === "undefined") await loadScript(BROWSER_RUNTIME_URL);
		if (typeof globalThis.tf === "undefined" || typeof globalThis.tmPose === "undefined" || typeof globalThis.tmImage === "undefined" || typeof globalThis.tmAudio === "undefined") throw new Error("Teachable Machine: The reviewed browser runtime could not be loaded.");
		this.tmPoseRuntime = globalThis.tmPose;
		this.tmImageRuntime = globalThis.tmImage;
		this.tmAudioRuntime = globalThis.tmAudio;
		await this.ensureComputeBackend();
	}
	cleanupCameraResources() {
		const lease = this.cameraLease;
		this.cameraLease = null;
		const video = this.webcam?.webcam;
		if (lease) lease.release();
		else if (video?.srcObject) {
			video.srcObject.getTracks().forEach((track) => track.stop());
			video.srcObject = null;
		}
		this.previewCanvas?.parentNode?.removeChild(this.previewCanvas);
		this.poseOverlaySvg?.parentNode?.removeChild(this.poseOverlaySvg);
		this.previewCanvas = null;
		this.previewStageElement = null;
		this.poseOverlaySvg = null;
		this.poseOverlayJointElements = /* @__PURE__ */ new Map();
		this.poseOverlayBoneElements = [];
		this.latestPoseKeypoints = [];
		this.webcam = null;
		this.cameraRunning = false;
		this.activeCameraDeviceId = "";
		this.activeCameraDeviceName = "";
		this.loopStarted = false;
		this.loopGeneration += 1;
	}
	async startCamera() {
		if (this.recognitionMode === "audio") throw new Error("Teachable Machine: Audio mode uses the microphone through start recognition.");
		if (this.cameraRunning && this.webcam) {
			this.attachPreviewToStage();
			return;
		}
		try {
			this.lastError = "";
			const startedAt = performance.now();
			await this.ensureLibrariesLoaded();
			const runtime = this.activeRuntime();
			if (!runtime) throw new Error("Teachable Machine: Runtime is unavailable.");
			if (!("Webcam" in runtime)) throw new Error("Teachable Machine: Camera runtime is unavailable in the current mode.");
			this.webcam = new runtime.Webcam(320, 240, true);
			const selection = this.resolvedCameraSelection();
			const lease = await this.acquireSharedCamera();
			if (lease) {
				this.cameraLease = lease;
				this.webcam.webcam = lease.getFrameSource().element;
			}
			if (!this.webcam.webcam) {
				const element = await this.openCameraElement(cameraConstraints(selection));
				if (element) this.webcam.webcam = element;
			}
			if (this.webcam.webcam) await this.webcam.setup();
			else await this.webcam.setup(cameraConstraints(selection));
			this.ensureCameraCanvas();
			initializeCameraReadbackContext(this.webcam.canvas);
			if (!lease) await this.webcam.play();
			this.attachPreviewToStage();
			this.cameraRunning = true;
			try {
				await this.refreshCameraDevices();
			} catch {}
			this.updateActiveCameraInfo();
			this.cameraMs = Math.round(performance.now() - startedAt);
			this.startLoopIfNeeded();
		} catch (error) {
			this.cleanupCameraResources();
			this.setLastError(error);
			throw error;
		}
	}
	/**
	* Give the camera the readback canvas `setup()` did not build.
	*
	* Upstream creates that canvas inside the same branch that opens the camera, so an injected
	* element skips the canvas with the `getUserMedia` call. 3.4.0 shipped assuming the two were
	* separate, and every leased start then failed at the first context request with "Webcam canvas
	* does not provide a 2D context" -- which is to say pose recognition did not start at all
	* wherever Camera Source was present. The canvas built here is the one upstream would have
	* built, so the mirrored centre crop every downstream reader expects is unchanged.
	*/
	ensureCameraCanvas() {
		if (!this.webcam || this.webcam.canvas) return;
		const canvas = document.createElement("canvas");
		canvas.width = this.webcam.width ?? 320;
		canvas.height = this.webcam.height ?? 240;
		this.webcam.canvas = canvas;
	}
	/**
	* A lease on the shared camera, or null when Camera Source is not loaded.
	*
	* Camera Source owns the device and decides when a stream stops, which is what lets one camera
	* serve pose recognition and anything else reading frames at the same time. It is a separate
	* TurboWarp extension, and this one is also distributed for standalone URL loading, so its
	* absence is ordinary rather than a failure: the self-acquired path stays for it.
	*
	* One camera id for every visual recognition mode. Opening a second device for a work that
	* recognises both poses and images is not what sharing is for, and `pose` is the role name
	* Camera Source's own documentation uses for this consumer.
	*/
	/**
	* Open the camera here, so the frames arrive at the resolution the camera itself offers.
	*
	* `Webcam.setup()` hands its options to `getWebcam`, which overwrites `options.width` with 640
	* before every `getUserMedia` call it makes. A 1080p camera then negotiates 640x360 with
	* `resizeMode: "crop-and-scale"` -- the browser downscales, and the native frame is gone before
	* anything here can show it. The constraint cannot be passed around, only avoided: `setup()`
	* skips `getWebcam` entirely once the element is there, which is the door the Camera Source
	* lease already goes through.
	*
	* No size is asked for. That is deliberate, and it is what Camera Source passes too: both paths
	* leave the mode to the browser and the camera rather than this extension naming one.
	*
	* Null where the browser has no `getUserMedia`. There the library keeps its own path, and its
	* own error, rather than this reporting a different failure for the same missing capability.
	*/
	async openCameraElement(constraints) {
		const mediaDevices = typeof navigator === "undefined" ? void 0 : navigator.mediaDevices;
		if (typeof mediaDevices?.getUserMedia !== "function") return null;
		const stream = await mediaDevices.getUserMedia({ video: constraints ?? true });
		const video = document.createElement("video");
		video.autoplay = true;
		video.muted = true;
		video.playsInline = true;
		video.addEventListener("loadedmetadata", () => {
			video.width = video.videoWidth;
			video.height = video.videoHeight;
		});
		video.srcObject = stream;
		return video;
	}
	async acquireSharedCamera() {
		const cameraSource = readCameraSource(Scratch.vm?.runtime);
		if (!cameraSource) return null;
		const selection = this.resolvedCameraSelection();
		const options = {
			owner: package_default.name,
			cameraId: "pose"
		};
		if (selection.kind === "device") options.deviceId = selection.value;
		return cameraSource.acquireCamera(options);
	}
	stopCamera() {
		try {
			this.stopRecognition();
			this.cleanupCameraResources();
			this.currentPoseName = "";
			this.score = 0;
			this.predictions = {};
		} catch (error) {
			this.setLastError(error);
			throw error;
		}
	}
	isCameraRunning() {
		return this.cameraRunning;
	}
	getCameraMenuItems() {
		const fixedItems = CAMERA_SELECTION_ITEMS.map((item) => ({
			text: Scratch.translate(item.text),
			value: item.value
		}));
		const seen = /* @__PURE__ */ new Set();
		const deviceItems = [];
		this.cameraDevices.forEach((device, index) => {
			if (!device.deviceId || seen.has(device.deviceId)) return;
			seen.add(device.deviceId);
			deviceItems.push({
				text: device.label || `${Scratch.translate("camera")} ${index + 1}`,
				value: device.deviceId
			});
		});
		return [...fixedItems, ...deviceItems];
	}
	async refreshCameraDevices() {
		const mediaDevices = typeof navigator === "undefined" ? void 0 : navigator.mediaDevices;
		if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") throw new Error("TM: Camera enumeration is not available in this browser.");
		const devices = await mediaDevices.enumerateDevices();
		this.cameraDevices = devices.filter((device) => device.kind === "videoinput").map((device) => ({
			deviceId: device.deviceId,
			label: device.label
		}));
		return this.cameraDevices;
	}
	async refreshCameraList() {
		try {
			this.lastError = "";
			await this.refreshCameraDevices();
			if (this.cameraRunning) this.updateActiveCameraInfo();
		} catch (error) {
			this.setLastError(error);
			throw error;
		}
	}
	setCameraSelection(args) {
		const selection = normalizeCameraSelection(args.CAMERA);
		return this.enqueueCameraSelection(selection);
	}
	setCameraDeviceId(deviceId) {
		if (typeof deviceId !== "string" || deviceId.trim().length === 0) return Promise.reject(/* @__PURE__ */ new Error("TM: Camera device ID must be a non-empty string."));
		return this.enqueueCameraSelection({
			kind: "device",
			value: deviceId
		});
	}
	resolvedCameraSelection() {
		return this.cameraSelectionIsDeviceId ? {
			kind: "device",
			value: this.cameraSelection
		} : {
			kind: "preference",
			value: this.cameraSelection
		};
	}
	enqueueCameraSelection(selection) {
		const operation = this.cameraSelectionQueue.then(() => this.applyCameraSelection(selection));
		this.cameraSelectionQueue = operation.catch(() => void 0);
		return operation;
	}
	async applyCameraSelection(selection) {
		const previousSelection = this.cameraSelection;
		const previousSelectionIsDeviceId = this.cameraSelectionIsDeviceId;
		const wasRunning = this.cameraRunning;
		this.cameraSelection = selection.value;
		this.cameraSelectionIsDeviceId = selection.kind === "device";
		if (!wasRunning) return;
		this.cleanupCameraResources();
		try {
			await this.startCamera();
		} catch (switchError) {
			this.cameraSelection = previousSelection;
			this.cameraSelectionIsDeviceId = previousSelectionIsDeviceId;
			try {
				await this.startCamera();
			} catch (rollbackError) {
				const error = new AggregateError([switchError, rollbackError], "TM: Camera switch and rollback both failed.");
				this.setLastError(error);
				throw error;
			}
			this.setLastError(switchError);
			throw switchError;
		}
	}
	updateActiveCameraInfo() {
		const stream = this.webcam?.webcam?.srcObject;
		const videoTrack = stream?.getVideoTracks?.()[0] ?? stream?.getTracks?.().find((track) => track.kind === "video" || track.kind === void 0);
		const settings = videoTrack?.getSettings?.() ?? {};
		const selectedDeviceId = this.cameraSelectionIsDeviceId ? this.cameraSelection : "";
		this.activeCameraDeviceId = String(settings.deviceId || selectedDeviceId);
		const device = this.cameraDevices.find((candidate) => candidate.deviceId === this.activeCameraDeviceId);
		this.activeCameraDeviceName = String(videoTrack?.label || device?.label || "");
	}
	cameraCountReporter() {
		return this.cameraDevices.length;
	}
	cameraDeviceIdReporter() {
		return this.activeCameraDeviceId;
	}
	cameraDeviceNameReporter() {
		return this.activeCameraDeviceName;
	}
	showPreview() {
		try {
			this.previewVisible = true;
			if (!this.webcam?.canvas) throw new Error("TM: Start the camera before showing the preview.");
			this.attachPreviewToStage();
			this.previewCanvas.style.display = "block";
			this.updatePoseOverlayVisibility();
			this.validatePreviewAttachment(this.previewStageElement, this.previewCanvas);
		} catch (error) {
			this.setLastError(error);
			throw error;
		}
	}
	hidePreview() {
		this.previewVisible = false;
		if (this.previewCanvas) this.previewCanvas.style.display = "none";
		this.updatePoseOverlayVisibility();
	}
	isPreviewVisible() {
		return this.previewVisible;
	}
	setPreviewOpacity(args) {
		let opacity = args.OPACITY === "" ? .6 : Number(args.OPACITY);
		if (Number.isNaN(opacity)) opacity = .6;
		this.previewOpacity = Math.max(0, Math.min(1, opacity));
		if (this.previewCanvas) this.previewCanvas.style.opacity = String(this.previewOpacity);
	}
	setPreviewPosition(args) {
		this.previewPosition = normalizePosition(args.POSITION);
		if (this.previewCanvas) {
			this.updatePreviewStyle();
			this.validatePreviewAttachment(this.previewStageElement, this.previewCanvas);
		}
	}
	setPreviewMirroring(args) {
		this.previewMirrored = normalizePreviewMirroring(args.MIRRORING);
		if (this.previewCanvas) this.updatePreviewStyle();
	}
	previewMirroringReporter() {
		return this.previewMirrored ? "mirrored" : "unmirrored";
	}
	setPoseOverlayVisibility(args) {
		this.poseOverlayVisible = normalizePoseOverlayVisibility(args.VISIBILITY);
		this.updatePoseOverlayVisibility();
	}
	showPoseOverlay() {
		this.poseOverlayVisible = true;
		this.updatePoseOverlayVisibility();
	}
	hidePoseOverlay() {
		this.poseOverlayVisible = false;
		this.updatePoseOverlayVisibility();
	}
	isPoseOverlayVisible() {
		return this.featureFlags.poseOverlay && this.poseOverlayVisible;
	}
	setPoseJointStyle(args) {
		const part = String(args.PART ?? "");
		if (!isPoseKeypointName(part)) throw new Error(`TM: Unknown PoseNet joint: ${part}`);
		const previous = this.poseJointStyles[part];
		this.poseJointStyles[part] = {
			color: normalizePoseColor(args.COLOR, previous.color),
			opacity: normalizePoseStyleNumber(args.OPACITY, previous.opacity, 1),
			radius: normalizePoseStyleNumber(args.RADIUS, previous.radius)
		};
		this.redrawPoseOverlay();
	}
	setPoseBoneStyle(args) {
		this.poseBoneStyle = {
			color: normalizePoseColor(args.COLOR, this.poseBoneStyle.color),
			opacity: normalizePoseStyleNumber(args.OPACITY, this.poseBoneStyle.opacity, 1),
			width: normalizePoseStyleNumber(args.WIDTH, this.poseBoneStyle.width)
		};
		this.redrawPoseOverlay();
	}
	setPoseOverlayMinimumConfidence(args) {
		this.poseOverlayMinimumConfidence = normalizePoseStyleNumber(args.CONFIDENCE, this.poseOverlayMinimumConfidence, 1);
		this.redrawPoseOverlay();
	}
	setPoseConfidenceScaling(args) {
		const property = String(args.PROPERTY ?? "");
		const key = {
			"joint-opacity": "jointOpacity",
			"joint-radius": "jointRadius",
			"bone-opacity": "boneOpacity",
			"bone-width": "boneWidth"
		}[property];
		if (!key) throw new Error(`TM: Unknown confidence-scaled property: ${property}`);
		this.poseConfidenceScaling[key] = normalizePoseOverlayVisibility(args.STATE);
		this.redrawPoseOverlay();
	}
	async loadModel() {
		if (this.model) return;
		if (!this.modelURL) throw new Error("Teachable Machine: Set the model URL first.");
		try {
			this.lastError = "";
			const startedAt = performance.now();
			await this.ensureLibrariesLoaded();
			const runtime = this.activeRuntime();
			if (!runtime || typeof runtime.load !== "function") throw new Error("Teachable Machine: The URL loader is not available.");
			this.model = await runtime.load(this.modelURL + "model.json", this.modelURL + "metadata.json");
			this.modelOwnedByExtension = true;
			this.modelLoadMs = Math.round(performance.now() - startedAt);
		} catch (error) {
			this.setLastError(error);
			throw error;
		}
	}
	isModelLoaded() {
		return Boolean(this.model);
	}
	usePreparedModel(model) {
		if (!model || typeof model !== "object") throw new TypeError("TM: Prepared model must be an object.");
		if (this.recognizing && this.model !== model) throw new Error("TM: Stop recognition before changing the active model.");
		this.model = model;
		this.modelOwnedByExtension = false;
		this.modelURL = "";
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
	}
	clearPreparedModel(model) {
		if (model !== void 0 && this.model !== model) return;
		this.stopRecognition();
		this.model = null;
		this.modelOwnedByExtension = false;
		this.modelURL = "";
		this.modelLoadMs = 0;
		this.firstRecognitionMs = 0;
	}
	async startRecognition() {
		try {
			this.lastError = "";
			const startingNewSession = !this.recognizing;
			if (this.recognitionMode !== "audio" && !this.cameraRunning) await this.startCamera();
			await this.loadModel();
			if (startingNewSession && this.featureFlags.temporalPoseScoring) this.startAccumulatedPoseSession();
			this.recognizing = true;
			if (this.recognitionMode === "audio") await this.startAudioRecognition();
			else this.startLoopIfNeeded();
		} catch (error) {
			this.setLastError(error);
			throw error;
		}
	}
	stopRecognition() {
		this.recognizing = false;
		this.stopAudioRecognition();
		this.currentPoseName = "";
		this.score = 0;
		this.predictions = {};
		this.clearPoseOverlay();
		this.resetAccumulatedPose("stop");
	}
	isRecognizing() {
		return this.recognizing;
	}
	async startAudioRecognition() {
		if (!this.model || typeof this.model.listen !== "function") throw new Error("Teachable Machine: The active model does not support audio recognition.");
		if (typeof this.model.isListening === "function" && this.model.isListening()) {
			this.audioListening = true;
			return;
		}
		const first = this.firstRecognitionMs === 0;
		const startedAt = first ? performance.now() : 0;
		await this.model.listen(async (result) => {
			if (!this.recognizing || this.recognitionMode !== "audio" || this.model === null) return;
			if (first && this.firstRecognitionMs === 0) this.firstRecognitionMs = Math.round(performance.now() - startedAt);
			this.applyPredictions(this.audioPredictionFromResult(this.model, result));
		}, {
			probabilityThreshold: 0,
			overlapFactor: .5,
			invokeCallbackOnNoiseAndUnknown: true
		});
		this.audioListening = true;
	}
	stopAudioRecognition() {
		if (!this.audioListening || !this.model || typeof this.model.stopListening !== "function") {
			this.audioListening = false;
			return;
		}
		this.audioListening = false;
		this.model.stopListening().catch((error) => this.setLastError(error));
	}
	audioPredictionFromResult(model, result) {
		const labels = typeof model.wordLabels === "function" ? model.wordLabels() : [];
		const scores = Array.isArray(result?.scores) ? result.scores[0] : result?.scores;
		if (!labels.length || !scores || typeof scores.length !== "number") throw new Error("Teachable Machine: Audio recognition did not return labels and scores.");
		return labels.map((className, index) => ({
			className,
			probability: Number(scores[index] ?? 0)
		}));
	}
	applyPredictions(prediction) {
		let best = {
			className: "",
			probability: 0
		};
		this.predictions = {};
		for (const result of prediction) {
			this.predictions[result.className] = result.probability;
			if (result.probability > best.probability) best = result;
		}
		this.currentPoseName = best.className;
		this.score = best.probability;
		if (this.featureFlags.temporalPoseScoring) this.updateAccumulatedPose(prediction);
	}
	findStageElement() {
		try {
			const stageCanvas = this.findLikelyStageCanvas();
			if (stageCanvas.parentElement) return stageCanvas.parentElement;
		} catch {}
		const editorStage = document.querySelector(".stage_stage-wrapper_2bejr") || document.querySelector("[class*=\"stage_stage-wrapper\"]") || document.querySelector("[class*=\"stage-wrapper\"]") || document.querySelector("[class*=\"stage-wrapper_stage-wrapper\"]");
		if (editorStage) return editorStage;
		throw new Error("TM: TurboWarp stage element was not found.");
	}
	findLikelyStageCanvas() {
		const webcamCanvas = this.webcam?.canvas ?? null;
		const allCanvases = Array.from(document.querySelectorAll("canvas")).filter((canvas) => canvas !== webcamCanvas && canvas !== this.previewCanvas);
		const visibleCandidates = allCanvases.map((canvas) => {
			const rect = canvas.getBoundingClientRect();
			return {
				canvas,
				rect,
				style: window.getComputedStyle(canvas),
				score: canvasScore(rect.width, rect.height)
			};
		}).filter((item) => item.rect.width >= 200 && item.rect.height >= 150).filter((item) => item.style.display !== "none").filter((item) => item.style.visibility !== "hidden").filter((item) => Number(item.style.opacity || 1) !== 0).sort((left, right) => right.score - left.score);
		if (visibleCandidates[0]) return visibleCandidates[0].canvas;
		const fallbackCandidates = allCanvases.map((canvas) => ({
			canvas,
			score: canvasScore(canvas.width, canvas.height)
		})).filter((item) => item.canvas.width >= 200 && item.canvas.height >= 150).sort((left, right) => right.score - left.score);
		if (fallbackCandidates[0]) return fallbackCandidates[0].canvas;
		throw new Error("TM: No likely stage canvas was found. The editor or packager DOM may be unsupported.");
	}
	validatePreviewAttachment(stage, canvas) {
		if (!stage || !canvas || canvas.parentElement !== stage) throw new Error("TM: Preview canvas was not attached to the stage.");
		const canvasStyle = window.getComputedStyle(canvas);
		if (canvasStyle.display === "none" && this.previewVisible) throw new Error("TM: Preview canvas is hidden by display:none.");
		if (canvasStyle.visibility === "hidden" && this.previewVisible) throw new Error("TM: Preview canvas is hidden by visibility:hidden.");
		const stageRect = stage.getBoundingClientRect();
		const canvasRect = canvas.getBoundingClientRect();
		const documentHidden = typeof document.visibilityState === "string" && document.visibilityState === "hidden";
		const layoutUnavailable = stageRect.width === 0 || stageRect.height === 0;
		if (!documentHidden && !layoutUnavailable && this.previewVisible) {
			if (canvasRect.width <= 0 || canvasRect.height <= 0) throw new Error("TM: Preview canvas was attached but has zero size.");
			if (!rectanglesIntersect(stageRect, canvasRect)) throw new Error("TM: Preview canvas does not intersect the stage.");
		}
	}
	createSvgElement(name) {
		if (typeof document.createElementNS === "function") return document.createElementNS("http://www.w3.org/2000/svg", name);
		return document.createElement(name);
	}
	ensurePoseOverlayElement() {
		if (!this.featureFlags.poseOverlay) return null;
		if (this.poseOverlaySvg) return this.poseOverlaySvg;
		const svg = this.createSvgElement("svg");
		svg.setAttribute("viewBox", `0 0 320 240`);
		svg.setAttribute("width", "320");
		svg.setAttribute("height", "240");
		svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		const boneGroup = this.createSvgElement("g");
		boneGroup.setAttribute("data-layer", "bones");
		this.poseOverlayBoneElements = POSE_BONE_CONNECTIONS.map(([first, second]) => {
			const line = this.createSvgElement("line");
			line.setAttribute("data-bone", `${first}-${second}`);
			line.setAttribute("stroke-linecap", "round");
			line.style.display = "none";
			boneGroup.appendChild(line);
			return {
				first,
				second,
				line
			};
		});
		svg.appendChild(boneGroup);
		const jointGroup = this.createSvgElement("g");
		jointGroup.setAttribute("data-layer", "joints");
		this.poseOverlayJointElements = /* @__PURE__ */ new Map();
		for (const part of POSE_KEYPOINT_NAMES) {
			const circle = this.createSvgElement("circle");
			circle.setAttribute("data-joint", part);
			circle.style.display = "none";
			jointGroup.appendChild(circle);
			this.poseOverlayJointElements.set(part, circle);
		}
		svg.appendChild(jointGroup);
		this.poseOverlaySvg = svg;
		return svg;
	}
	updatePoseOverlayVisibility() {
		if (!this.poseOverlaySvg) return;
		this.poseOverlaySvg.style.display = this.previewVisible && this.poseOverlayVisible ? "block" : "none";
	}
	clearPoseOverlay() {
		this.latestPoseKeypoints = [];
		for (const circle of this.poseOverlayJointElements.values()) circle.style.display = "none";
		for (const { line } of this.poseOverlayBoneElements) line.style.display = "none";
	}
	redrawPoseOverlay() {
		if (this.latestPoseKeypoints.length > 0) this.renderPoseOverlay(this.latestPoseKeypoints);
	}
	renderPoseOverlay(keypoints) {
		if (!this.featureFlags.poseOverlay || !this.poseOverlaySvg || !Array.isArray(keypoints)) {
			this.clearPoseOverlay();
			return;
		}
		this.latestPoseKeypoints = keypoints;
		const recognized = /* @__PURE__ */ new Map();
		for (const candidate of keypoints) {
			if (typeof candidate !== "object" || candidate === null || !isPoseKeypointName(candidate.part)) continue;
			const keypoint = candidate;
			const x = Number(keypoint.position?.x);
			const y = Number(keypoint.position?.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			recognized.set(keypoint.part, {
				part: keypoint.part,
				score: confidenceMultiplier(keypoint.score),
				position: {
					x,
					y
				}
			});
		}
		for (const part of POSE_KEYPOINT_NAMES) {
			const circle = this.poseOverlayJointElements.get(part);
			const keypoint = recognized.get(part);
			if (!circle || !keypoint || keypoint.score < this.poseOverlayMinimumConfidence) {
				if (circle) circle.style.display = "none";
				continue;
			}
			const style = this.poseJointStyles[part];
			const opacityMultiplier = this.poseConfidenceScaling.jointOpacity ? keypoint.score : 1;
			const radiusMultiplier = this.poseConfidenceScaling.jointRadius ? keypoint.score : 1;
			circle.setAttribute("cx", String(keypoint.position.x));
			circle.setAttribute("cy", String(keypoint.position.y));
			circle.setAttribute("r", String(style.radius * radiusMultiplier));
			circle.setAttribute("fill", style.color);
			circle.setAttribute("fill-opacity", String(style.opacity * opacityMultiplier));
			circle.style.display = "block";
		}
		for (const { first, second, line } of this.poseOverlayBoneElements) {
			const firstKeypoint = recognized.get(first);
			const secondKeypoint = recognized.get(second);
			if (!firstKeypoint || !secondKeypoint || firstKeypoint.score < this.poseOverlayMinimumConfidence || secondKeypoint.score < this.poseOverlayMinimumConfidence) {
				line.style.display = "none";
				continue;
			}
			const confidence = Math.min(firstKeypoint.score, secondKeypoint.score);
			const opacityMultiplier = this.poseConfidenceScaling.boneOpacity ? confidence : 1;
			const widthMultiplier = this.poseConfidenceScaling.boneWidth ? confidence : 1;
			line.setAttribute("x1", String(firstKeypoint.position.x));
			line.setAttribute("y1", String(firstKeypoint.position.y));
			line.setAttribute("x2", String(secondKeypoint.position.x));
			line.setAttribute("y2", String(secondKeypoint.position.y));
			line.setAttribute("stroke", this.poseBoneStyle.color);
			line.setAttribute("stroke-opacity", String(this.poseBoneStyle.opacity * opacityMultiplier));
			line.setAttribute("stroke-width", String(this.poseBoneStyle.width * widthMultiplier));
			line.style.display = "block";
		}
	}
	/**
	* The element the stage shows.
	*
	* The camera's own video, when there is one: it carries the camera's resolution and its aspect,
	* so the preview stops being a 320x240 readback canvas stretched to fit. The canvas remains the
	* preview only where there is no video to show, which is the same place inference falls back to
	* it.
	*/
	/**
	* Hand the preview over to the camera's own video once the camera says how big its frames are.
	*
	* `Webcam.setup()` resolves as soon as `getUserMedia` does and only then registers the
	* `loadedmetadata` listener, so the first attach can land while `videoWidth` is still 0 -- and
	* while it is, the readback canvas is the only thing that can be shown. The handover has to
	* happen when the size arrives, or the preview keeps the 320x240 upscale this extension stopped
	* showing, and freezes on top of that: the frame loop draws the readback canvas only while that
	* canvas is the preview.
	*/
	refreshPreviewSource() {
		if (!this.webcam || !this.previewStageElement) return;
		const source = this.previewSourceElement();
		if (!source || source === this.previewCanvas) return;
		this.previewCanvas?.parentNode?.removeChild(this.previewCanvas);
		this.attachPreviewToStage();
	}
	previewSourceElement() {
		const video = this.webcam?.webcam;
		return video && video.videoWidth > 0 ? video : this.webcam?.canvas;
	}
	attachPreviewToStage() {
		if (!this.webcam) throw new Error("TM: Start the camera before attaching the preview.");
		if (!this.webcam.canvas) throw new Error("TM: webcam.canvas is unavailable.");
		const stage = this.findStageElement();
		const canvas = this.previewSourceElement();
		let stageCanvas = null;
		try {
			const candidate = this.findLikelyStageCanvas();
			if (candidate.parentElement === stage) stageCanvas = candidate;
		} catch {}
		this.previewCanvas = canvas;
		this.previewStageElement = stage;
		const overlay = this.ensurePoseOverlayElement();
		if (window.getComputedStyle(stage).position === "static") stage.style.position = "relative";
		stage.style.overflow = "hidden";
		Object.assign(canvas.style, {
			position: "absolute",
			zIndex: "auto",
			pointerEvents: "none",
			border: "2px solid rgba(255, 255, 255, 0.7)",
			borderRadius: "8px",
			background: "#000",
			opacity: String(this.previewOpacity),
			display: this.previewVisible ? "block" : "none",
			boxSizing: "border-box"
		});
		if (overlay) Object.assign(overlay.style, {
			position: "absolute",
			zIndex: "auto",
			pointerEvents: "none",
			border: "2px solid transparent",
			background: "transparent",
			display: this.previewVisible && this.poseOverlayVisible ? "block" : "none",
			boxSizing: "border-box",
			overflow: "hidden"
		});
		let insertionPoint = stageCanvas?.nextSibling ?? null;
		while (insertionPoint && (insertionPoint === canvas || insertionPoint === overlay)) insertionPoint = insertionPoint.nextSibling;
		if (stageCanvas && typeof stage.insertBefore === "function") stage.insertBefore(canvas, insertionPoint);
		else if (canvas.parentNode !== stage) stage.appendChild(canvas);
		if (overlay) {
			if (stageCanvas && typeof stage.insertBefore === "function") stage.insertBefore(overlay, insertionPoint);
			else if (overlay.parentNode !== stage) stage.appendChild(overlay);
		}
		this.updatePreviewStyle();
		this.updatePoseOverlayVisibility();
		this.validatePreviewAttachment(stage, canvas);
	}
	/**
	* Span the overlay over what the preview is showing.
	*
	* Keypoints are in the camera frame's space, so the viewBox has to be the frame -- the video's
	* own width and height, not the readback canvas's fixed 320x240. On the canvas fallback the two
	* are the same thing.
	*/
	updatePoseOverlayViewBox() {
		const svg = this.poseOverlaySvg;
		const preview = this.previewCanvas;
		if (!svg || !preview) return;
		const width = preview.videoWidth ?? preview.width;
		const height = preview.videoHeight ?? preview.height;
		if (!(width > 0) || !(height > 0)) return;
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	}
	updatePreviewStyle() {
		const canvas = this.previewCanvas;
		if (!canvas) throw new Error("TM: Start the camera before positioning the preview.");
		const targets = [canvas, this.poseOverlaySvg].filter(Boolean);
		for (const target of targets) Object.assign(target.style, {
			left: "",
			right: "",
			top: "",
			bottom: "",
			transform: "",
			objectFit: "",
			width: "35%",
			height: "auto",
			borderRadius: "8px"
		});
		let positionTransform = "";
		switch (this.previewPosition) {
			case "top-left":
				for (const target of targets) {
					target.style.left = "8px";
					target.style.top = "8px";
				}
				break;
			case "top-right":
				for (const target of targets) {
					target.style.right = "8px";
					target.style.top = "8px";
				}
				break;
			case "bottom-left":
				for (const target of targets) {
					target.style.left = "8px";
					target.style.bottom = "8px";
				}
				break;
			case "center":
				for (const target of targets) {
					target.style.left = "50%";
					target.style.top = "50%";
				}
				positionTransform = "translate(-50%, -50%)";
				break;
			case "full-stage":
				for (const target of targets) {
					target.style.left = "0";
					target.style.top = "0";
					target.style.width = "100%";
					target.style.height = "100%";
					target.style.objectFit = "cover";
					target.style.borderRadius = "0";
				}
				break;
			default: for (const target of targets) {
				target.style.right = "8px";
				target.style.bottom = "8px";
			}
		}
		const mirroringTransform = this.previewCanvas === this.webcam?.webcam ? this.previewMirrored ? "scaleX(-1)" : "" : this.previewMirrored ? "" : "scaleX(-1)";
		for (const target of targets) target.style.transform = [positionTransform, mirroringTransform].filter(Boolean).join(" ");
		this.poseOverlaySvg?.setAttribute("preserveAspectRatio", this.previewPosition === "full-stage" ? "xMidYMid slice" : "xMidYMid meet");
		this.updatePoseOverlayViewBox();
	}
	startLoopIfNeeded() {
		if (this.loopStarted || !this.cameraRunning || !this.webcam) return;
		this.loopStarted = true;
		const generation = ++this.loopGeneration;
		this.loop(generation);
	}
	trackPreparedModelOperation(model, operation) {
		let active = this.activeModelOperations.get(model);
		if (!active) {
			active = /* @__PURE__ */ new Set();
			this.activeModelOperations.set(model, active);
		}
		active.add(operation);
		operation.then(() => {
			active.delete(operation);
			if (active.size === 0) this.activeModelOperations.delete(model);
		}, () => {
			active.delete(operation);
			if (active.size === 0) this.activeModelOperations.delete(model);
		});
		return operation;
	}
	async waitForPreparedModelIdle(model) {
		await Promise.allSettled([...this.activeModelOperations.get(model) ?? []]);
	}
	async loop(generation = this.loopGeneration) {
		if (generation !== this.loopGeneration || !this.cameraRunning || !this.webcam) {
			if (generation === this.loopGeneration) this.loopStarted = false;
			return;
		}
		try {
			if (this.previewCanvas && this.previewCanvas !== this.webcam.webcam) this.webcam.update();
			this.refreshPreviewSource();
			if (this.recognizing && this.model) {
				const model = this.model;
				const recognitionMode = this.recognitionMode;
				const first = this.firstRecognitionMs === 0;
				const startedAt = first ? performance.now() : 0;
				const recognition = await this.trackPreparedModelOperation(model, this.recognizeFrame(model, recognitionMode));
				if (generation !== this.loopGeneration || !this.cameraRunning || !this.recognizing || this.model !== model || this.recognitionMode !== recognitionMode) {} else {
					if (first) this.firstRecognitionMs = Math.round(performance.now() - startedAt);
					this.renderPoseOverlay(recognition.keypoints);
					this.applyPredictions(recognition.prediction);
				}
			}
		} catch (error) {
			this.setLastError(error);
		}
		if (generation === this.loopGeneration && this.cameraRunning && this.webcam) requestAnimationFrame(() => void this.loop(generation));
		else if (generation === this.loopGeneration) this.loopStarted = false;
	}
	/**
	* The square the model looks at, as a tensor, taken straight off the camera.
	*
	* The readback canvas is 320x240 and holds a 320x320 centre crop drawn into it, so its bottom
	* quarter -- 25% of the subject's height -- never reaches the model. Cropping the frame itself
	* keeps the whole square. The crop and the mirroring both run as tensor ops, which is where the
	* backend can keep them on the GPU; `fromPixels` uploads a video element directly to a texture
	* on the WebGL and WebGPU backends, so no Canvas2D stage sits in the path.
	*
	* The pixels are mirrored here rather than through `estimatePose(sample, flipHorizontal)`:
	* that flag flips the returned keypoints, not the image, and the classifier head was trained on
	* mirrored frames. Flipping the pixels is what keeps the model's input the same as before.
	*
	* The WASM and CPU backends have no texture to upload to, so `fromPixels` reads the frame back
	* through Canvas2D there and this path loses its advantage -- but not its correctness. Driving
	* one deterministic frame through every backend returns the same probabilities to two decimals
	* (webgl / wasm / cpu: 0.08, 0.90, 0.02, 0.00) and `tf.memory().numTensors` stays flat over a
	* six-second run on each, so nothing here depends on which backend `compute-backend.ts` picked.
	*
	* Returns null when there is no frame to take, and the canvas path answers instead.
	*/
	captureSquareFrame() {
		const tensorflow = globalThis.tf;
		const video = this.webcam?.webcam;
		if (typeof tensorflow?.browser?.fromPixels !== "function" || typeof tensorflow.tidy !== "function" || !video || !(video.videoWidth > 0) || !(video.videoHeight > 0)) return null;
		const size = Math.min(video.videoWidth, video.videoHeight);
		const frame = tensorflow.browser.fromPixels(video);
		try {
			const top = frame.shape[0] - size >> 1;
			const left = frame.shape[1] - size >> 1;
			return {
				tensor: tensorflow.tidy(() => tensorflow.reverse(tensorflow.slice(frame, [
					top,
					left,
					0
				], [
					size,
					size,
					3
				]), [1])),
				crop: {
					left,
					top,
					size
				}
			};
		} finally {
			frame.dispose();
		}
	}
	async recognizeFrame(model, recognitionMode) {
		if (recognitionMode === "pose") {
			if (typeof model.estimatePose !== "function") throw new Error("Teachable Machine: The active model does not support pose recognition.");
			const square = this.captureSquareFrame();
			if (!square) {
				this.webcam.update?.();
				const estimate = await model.estimatePose(this.webcam.canvas);
				const prediction = await model.predict(estimate.posenetOutput);
				return {
					keypoints: estimate.pose?.keypoints,
					prediction
				};
			}
			try {
				const estimate = await model.estimatePose(square.tensor);
				const prediction = await model.predict(estimate.posenetOutput);
				return {
					keypoints: mapKeypointsToFrame(estimate.pose?.keypoints, square.crop),
					prediction
				};
			} finally {
				square.tensor.dispose();
			}
		}
		const video = this.webcam.webcam;
		const source = video ?? this.webcam.canvas;
		return {
			keypoints: [],
			prediction: await model.predict(source, Boolean(video))
		};
	}
	currentPoseReporter() {
		return this.currentPoseName;
	}
	scoreReporter() {
		return Math.round(this.score * 100) / 100;
	}
	poseScoreReporter(args) {
		const value = this.predictions[String(args.NAME || "")] || 0;
		return Math.round(value * 100) / 100;
	}
	setAccumulatedPoseParameters(args) {
		const accumulation = args.ACCUMULATION === "" ? 1 : Number(args.ACCUMULATION);
		const decay = args.DECAY === "" ? .9 : Number(args.DECAY);
		this.accumulationCoefficient = Number.isFinite(accumulation) ? Math.max(0, accumulation) : 1;
		this.decayCoefficient = Number.isFinite(decay) ? Math.max(0, Math.min(1, decay)) : .9;
	}
	setAccumulatedPoseThreshold(args) {
		const threshold = args.THRESHOLD === "" ? 0 : Number(args.THRESHOLD);
		this.accumulatedPoseThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 0;
		this.updateAccumulatedPoseSelection();
	}
	startAccumulatedPoseSession(now = performance.now()) {
		this.activeDecayCoefficient = this.decayCoefficient;
		this.lastAccumulationTime = now;
	}
	supportsAccumulatedPoseEvents() {
		return this.featureFlags.temporalPoseScoring && this.featureFlags.accumulatedPoseEvents;
	}
	emitAccumulatedPoseChanged(previousPoseName, reason) {
		if (!this.supportsAccumulatedPoseEvents() || previousPoseName === this.accumulatedPoseName) return;
		const payload = {
			version: 2,
			poseName: this.accumulatedPoseName,
			previousPoseName,
			score: this.accumulatedScore,
			reason,
			timestamp: performance.now()
		};
		if (this.onAccumulatedPoseChanged) try {
			this.onAccumulatedPoseChanged(payload);
		} catch {}
		else if (typeof Scratch !== "undefined") Scratch.vm?.runtime?.emit(ACCUMULATED_POSE_CHANGED_EVENT, payload);
	}
	dispose() {
		this.fixedEditors.dispose();
		this.stopCamera();
		if (this.featureFlags.temporalPoseScoring && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityChangeListener);
		this.onAccumulatedPoseChanged = null;
	}
	resetAccumulatedPose(reason = "reset") {
		const previousPoseName = this.accumulatedPoseName;
		this.accumulatedPoseName = "";
		this.accumulatedScore = 0;
		this.accumulatedPredictions = {};
		this.lastAccumulationTime = this.recognizing ? performance.now() : null;
		this.emitAccumulatedPoseChanged(previousPoseName, reason);
	}
	handleDocumentVisibilityChange() {
		if (typeof document === "undefined") return;
		if (isDocumentHidden()) {
			this.accumulatedPosePausedForBackground = true;
			return;
		}
		if (this.accumulatedPosePausedForBackground) {
			this.accumulatedPosePausedForBackground = false;
			this.lastAccumulationTime = this.recognizing ? performance.now() : null;
		}
	}
	updateAccumulatedPose(prediction, now = performance.now()) {
		if (isDocumentHidden()) {
			this.accumulatedPosePausedForBackground = true;
			return;
		}
		if (this.accumulatedPosePausedForBackground) return;
		const elapsedSeconds = this.lastAccumulationTime === null ? 0 : Math.max(0, (now - this.lastAccumulationTime) / 1e3);
		const decayMultiplier = elapsedSeconds === 0 ? 1 : Math.pow(this.activeDecayCoefficient, elapsedSeconds);
		for (const name of Object.keys(this.accumulatedPredictions)) this.accumulatedPredictions[name] *= decayMultiplier;
		for (const result of prediction) {
			const name = String(result.className || "");
			const probability = Number(result.probability);
			if (!name || !Number.isFinite(probability)) continue;
			const contribution = Math.max(0, Math.min(1, probability)) * this.accumulationCoefficient * elapsedSeconds;
			this.accumulatedPredictions[name] = (this.accumulatedPredictions[name] || 0) + contribution;
		}
		this.lastAccumulationTime = now;
		this.updateAccumulatedPoseSelection();
	}
	updateAccumulatedPoseSelection() {
		const previousPoseName = this.accumulatedPoseName;
		this.accumulatedPoseName = "";
		this.accumulatedScore = 0;
		let bestPoseName = "";
		for (const [name, value] of Object.entries(this.accumulatedPredictions)) if (value > this.accumulatedScore) {
			bestPoseName = name;
			this.accumulatedScore = value;
		}
		if (bestPoseName && this.accumulatedScore >= this.accumulatedPoseThreshold) this.accumulatedPoseName = bestPoseName;
		this.emitAccumulatedPoseChanged(previousPoseName, "recognition");
	}
	accumulatedPoseReporter() {
		return this.accumulatedPoseName;
	}
	accumulatedScoreReporter() {
		return this.accumulatedScore;
	}
	accumulatedPoseScoreReporter(args) {
		return this.accumulatedPredictions[String(args.NAME || "")] || 0;
	}
	isPose(args) {
		return (this.predictions[String(args.NAME || "")] || 0) >= .75;
	}
	isPoseWithThreshold(args) {
		const name = String(args.NAME || "");
		let threshold = args.THRESHOLD === "" ? .75 : Number(args.THRESHOLD);
		if (Number.isNaN(threshold)) threshold = .75;
		threshold = Math.max(0, Math.min(1, threshold));
		return (this.predictions[name] || 0) >= threshold;
	}
	cameraMsReporter() {
		return this.cameraMs;
	}
	modelLoadMsReporter() {
		return this.modelLoadMs;
	}
	firstRecognitionMsReporter() {
		return this.firstRecognitionMs;
	}
	lastErrorReporter() {
		return this.lastError;
	}
};
//#endregion
//#region src/register-extension.ts
function requireUnsandboxed() {
	if (!Scratch.extensions.unsandboxed) throw new Error("Teachable Machine must run without the extension sandbox. In TurboWarp's custom extension dialog, paste the JavaScript into the Text tab or load teachable-machine.js from the Files tab with \"Run without sandbox\" enabled.");
}
function registerExtension(dependencies = {}) {
	requireUnsandboxed();
	const extension = new TMExtension({}, dependencies);
	Scratch.extensions.register(extension);
	if (Scratch.vm?.runtime) Scratch.vm.runtime.ext_kubohiroyatm = extension;
}
//#endregion
//#region src/index.ts
registerExtension();
//#endregion

})(Scratch);
