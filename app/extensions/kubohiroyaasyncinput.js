// Name: Async Input
// ID: kubohiroyaasyncinput
// Description: Bind keyboard and current-sprite pointer input to Temporary Variables runtime variables.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyaasyncinput",
	slug: "async-input",
	name: "Async Input",
	description: "Bind keyboard and current-sprite pointer input to Temporary Variables runtime variables.",
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: true,
	docsURI: "https://kubohiroya.github.io/turbowarp-async-input/",
	color1: "#2f9d8f",
	color2: "#247c72",
	color3: "#185b54",
	blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><rect x=\"7\" y=\"13\" width=\"22\" height=\"18\" rx=\"4\" fill=\"#E6533C\"/><g fill=\"#fff\"><rect x=\"12\" y=\"18\" width=\"4\" height=\"4\" rx=\"1\"/><rect x=\"20\" y=\"18\" width=\"4\" height=\"4\" rx=\"1\"/><rect x=\"12\" y=\"25\" width=\"12\" height=\"3\" rx=\"1.5\"/></g><path d=\"M30 25l11 11-5 1 3 5-3 2-3-5-3 4z\" fill=\"#FFAB19\"/></svg>")}`
};
var block_definitions_default = {
	extensionName: "Async Input",
	blocks: [
		{
			"opcode": "listenForKey",
			"blockType": "COMMAND",
			"text": "listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE]",
			"description": "Registers or replaces a target-owned key binding.",
			"featureFlag": "asyncInput",
			"arguments": {
				"KEY_ID": {
					"type": "STRING",
					"defaultValue": "KeyA"
				},
				"RUNTIME_VAR": {
					"type": "STRING",
					"defaultValue": "input"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "pressed"
				}
			}
		},
		{
			"opcode": "listenForKeyAndBroadcast",
			"blockType": "COMMAND",
			"text": "listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]",
			"description": "Registers or replaces a target-owned key binding that broadcasts after updating the runtime variable.",
			"featureFlag": "asyncInput",
			"arguments": {
				"KEY_ID": {
					"type": "STRING",
					"defaultValue": "KeyA"
				},
				"RUNTIME_VAR": {
					"type": "STRING",
					"defaultValue": "input"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "pressed"
				},
				"MESSAGE": {
					"type": "STRING",
					"defaultValue": "message1"
				}
			}
		},
		{
			"opcode": "stopListeningForKey",
			"blockType": "COMMAND",
			"text": "stop listening for key [KEY_ID] for this target",
			"description": "Removes this target's binding for one physical key code.",
			"featureFlag": "asyncInput",
			"arguments": { "KEY_ID": {
				"type": "STRING",
				"defaultValue": "KeyA"
			} }
		},
		{
			"opcode": "stopAllKeyListeners",
			"blockType": "COMMAND",
			"text": "stop all key listeners registered by this target",
			"description": "Removes every key binding owned by the current target.",
			"featureFlag": "asyncInput",
			"arguments": {}
		},
		{
			"opcode": "listenForTouch",
			"blockType": "COMMAND",
			"text": "listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE]",
			"description": "Registers or replaces the current sprite or clone's pointer binding.",
			"featureFlag": "asyncInput",
			"arguments": {
				"RUNTIME_VAR": {
					"type": "STRING",
					"defaultValue": "input"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "pressed"
				}
			}
		},
		{
			"opcode": "listenForTouchAndBroadcast",
			"blockType": "COMMAND",
			"text": "listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]",
			"description": "Registers or replaces the current sprite or clone's pointer binding that broadcasts after updating the runtime variable.",
			"featureFlag": "asyncInput",
			"arguments": {
				"RUNTIME_VAR": {
					"type": "STRING",
					"defaultValue": "input"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "pressed"
				},
				"MESSAGE": {
					"type": "STRING",
					"defaultValue": "message1"
				}
			}
		},
		{
			"opcode": "stopListeningForTouch",
			"blockType": "COMMAND",
			"text": "stop listening for touch on this sprite",
			"description": "Removes the current target's pointer binding.",
			"featureFlag": "asyncInput",
			"arguments": {}
		},
		{
			"opcode": "listenForPose",
			"blockType": "COMMAND",
			"text": "listen for accumulated pose [POSE_NAME] set runtime var [RUNTIME_VAR] to [VALUE]",
			"description": "Registers or replaces a target-owned accumulated pose binding.",
			"featureFlag": "poseInput",
			"arguments": {
				"POSE_NAME": {
					"type": "STRING",
					"defaultValue": "jump"
				},
				"RUNTIME_VAR": {
					"type": "STRING",
					"defaultValue": "input"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "detected"
				}
			}
		},
		{
			"opcode": "stopListeningForPose",
			"blockType": "COMMAND",
			"text": "stop listening for accumulated pose [POSE_NAME] for this target",
			"description": "Removes this target's binding for one accumulated pose name.",
			"featureFlag": "poseInput",
			"arguments": { "POSE_NAME": {
				"type": "STRING",
				"defaultValue": "jump"
			} }
		},
		{
			"opcode": "stopAllPoseListeners",
			"blockType": "COMMAND",
			"text": "stop all pose listeners registered by this target",
			"description": "Removes every accumulated pose binding owned by the current target.",
			"featureFlag": "poseInput",
			"arguments": {}
		},
		{
			"opcode": "stopAllInputListeners",
			"blockType": "COMMAND",
			"text": "stop all input listeners registered by this target",
			"description": "Removes every key, pointer, and accumulated pose binding owned by the current target.",
			"featureFlag": "asyncInput",
			"arguments": {}
		}
	]
};
//#endregion
//#region config/feature-flags.ts
var FEATURE_FLAGS = {
	asyncInput: true,
	poseInput: false
};
//#endregion
//#region src/runtime-variables.ts
function requireRuntimeVariables(runtime) {
	const extension = runtime.ext_lmsTempVars2;
	if (!extension || typeof extension.setRuntimeVariable !== "function" || typeof extension.getRuntimeVariable !== "function" || typeof extension.runtimeVariableExists !== "function") throw new Error("Temporary Variables (lmsTempVars2) must be loaded before using Async Input.");
	return extension;
}
function readRuntimeVariable(extension, name) {
	return extension.runtimeVariableExists({ VAR: name }) ? extension.getRuntimeVariable({ VAR: name }) : void 0;
}
function writeRuntimeVariable(extension, name, value) {
	extension.setRuntimeVariable({
		VAR: name,
		STRING: value
	});
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
		return typeof o;
	} : function(o) {
		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
	}, _typeof(o);
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/toPrimitive.js
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
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/defineProperty.js
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
var EXTENSION_ID = extensionConfig.id;
var DOCS_URI = extensionConfig.docsURI;
var ACCUMULATED_POSE_CHANGED_EVENT = "TM_ACCUMULATED_POSE_CHANGED";
var BLOCK_ICON_URI = extensionConfig.blockIconURI;
var ARITHMETIC_OPERATORS = /* @__PURE__ */ new Set([
	"+",
	"-",
	"*",
	"/"
]);
var POSE_CHANGE_REASONS = /* @__PURE__ */ new Set([
	"prediction",
	"reset",
	"stop"
]);
var blockDefinitions = block_definitions_default.blocks;
var internalBlockDefinitions = [{
	opcode: "listenForActorTouchAndBroadcast",
	blockType: "COMMAND",
	text: "listen for touch on actor [ACTOR] set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]",
	description: "Registers or replaces a pointer binding for a named kamishibai actor.",
	featureFlag: "asyncInput",
	arguments: {
		ACTOR: {
			type: "STRING",
			defaultValue: "Actor1"
		},
		RUNTIME_VAR: {
			type: "STRING",
			defaultValue: "input"
		},
		VALUE: {
			type: "STRING",
			defaultValue: "pressed"
		},
		MESSAGE: {
			type: "STRING",
			defaultValue: "message1"
		}
	}
}];
function normalizeName(value) {
	return String(value ?? "").trim();
}
function isArithmeticOperator(value) {
	return ARITHMETIC_OPERATORS.has(value);
}
function parseRuntimeBinding(runtimeVariable, value) {
	const operator = value[0];
	if (!operator || !isArithmeticOperator(operator)) return {
		kind: "set",
		runtimeVariable,
		value
	};
	const operandText = value.slice(1).trim();
	if (!operandText) throw new Error(`Runtime input arithmetic value ${JSON.stringify(value)} requires a numeric operand.`);
	const operand = Number(operandText);
	if (!Number.isFinite(operand)) throw new Error(`Runtime input arithmetic value ${JSON.stringify(value)} must contain a finite numeric operand.`);
	return {
		kind: "arithmetic",
		runtimeVariable,
		operator,
		operand
	};
}
function isEditableTarget(target) {
	if (!target || typeof target !== "object") return false;
	const element = target;
	const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
	return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable === true;
}
function isAccumulatedPoseChangedEventV1(payload) {
	if (!payload || typeof payload !== "object") return false;
	const event = payload;
	return event.version === 1 && typeof event.poseName === "string" && typeof event.previousPoseName === "string" && event.poseName !== event.previousPoseName && typeof event.score === "number" && Number.isFinite(event.score) && typeof event.reason === "string" && POSE_CHANGE_REASONS.has(event.reason) && typeof event.timestamp === "number" && Number.isFinite(event.timestamp);
}
var AsyncInputExtension = class {
	constructor(featureFlags = FEATURE_FLAGS) {
		_defineProperty(this, "featureFlags", void 0);
		_defineProperty(this, "runtime", Scratch.vm.runtime);
		_defineProperty(this, "keyBindings", /* @__PURE__ */ new Map());
		_defineProperty(this, "touchBindings", /* @__PURE__ */ new Map());
		_defineProperty(this, "poseBindings", /* @__PURE__ */ new Map());
		_defineProperty(this, "keyListenerAttached", false);
		_defineProperty(this, "pointerListenerAttached", false);
		_defineProperty(this, "poseListenerAttached", false);
		_defineProperty(this, "runtimeListenersAttached", false);
		_defineProperty(this, "runtimeDependencyFailureReported", false);
		_defineProperty(this, "disposed", false);
		_defineProperty(this, "handleKeyDown", (event) => {
			if (event.repeat || event.isComposing || isEditableTarget(event.target)) return;
			const bindings = [...this.keyBindings.get(event.code)?.values() ?? []];
			for (const binding of bindings) if (!this.writeFromBackgroundEvent(binding)) break;
		});
		_defineProperty(this, "handlePointerDown", (event) => {
			if (event.button !== 0) return;
			const rectangle = this.runtime.renderer.canvas.getBoundingClientRect();
			const x = event.clientX - rectangle.left;
			const y = event.clientY - rectangle.top;
			if (x <= 0 || y <= 0 || x >= rectangle.width || y >= rectangle.height) return;
			const drawableId = this.runtime.renderer.pick(x, y);
			const target = this.runtime.targets.find((candidate) => !candidate.isStage && candidate.drawableID === drawableId);
			if (!target) return;
			const binding = this.touchBindings.get(target.id);
			if (binding) this.writeFromBackgroundEvent(binding);
		});
		_defineProperty(this, "handleAccumulatedPoseChanged", (payload) => {
			if (!isAccumulatedPoseChangedEventV1(payload) || !payload.poseName) return;
			const bindings = [...this.poseBindings.get(payload.poseName)?.values() ?? []];
			for (const binding of bindings) if (!this.writeFromBackgroundEvent(binding)) break;
		});
		_defineProperty(this, "handleProjectBoundary", () => {
			this.stopAllBindings();
		});
		_defineProperty(this, "handleTargetRemoved", (target) => {
			if (target) this.removeAllBindingsForTarget(target.id);
		});
		_defineProperty(this, "handleRuntimeDisposed", () => {
			this.disposed = true;
			this.stopAllBindings();
			this.unregisterRuntimeListeners();
		});
		this.featureFlags = featureFlags;
		this.registerRuntimeListeners();
	}
	getInfo() {
		return {
			id: EXTENSION_ID,
			name: Scratch.translate(block_definitions_default.extensionName),
			docsURI: DOCS_URI,
			blockIconURI: BLOCK_ICON_URI,
			color1: extensionConfig.color1,
			color2: extensionConfig.color2,
			color3: extensionConfig.color3,
			blocks: [...blockDefinitions, ...internalBlockDefinitions].filter((block) => this.featureFlags.asyncInput && (!block.featureFlag || this.featureFlags[block.featureFlag])).map((block) => ({
				opcode: block.opcode,
				blockType: Scratch.BlockType[block.blockType],
				text: Scratch.translate(block.text),
				arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
					type: Scratch.ArgumentType[argument.type],
					defaultValue: argument.defaultValue
				}]))
			}))
		};
	}
	listenForKey(args, util) {
		this.registerKeyBinding(args, util, false);
	}
	listenForKeyAndBroadcast(args, util) {
		this.registerKeyBinding(args, util, true);
	}
	registerKeyBinding(args, util, shouldBroadcast) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		const keyId = normalizeName(args.KEY_ID);
		const runtimeVariable = normalizeName(args.RUNTIME_VAR);
		const value = String(args.VALUE ?? "");
		const broadcastMessage = shouldBroadcast ? normalizeName(args.MESSAGE) : null;
		if (!keyId) throw new Error("KEY_ID must be specified.");
		if (!runtimeVariable) throw new Error("RUNTIME_VAR must be specified.");
		if (shouldBroadcast && !broadcastMessage) throw new Error("MESSAGE must be specified.");
		requireRuntimeVariables(this.runtime);
		const binding = {
			ownerTargetId: owner.id,
			broadcastMessage,
			...parseRuntimeBinding(runtimeVariable, value)
		};
		const bindingsForKey = this.keyBindings.get(keyId) ?? /* @__PURE__ */ new Map();
		bindingsForKey.set(owner.id, binding);
		this.keyBindings.set(keyId, bindingsForKey);
		this.runtimeDependencyFailureReported = false;
		this.attachKeyListenerIfNeeded();
	}
	stopListeningForKey(args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		const keyId = normalizeName(args.KEY_ID);
		if (!keyId) throw new Error("KEY_ID must be specified.");
		this.removeKeyBinding(owner.id, keyId);
	}
	stopAllKeyListeners(_args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		this.removeAllKeyBindingsForTarget(owner.id);
	}
	listenForTouch(args, util) {
		this.registerTouchBinding(args, util, false);
	}
	listenForTouchAndBroadcast(args, util) {
		this.registerTouchBinding(args, util, true);
	}
	listenForActorTouchAndBroadcast(args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		const target = this.resolveActorTarget(args.ACTOR);
		this.registerTouchBindingForTarget(args, owner, target, true);
	}
	registerTouchBinding(args, util, shouldBroadcast) {
		this.requireActiveRuntime();
		const owner = this.requireSpriteTarget(util);
		this.registerTouchBindingForTarget(args, owner, owner, shouldBroadcast);
	}
	registerTouchBindingForTarget(args, owner, target, shouldBroadcast) {
		const runtimeVariable = normalizeName(args.RUNTIME_VAR);
		const value = String(args.VALUE ?? "");
		const broadcastMessage = shouldBroadcast ? normalizeName(args.MESSAGE) : null;
		if (!runtimeVariable) throw new Error("RUNTIME_VAR must be specified.");
		if (shouldBroadcast && !broadcastMessage) throw new Error("MESSAGE must be specified.");
		requireRuntimeVariables(this.runtime);
		this.touchBindings.set(target.id, {
			ownerTargetId: owner.id,
			broadcastMessage,
			...parseRuntimeBinding(runtimeVariable, value)
		});
		this.runtimeDependencyFailureReported = false;
		this.attachPointerListenerIfNeeded();
	}
	stopListeningForTouch(_args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		this.touchBindings.delete(owner.id);
		this.detachPointerListenerIfUnused();
	}
	listenForPose(args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		const poseName = normalizeName(args.POSE_NAME);
		const runtimeVariable = normalizeName(args.RUNTIME_VAR);
		const value = String(args.VALUE ?? "");
		if (!poseName) throw new Error("POSE_NAME must be specified.");
		if (!runtimeVariable) throw new Error("RUNTIME_VAR must be specified.");
		requireRuntimeVariables(this.runtime);
		this.requireAccumulatedPoseEvents();
		const binding = {
			ownerTargetId: owner.id,
			broadcastMessage: null,
			...parseRuntimeBinding(runtimeVariable, value)
		};
		const bindingsForPose = this.poseBindings.get(poseName) ?? /* @__PURE__ */ new Map();
		bindingsForPose.set(owner.id, binding);
		this.poseBindings.set(poseName, bindingsForPose);
		this.runtimeDependencyFailureReported = false;
		this.attachPoseListenerIfNeeded();
	}
	stopListeningForPose(args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		const poseName = normalizeName(args.POSE_NAME);
		if (!poseName) throw new Error("POSE_NAME must be specified.");
		this.removePoseBinding(owner.id, poseName);
	}
	stopAllPoseListeners(_args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		this.removeAllPoseBindingsForTarget(owner.id);
	}
	stopAllInputListeners(_args, util) {
		this.requireActiveRuntime();
		const owner = this.requireTarget(util);
		this.removeAllBindingsForTarget(owner.id);
	}
	requireActiveRuntime() {
		if (this.disposed) throw new Error("Async Input runtime has been disposed.");
	}
	requireTarget(util) {
		const target = util?.target;
		if (!target?.id) throw new Error("The current TurboWarp target is unavailable.");
		return target;
	}
	requireSpriteTarget(util) {
		const target = this.requireTarget(util);
		if (target.isStage) throw new Error("Touch input must be registered by a sprite or clone.");
		return target;
	}
	resolveActorTarget(value) {
		const actorName = normalizeName(value);
		if (!actorName) throw new Error("ACTOR must be specified.");
		const matches = this.runtime.targets.filter((target) => !target.isStage && String(target.lookupVariableByNameAndType?.("actorName", "")?.value ?? "") === actorName);
		if (matches.length === 0) throw new Error(`Actor not found: ${actorName}`);
		if (matches.length > 1) throw new Error(`Actor name is not unique: ${actorName}`);
		return matches[0];
	}
	requireAccumulatedPoseEvents() {
		const extension = this.runtime.ext_kubohiroyatm;
		if (!extension || typeof extension.supportsAccumulatedPoseEvents !== "function" || !extension.supportsAccumulatedPoseEvents()) throw new Error("TurboWarp TM accumulated pose events are unavailable. Load TurboWarp TM with temporalPoseScoring and accumulatedPoseEvents enabled.");
		return extension;
	}
	writeFromBackgroundEvent(binding) {
		let runtimeVariables;
		try {
			runtimeVariables = requireRuntimeVariables(this.runtime);
		} catch (error) {
			this.stopAllBindings();
			if (!this.runtimeDependencyFailureReported) {
				this.runtimeDependencyFailureReported = true;
				console.error("Async input bindings stopped.", error);
			}
			return false;
		}
		try {
			const value = binding.kind === "set" ? binding.value : this.evaluateArithmeticBinding(runtimeVariables, binding);
			writeRuntimeVariable(runtimeVariables, binding.runtimeVariable, value);
		} catch (error) {
			console.error("Async input binding update failed.", error);
			return true;
		}
		if (binding.broadcastMessage !== null) try {
			this.runtime.startHats("event_whenbroadcastreceived", { BROADCAST_OPTION: binding.broadcastMessage });
		} catch (error) {
			console.error("Async input binding broadcast failed.", error);
		}
		return true;
	}
	evaluateArithmeticBinding(runtimeVariables, binding) {
		const currentValue = readRuntimeVariable(runtimeVariables, binding.runtimeVariable);
		const currentNumber = Number(currentValue);
		if (!Number.isFinite(currentNumber)) throw new Error(`Runtime variable ${JSON.stringify(binding.runtimeVariable)} must contain a finite number.`);
		let result;
		switch (binding.operator) {
			case "+":
				result = currentNumber + binding.operand;
				break;
			case "-":
				result = currentNumber - binding.operand;
				break;
			case "*":
				result = currentNumber * binding.operand;
				break;
			case "/": result = currentNumber / binding.operand;
		}
		if (!Number.isFinite(result)) throw new Error(`Async input arithmetic result for ${JSON.stringify(binding.runtimeVariable)} must be finite.`);
		return result;
	}
	removeKeyBinding(ownerTargetId, keyId) {
		const bindingsForKey = this.keyBindings.get(keyId);
		bindingsForKey?.delete(ownerTargetId);
		if (bindingsForKey?.size === 0) this.keyBindings.delete(keyId);
		this.detachKeyListenerIfUnused();
	}
	removeAllKeyBindingsForTarget(ownerTargetId) {
		for (const [keyId, bindingsForKey] of this.keyBindings) {
			bindingsForKey.delete(ownerTargetId);
			if (bindingsForKey.size === 0) this.keyBindings.delete(keyId);
		}
		this.detachKeyListenerIfUnused();
	}
	removePoseBinding(ownerTargetId, poseName) {
		const bindingsForPose = this.poseBindings.get(poseName);
		bindingsForPose?.delete(ownerTargetId);
		if (bindingsForPose?.size === 0) this.poseBindings.delete(poseName);
		this.detachPoseListenerIfUnused();
	}
	removeAllPoseBindingsForTarget(ownerTargetId) {
		for (const [poseName, bindingsForPose] of this.poseBindings) {
			bindingsForPose.delete(ownerTargetId);
			if (bindingsForPose.size === 0) this.poseBindings.delete(poseName);
		}
		this.detachPoseListenerIfUnused();
	}
	removeAllTouchBindingsForTarget(ownerTargetId) {
		for (const [targetId, binding] of this.touchBindings) if (targetId === ownerTargetId || binding.ownerTargetId === ownerTargetId) this.touchBindings.delete(targetId);
		this.detachPointerListenerIfUnused();
	}
	removeAllBindingsForTarget(ownerTargetId) {
		this.removeAllKeyBindingsForTarget(ownerTargetId);
		this.removeAllTouchBindingsForTarget(ownerTargetId);
		this.removeAllPoseBindingsForTarget(ownerTargetId);
	}
	stopAllBindings() {
		this.keyBindings.clear();
		this.touchBindings.clear();
		this.poseBindings.clear();
		this.detachKeyListenerIfUnused();
		this.detachPointerListenerIfUnused();
		this.detachPoseListenerIfUnused();
	}
	attachKeyListenerIfNeeded() {
		if (this.keyListenerAttached || this.keyBindings.size === 0) return;
		window.addEventListener("keydown", this.handleKeyDown);
		this.keyListenerAttached = true;
	}
	detachKeyListenerIfUnused() {
		if (!this.keyListenerAttached || this.keyBindings.size > 0) return;
		window.removeEventListener("keydown", this.handleKeyDown);
		this.keyListenerAttached = false;
	}
	attachPointerListenerIfNeeded() {
		if (this.pointerListenerAttached || this.touchBindings.size === 0) return;
		this.runtime.renderer.canvas.addEventListener("pointerdown", this.handlePointerDown);
		this.pointerListenerAttached = true;
	}
	detachPointerListenerIfUnused() {
		if (!this.pointerListenerAttached || this.touchBindings.size > 0) return;
		this.runtime.renderer.canvas.removeEventListener("pointerdown", this.handlePointerDown);
		this.pointerListenerAttached = false;
	}
	attachPoseListenerIfNeeded() {
		if (this.poseListenerAttached || this.poseBindings.size === 0) return;
		this.runtime.on(ACCUMULATED_POSE_CHANGED_EVENT, this.handleAccumulatedPoseChanged);
		this.poseListenerAttached = true;
	}
	detachPoseListenerIfUnused() {
		if (!this.poseListenerAttached || this.poseBindings.size > 0) return;
		this.runtime.off(ACCUMULATED_POSE_CHANGED_EVENT, this.handleAccumulatedPoseChanged);
		this.poseListenerAttached = false;
	}
	registerRuntimeListeners() {
		if (this.runtimeListenersAttached) return;
		this.runtime.on("PROJECT_STOP_ALL", this.handleProjectBoundary);
		this.runtime.on("PROJECT_START", this.handleProjectBoundary);
		this.runtime.on("targetWasRemoved", this.handleTargetRemoved);
		this.runtime.on("RUNTIME_DISPOSED", this.handleRuntimeDisposed);
		this.runtimeListenersAttached = true;
	}
	unregisterRuntimeListeners() {
		if (!this.runtimeListenersAttached) return;
		this.runtime.off("PROJECT_STOP_ALL", this.handleProjectBoundary);
		this.runtime.off("PROJECT_START", this.handleProjectBoundary);
		this.runtime.off("targetWasRemoved", this.handleTargetRemoved);
		this.runtime.off("RUNTIME_DISPOSED", this.handleRuntimeDisposed);
		this.runtimeListenersAttached = false;
	}
};
//#endregion
//#region src/index.ts
if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
Scratch.extensions.register(new AsyncInputExtension());
//#endregion

})(Scratch);
