// Name: Asset Cache
// ID: kubohiroyaassetcache
// Description: Register, cache, display, and play image, audio, and runtime text assets in TurboWarp.
// By: Hiroya Kubo
// License: MPL-2.0
// Unsandboxed: required
// Description[ja]: TurboWarpで画像・音声・実行時テキストの素材を登録・保持し、表示・再生します。

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyaassetcache",
	slug: "asset-cache",
	name: "Asset Cache",
	description: "Register, cache, display, and play image, audio, and runtime text assets in TurboWarp.",
	descriptions: { ja: "TurboWarpで画像・音声・実行時テキストの素材を登録・保持し、表示・再生します。" },
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: "required",
	docsURI: "https://kubohiroya.github.io/turbowarp-asset-cache/",
	color1: "#5b7cfa",
	color2: "#425ed8",
	color3: "#2f46aa",
	blockIconURI: `data:image/svg+xml,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><rect x=\"4\" y=\"8\" width=\"40\" height=\"32\" rx=\"6\" fill=\"#59C059\"/><path d=\"M14 20h12l3 3h7v12a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V22a2 2 0 0 1 2-2z\" fill=\"#fff\"/><path d=\"M24 17v8M21 22l3 3 3-3\" fill=\"none\" stroke=\"#59C059\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>")}`
};
//#endregion
//#region src/indexeddb.ts
function openIndexedDB(options) {
	const { factory, errors, signal } = options;
	if (!factory || typeof factory.open !== "function") return Promise.reject(errors.unavailable());
	if (signal?.aborted) return Promise.reject(abortErrorFor(options, signal.reason));
	let request;
	try {
		request = factory.open(options.name, options.version);
	} catch (error) {
		return Promise.reject(errors.openThrew(error));
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const abort = () => rejectOnce(abortErrorFor(options, signal?.reason));
		const finish = () => {
			settled = true;
			signal?.removeEventListener("abort", abort);
		};
		const rejectOnce = (error) => {
			if (settled) return;
			finish();
			reject(error);
		};
		signal?.addEventListener("abort", abort, { once: true });
		request.onupgradeneeded = () => {
			options.upgrade(request.result, request.transaction);
		};
		request.onsuccess = () => {
			const database = request.result;
			if (settled) {
				database.close();
				return;
			}
			const arrivalError = options.rejectArrival?.() ?? null;
			if (arrivalError) {
				database.close();
				rejectOnce(arrivalError);
				return;
			}
			finish();
			if (options.closeOnVersionChange !== false) database.onversionchange = () => {
				database.close();
				options.onClosedByVersionChange?.(database);
			};
			resolve(database);
		};
		request.onerror = () => rejectOnce(errors.requestFailed(request.error));
		request.onblocked = () => rejectOnce(errors.blocked());
	});
}
function abortErrorFor(options, reason) {
	if (!options.abortError) throw new TypeError("openIndexedDB needs abortError with a signal.");
	return options.abortError(reason);
}
/** Resolve with a request's result. */
function requestResult(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB request failed."));
	});
}
//#endregion
//#region src/persistent-asset-store.ts
/**
* The single owner of the `tw-asset-cache` IndexedDB database in a page.
*
* Every copy of this package that runs in the page — the standalone extension, and each extension
* bundle that composes the Asset Manager from `./composition` — shares one store through a
* `Symbol.for` registry on the global object. The store holds the one database connection, the
* records the page committed, and the write generations, so one copy never answers from a record
* another copy already replaced or deleted, and generations never collide between copies.
*/
var PERSISTENT_ASSET_STORE_KEY = Symbol.for("@kubohiroya/turbowarp-asset-cache/persistent-store");
var DATABASE_VERSION = 1;
var STORE_NAME = "assets";
/** Create a store. Callers in a page use {@link acquirePersistentAssetStore} instead. */
function createPersistentAssetStore(indexedDBSource = () => globalThis.indexedDB) {
	const committedRecords = /* @__PURE__ */ new Map();
	let generation = 0;
	let connection = null;
	let openedDatabase = null;
	function open() {
		connection ?? (connection = openIndexedDB({
			factory: indexedDBSource(),
			name: "tw-asset-cache",
			version: DATABASE_VERSION,
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "name" });
			},
			onClosedByVersionChange: (database) => {
				if (openedDatabase === database) {
					openedDatabase = null;
					connection = null;
				}
			},
			errors: {
				unavailable: () => /* @__PURE__ */ new Error("IndexedDB is unavailable, so the asset cache cannot be used."),
				openThrew: (cause) => new Error("The asset cache database could not be opened.", { cause }),
				requestFailed: (cause) => new Error("The asset cache database could not be opened.", { cause }),
				blocked: () => /* @__PURE__ */ new Error("The asset cache database is blocked by another page.")
			}
		}).then((database) => {
			openedDatabase = database;
			return database;
		}));
		const pending = connection;
		pending.catch(() => {
			if (connection === pending) connection = null;
		});
		return pending;
	}
	async function run(mode, action) {
		return requestResult(action((await open()).transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
	}
	return Object.freeze({
		formatVersion: 1,
		committed(name) {
			return committedRecords.has(name) ? committedRecords.get(name) ?? null : void 0;
		},
		commit(name, record) {
			committedRecords.set(name, record);
		},
		nextGeneration() {
			generation += 1;
			return generation;
		},
		async get(name) {
			return await run("readonly", (store) => store.get(name)) ?? null;
		},
		async put(record) {
			await run("readwrite", (store) => store.put(record));
		},
		async delete(name) {
			await run("readwrite", (store) => store.delete(name));
			committedRecords.set(name, null);
		},
		async clear() {
			await run("readwrite", (store) => store.clear());
			committedRecords.clear();
		},
		async restoreIfGeneration(name, writtenGeneration, previous) {
			const database = await open();
			await new Promise((resolve, reject) => {
				const transaction = database.transaction(STORE_NAME, "readwrite");
				const store = transaction.objectStore(STORE_NAME);
				const request = store.get(name);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					if (request.result?.generation !== writtenGeneration) return;
					if (previous) store.put(previous);
					else store.delete(name);
				};
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			});
		},
		close() {
			const pending = connection;
			connection = null;
			openedDatabase = null;
			pending?.then((database) => database.close(), () => void 0);
		}
	});
}
function isPersistentAssetStore(value) {
	if (!value || typeof value !== "object") return false;
	const candidate = value;
	return candidate.formatVersion === 1 && [
		"committed",
		"commit",
		"nextGeneration",
		"get",
		"put",
		"delete",
		"clear",
		"restoreIfGeneration",
		"close"
	].every((method) => typeof candidate[method] === "function");
}
/**
* The page's one store. The first copy of this package to ask creates it; every later copy, from
* this version or another, receives the same one.
*/
function acquirePersistentAssetStore(globalObject = globalThis) {
	const existing = globalObject[PERSISTENT_ASSET_STORE_KEY];
	if (existing !== void 0) {
		if (!isPersistentAssetStore(existing)) throw new Error("The page already holds an asset cache store this version cannot share.");
		return existing;
	}
	const store = createPersistentAssetStore(() => globalObject.indexedDB);
	Object.defineProperty(globalObject, PERSISTENT_ASSET_STORE_KEY, {
		value: store,
		configurable: false,
		enumerable: false,
		writable: false
	});
	return store;
}
//#endregion
//#region src/audio-output.ts
/** Media volume handles attenuation and fades; this shared graph adds amplification. */
var shared;
var maximumFloat = 34028234663852886e22;
function createAudioAmplifier(audio) {
	if (typeof globalThis.AudioContext !== "function") throw new Error("Audio amplification requires Web Audio support.");
	if (!shared || shared.context.state === "closed") shared = {
		context: new AudioContext(),
		users: 0
	};
	const owner = shared;
	owner.users++;
	let source;
	let gain;
	let released = false;
	const dispose = () => {
		if (released) return;
		released = true;
		source?.disconnect();
		gain?.disconnect();
		owner.users--;
		if (owner.users === 0) {
			if (shared === owner) shared = void 0;
			owner.context.close().catch(() => {});
		}
	};
	try {
		source = owner.context.createMediaElementSource(audio);
		gain = owner.context.createGain();
		source.connect(gain);
		gain.connect(owner.context.destination);
	} catch (error) {
		dispose();
		throw error;
	}
	const node = gain;
	return {
		setGain(value) {
			node.gain.value = Math.min(maximumFloat, Math.max(1, value));
		},
		resume() {
			return owner.context.state === "running" ? Promise.resolve() : owner.context.resume();
		},
		dispose
	};
}
//#endregion
//#region src/audio-playback.ts
function playbackGain(value) {
	const gain = value === void 0 ? 1 : value;
	if (typeof gain !== "number" || !Number.isFinite(gain) || gain < 0) throw new TypeError("Audio gain must be a finite non-negative number.");
	return gain;
}
function rate(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < .25 || value > 4) throw new TypeError("Audio playback rate must be from 0.25 to 4.");
	return value;
}
function validateAudioPlaybackOptions(options) {
	if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => ![
		"gain",
		"muted",
		"playbackRate",
		"fadeIn",
		"fadeOut"
	].includes(key))) throw new TypeError("Invalid audio playback options.");
	playbackGain(options.gain);
	if (options.muted !== void 0 && typeof options.muted !== "boolean") throw new TypeError("Audio muted must be a boolean.");
	rate(options.playbackRate ?? 1);
	fadeSeconds(options.fadeIn, "fadeIn");
	fadeSeconds(options.fadeOut, "fadeOut");
}
function fadeSeconds(value, label) {
	const seconds = value === void 0 ? 0 : value;
	if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw new TypeError(`Audio ${label} must be a finite non-negative number of seconds.`);
	return seconds;
}
function aborted() {
	const error = /* @__PURE__ */ new Error("Audio playback was cancelled.");
	error.name = "AbortError";
	return error;
}
/** One reusable native element; the caller owns source resolution and resource release. */
function createBrowserAudioPlayback(audio, options, release, playbackError) {
	validateAudioPlaybackOptions(options);
	let gain = playbackGain(options.gain);
	audio.volume = Math.min(1, gain);
	audio.muted = options.muted ?? false;
	audio.playbackRate = options.playbackRate ?? 1;
	audio.loop = false;
	const defaultFadeIn = fadeSeconds(options.fadeIn, "fadeIn");
	const defaultFadeOut = fadeSeconds(options.fadeOut, "fadeOut");
	let activeFadeIn = defaultFadeIn;
	let activeFadeOut = defaultFadeOut;
	let envelope = 1;
	let fadeStarted = 0;
	let playing = false;
	let fadeTimer;
	let stopping;
	let amplifier;
	const pendingGain = /* @__PURE__ */ new Set();
	let disposed = false;
	let generation = 0;
	let ended = Promise.resolve();
	let settle;
	let rejectStart;
	let detachAbort;
	const pendingMetadata = /* @__PURE__ */ new Set();
	const requireActive = () => {
		if (disposed) throw new Error("Audio playback is disposed.");
	};
	const clearFadeTimer = () => {
		if (fadeTimer !== void 0) clearTimeout(fadeTimer);
		fadeTimer = void 0;
	};
	const finish = (error) => {
		playing = false;
		for (const reject of pendingGain) reject(error ?? aborted());
		pendingGain.clear();
		clearFadeTimer();
		const previousStop = stopping;
		stopping = void 0;
		previousStop?.detach();
		previousStop?.reject(error ?? aborted());
		generation++;
		rejectStart?.(error ?? aborted());
		rejectStart = void 0;
		detachAbort?.();
		detachAbort = void 0;
		settle?.(error);
		settle = void 0;
	};
	const writeVolume = () => {
		audio.volume = Math.min(1, gain) * envelope;
		amplifier?.setGain(gain);
	};
	const prepareAmplifier = () => {
		if (!amplifier && gain > 1) amplifier = createAudioAmplifier(audio);
		writeVolume();
	};
	const stopNow = () => {
		const completed = stopping;
		stopping = void 0;
		completed?.detach();
		audio.pause();
		audio.loop = false;
		audio.currentTime = 0;
		finish();
		envelope = 1;
		writeVolume();
		completed?.resolve();
	};
	const refreshFade = () => {
		clearFadeTimer();
		if (disposed || !playing && !stopping) return;
		const now = performance.now();
		let delay = 16;
		if (stopping) {
			const progress = Math.min(1, (now - stopping.started) / (stopping.seconds * 1e3));
			envelope = stopping.from * (1 - progress);
			writeVolume();
			if (progress >= 1) {
				stopNow();
				return;
			}
		} else {
			const fadeIn = activeFadeIn === 0 ? 1 : Math.min(1, (now - fadeStarted) / (activeFadeIn * 1e3));
			const remaining = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - audio.currentTime) / audio.playbackRate : Infinity;
			const fadeOut = !audio.loop && activeFadeOut > 0 ? Math.min(1, remaining / activeFadeOut) : 1;
			envelope = Math.max(0, Math.min(fadeIn, fadeOut));
			writeVolume();
			if (fadeIn >= 1) {
				if (audio.loop || activeFadeOut === 0) return;
				if (!Number.isFinite(remaining)) delay = 250;
				else if (remaining > activeFadeOut) delay = Math.min(250, Math.max(16, (remaining - activeFadeOut) * 1e3));
			}
		}
		fadeTimer = setTimeout(refreshFade, delay);
	};
	const onEnded = () => {
		if (stopping) {
			stopNow();
			return;
		}
		finish();
		if (activeFadeOut > 0 && !audio.loop) {
			envelope = 0;
			writeVolume();
		}
	};
	const onError = () => {
		audio.pause();
		const error = playbackError(audio.error ?? /* @__PURE__ */ new Error("The browser audio element reported a playback error."));
		finish(error);
		for (const complete of pendingMetadata) complete(error);
	};
	audio.addEventListener("ended", onEnded);
	audio.addEventListener("error", onError);
	for (const event of [
		"durationchange",
		"ratechange",
		"seeked"
	]) audio.addEventListener(event, refreshFade);
	return Object.freeze({
		get ended() {
			return ended;
		},
		get currentTime() {
			return audio.currentTime;
		},
		get paused() {
			return audio.paused;
		},
		get loop() {
			return audio.loop;
		},
		get gain() {
			return gain;
		},
		get muted() {
			return audio.muted;
		},
		get playbackRate() {
			return audio.playbackRate;
		},
		async play(playOptions = {}) {
			requireActive();
			if (!playOptions || typeof playOptions !== "object" || Array.isArray(playOptions) || Object.keys(playOptions).some((key) => ![
				"restart",
				"loop",
				"signal",
				"fadeIn",
				"fadeOut",
				"gain"
			].includes(key)) || playOptions.restart !== void 0 && typeof playOptions.restart !== "boolean" || playOptions.loop !== void 0 && typeof playOptions.loop !== "boolean") throw new TypeError("Invalid audio play options.");
			const fadeIn = fadeSeconds(playOptions.fadeIn === void 0 ? defaultFadeIn : playOptions.fadeIn, "fadeIn");
			const fadeOut = fadeSeconds(playOptions.fadeOut === void 0 ? defaultFadeOut : playOptions.fadeOut, "fadeOut");
			const nextGain = playOptions.gain === void 0 ? gain : playbackGain(playOptions.gain);
			const signal = playOptions.signal;
			if (signal?.aborted) throw aborted();
			finish();
			const run = generation;
			gain = nextGain;
			if (playOptions.restart) audio.currentTime = 0;
			audio.loop = playOptions.loop ?? audio.loop;
			activeFadeIn = fadeIn;
			activeFadeOut = fadeOut;
			envelope = fadeIn > 0 ? 0 : 1;
			writeVolume();
			ended = new Promise((resolve, reject) => {
				settle = (error) => error === void 0 ? resolve() : reject(error);
			});
			ended.catch(() => {});
			const onAbort = () => {
				audio.pause();
				finish(aborted());
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			detachAbort = () => signal?.removeEventListener("abort", onAbort);
			try {
				prepareAmplifier();
				const started = audio.play();
				const ready = amplifier ? Promise.all([started, amplifier.resume()]) : Promise.resolve(started);
				await Promise.race([ready, new Promise((_resolve, reject) => {
					rejectStart = reject;
				})]);
				if (run !== generation) throw aborted();
				rejectStart = void 0;
				playing = true;
				fadeStarted = performance.now();
				refreshFade();
			} catch (cause) {
				if (run !== generation) throw cause;
				audio.pause();
				const error = playbackError(cause);
				finish(error);
				throw error;
			}
		},
		pause() {
			requireActive();
			audio.pause();
			finish();
		},
		stop(stopOptions = {}) {
			requireActive();
			if (!stopOptions || typeof stopOptions !== "object" || Array.isArray(stopOptions) || Object.keys(stopOptions).some((key) => !["fadeOut", "signal"].includes(key))) throw new TypeError("Invalid audio stop options.");
			const seconds = fadeSeconds(stopOptions.fadeOut === void 0 ? activeFadeOut : stopOptions.fadeOut, "fadeOut");
			const signal = stopOptions.signal;
			if (signal?.aborted) throw aborted();
			if (seconds === 0 || audio.paused || !playing) {
				stopNow();
				return;
			}
			const previous = stopping;
			stopping = void 0;
			previous?.detach();
			previous?.reject(aborted());
			return new Promise((resolve, reject) => {
				const onAbort = () => {
					const current = stopping;
					stopping = void 0;
					current?.detach();
					stopNow();
					reject(aborted());
				};
				stopping = {
					started: performance.now(),
					seconds,
					from: envelope,
					resolve,
					reject,
					detach: () => signal?.removeEventListener("abort", onAbort)
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				if (signal?.aborted) onAbort();
				else refreshFade();
			});
		},
		async seek(seconds, signal) {
			requireActive();
			if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Audio seek time must be non-negative.");
			if (signal?.aborted) throw aborted();
			if (audio.readyState < 1) await new Promise((resolve, reject) => {
				const complete = (error) => {
					clearTimeout(timer);
					audio.removeEventListener("loadedmetadata", ready);
					signal?.removeEventListener("abort", cancel);
					pendingMetadata.delete(complete);
					if (error === void 0) resolve();
					else reject(error);
				};
				const ready = () => complete();
				const cancel = () => complete(aborted());
				const timer = setTimeout(() => complete(/* @__PURE__ */ new Error("Audio metadata did not become ready.")), 1e4);
				pendingMetadata.add(complete);
				audio.addEventListener("loadedmetadata", ready, { once: true });
				signal?.addEventListener("abort", cancel, { once: true });
				if (signal?.aborted) cancel();
				else if (audio.readyState >= 1) ready();
			});
			requireActive();
			if (signal?.aborted) throw aborted();
			if (Number.isFinite(audio.duration) && seconds > audio.duration) throw new RangeError("Audio seek exceeds its duration.");
			audio.currentTime = seconds;
			refreshFade();
		},
		setGain(value) {
			const normalized = playbackGain(value);
			requireActive();
			const previous = gain;
			gain = normalized;
			try {
				if (playing) prepareAmplifier();
				else writeVolume();
			} catch (error) {
				gain = previous;
				writeVolume();
				throw playbackError(error);
			}
			if (playing && amplifier) {
				const run = generation;
				let rejectResume;
				const cancelled = new Promise((_resolve, reject) => {
					rejectResume = reject;
				});
				pendingGain.add(rejectResume);
				return Promise.race([amplifier.resume(), cancelled]).catch((cause) => {
					if (run !== generation) throw cause;
					audio.pause();
					const error = playbackError(cause);
					finish(error);
					throw error;
				}).finally(() => pendingGain.delete(rejectResume));
			}
		},
		setMuted(value) {
			if (typeof value !== "boolean") throw new TypeError("Audio muted must be a boolean.");
			requireActive();
			audio.muted = value;
		},
		setPlaybackRate(value) {
			const normalized = rate(value);
			requireActive();
			audio.playbackRate = normalized;
			refreshFade();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			try {
				audio.pause();
				audio.currentTime = 0;
			} catch {}
			finish();
			for (const complete of pendingMetadata) complete(aborted());
			audio.removeEventListener("ended", onEnded);
			audio.removeEventListener("error", onError);
			for (const event of [
				"durationchange",
				"ratechange",
				"seeked"
			]) audio.removeEventListener(event, refreshFade);
			try {
				audio.removeAttribute?.("src");
				audio.load?.();
			} finally {
				try {
					amplifier?.dispose();
				} finally {
					release();
				}
			}
		}
	});
}
var block_definitions_default = {
	extensionName: "Asset Cache",
	blocks: [
		{
			"opcode": "registerAsset",
			"blockType": "COMMAND",
			"text": "register resource [RESOURCE_ID] as asset [NAME]",
			"description": "Registers an external URL, cached asset, sprite costume, stage backdrop, project sound, or runtime text variable under one asset name.",
			"arguments": {
				"RESOURCE_ID": {
					"type": "STRING",
					"defaultValue": "https://example.com/asset.png"
				},
				"NAME": {
					"type": "STRING",
					"defaultValue": "asset1"
				}
			}
		},
		{
			"opcode": "assetErrorType",
			"blockType": "REPORTER",
			"text": "asset registration error type",
			"description": "Returns the stable error code for the most recent asset registration failure, or an empty string when the latest registration succeeded.",
			"arguments": {}
		},
		{
			"opcode": "assetErrorLabel",
			"blockType": "REPORTER",
			"text": "asset registration error label",
			"description": "Returns the relevant asset, resource, or actor name for the most recent registration failure, or an empty string when the latest registration succeeded.",
			"arguments": {}
		},
		{
			"opcode": "loadAsset",
			"blockType": "COMMAND",
			"text": "load asset from URL [URL] or cache as [NAME]",
			"description": "Legacy compatibility block. Loads an external image or audio asset from the supplied URL, or from IndexedDB when the URL is empty.",
			"arguments": {
				"URL": {
					"type": "STRING",
					"defaultValue": "https://example.com/asset.png"
				},
				"NAME": {
					"type": "STRING",
					"defaultValue": "asset1"
				}
			},
			"hideFromPalette": true
		},
		{
			"opcode": "deleteMemoryAsset",
			"blockType": "COMMAND",
			"text": "delete asset [NAME] from memory",
			"description": "Unregisters one asset. Owned external renderer skins are released; project costumes, sounds, and runtime variables are left unchanged.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "asset1"
			} }
		},
		{
			"opcode": "deleteAllMemoryAssets",
			"blockType": "COMMAND",
			"text": "delete all assets from memory",
			"description": "Unregisters all assets, releases owned external renderer skins, stops actor animations, and stops tracked external audio playback.",
			"arguments": {}
		},
		{
			"opcode": "deleteCachedAsset",
			"blockType": "COMMAND",
			"text": "delete asset [NAME] from cache",
			"description": "Deletes one named external asset from the IndexedDB cache.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "asset1"
			} }
		},
		{
			"opcode": "deleteAllCachedAssets",
			"blockType": "COMMAND",
			"text": "delete all assets from cache",
			"description": "Clears all external assets from the IndexedDB cache.",
			"arguments": {}
		},
		{
			"opcode": "isLoaded",
			"blockType": "BOOLEAN",
			"text": "asset [NAME] is loaded",
			"description": "Returns whether the named external, project-local, or runtime text asset is currently registered.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "asset1"
			} }
		},
		{
			"opcode": "setTextValue",
			"blockType": "COMMAND",
			"text": "set text asset [NAME] to [VALUE]",
			"description": "Sets the runtime text value for a text asset using Asset Cache's internal namespace.",
			"arguments": {
				"NAME": {
					"type": "STRING",
					"defaultValue": "Narration"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "Once upon a time..."
				}
			}
		},
		{
			"opcode": "setTextStyle",
			"blockType": "COMMAND",
			"text": "set text asset [NAME] style [PROPERTY] to [VALUE]",
			"description": "Sets one runtime style property for a text asset. Supported properties are animation, font, color, width, and align. An empty value restores the default.",
			"arguments": {
				"NAME": {
					"type": "STRING",
					"defaultValue": "Narration"
				},
				"PROPERTY": {
					"type": "STRING",
					"defaultValue": "font"
				},
				"VALUE": {
					"type": "STRING",
					"defaultValue": "Sans Serif"
				}
			}
		},
		{
			"opcode": "setThisSpriteSkin",
			"blockType": "COMMAND",
			"text": "show asset [NAME] on this sprite",
			"description": "Applies a registered image asset or displays a registered runtime text asset on the current sprite or clone.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "asset1"
			} }
		},
		{
			"opcode": "setSpriteSkin",
			"blockType": "COMMAND",
			"text": "show asset [NAME] on [SPRITE] (compatibility)",
			"description": "Stops any actor animation and applies a registered image asset or displays a registered runtime text asset on a named sprite. This block is retained for compatibility.",
			"arguments": {
				"SPRITE": {
					"type": "STRING",
					"defaultValue": "Sprite1"
				},
				"NAME": {
					"type": "STRING",
					"defaultValue": "asset1"
				}
			}
		},
		{
			"opcode": "startActorLoop",
			"blockType": "COMMAND",
			"text": "loop actor [ACTOR] through assets [ASSETS] for seconds [DURATIONS]",
			"description": "Starts or replaces a background loop. ASSETS contains registered image or audio asset names. DURATIONS must have the same number of items; each item is the interval before the next asset, including the last-to-first interval. A zero makes the next asset start together with the preceding asset. If a simultaneous group has multiple image assets, only its last image is applied. Empty ASSETS and DURATIONS stop the actor animation.",
			"arguments": {
				"ACTOR": {
					"type": "STRING",
					"defaultValue": "Sprite1"
				},
				"ASSETS": {
					"type": "STRING",
					"defaultValue": "asset1,asset2"
				},
				"DURATIONS": {
					"type": "STRING",
					"defaultValue": "0.5,0.5"
				}
			}
		},
		{
			"opcode": "startActorSequence",
			"blockType": "COMMAND",
			"text": "play actor [ACTOR] through assets [ASSETS] for seconds [DURATIONS] once in background",
			"description": "Starts or replaces a one-shot background sequence and returns immediately. ASSETS contains registered image or audio asset names. DURATIONS must have exactly one fewer item; each item is the interval before the next asset. A zero makes the next asset start together with the preceding asset. If a simultaneous group has multiple image assets, only its last image is applied.",
			"arguments": {
				"ACTOR": {
					"type": "STRING",
					"defaultValue": "Sprite1"
				},
				"ASSETS": {
					"type": "STRING",
					"defaultValue": "asset1,asset2"
				},
				"DURATIONS": {
					"type": "STRING",
					"defaultValue": "0.5"
				}
			}
		},
		{
			"opcode": "stopActorAnimation",
			"blockType": "COMMAND",
			"text": "stop animation of actor [ACTOR]",
			"description": "Stops the actor's current loop or sequence and leaves the currently displayed skin unchanged.",
			"arguments": { "ACTOR": {
				"type": "STRING",
				"defaultValue": "Sprite1"
			} }
		},
		{
			"opcode": "finishAllActorSequences",
			"blockType": "COMMAND",
			"text": "finish all actor sequences",
			"description": "Finishes every one-shot actor sequence on its final image without stopping loops.",
			"arguments": {}
		},
		{
			"opcode": "setStageSkin",
			"blockType": "COMMAND",
			"text": "set stage backdrop to asset [NAME]",
			"description": "Applies a registered external image, sprite costume, or stage backdrop to the stage drawable.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "backdrop1"
			} }
		},
		{
			"opcode": "playSound",
			"blockType": "COMMAND",
			"text": "play asset [NAME] as sound",
			"description": "Starts playback of a registered external audio asset or project sound without waiting for completion.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "sound1"
			} }
		},
		{
			"opcode": "playSoundUntilDone",
			"blockType": "COMMAND",
			"text": "play asset [NAME] as sound until done",
			"description": "Plays a registered external audio asset or project sound and waits until playback ends or fails.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "sound1"
			} }
		},
		{
			"opcode": "stopSound",
			"blockType": "COMMAND",
			"text": "stop asset sound [NAME]",
			"description": "Stops every active playback of one registered external or project sound asset without stopping other sounds.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "sound1"
			} }
		},
		{
			"opcode": "stopAllSounds",
			"blockType": "COMMAND",
			"text": "stop all asset sounds",
			"description": "Stops all external and project sounds currently tracked by Asset Cache.",
			"arguments": {}
		},
		{
			"opcode": "getAssetMimeType",
			"blockType": "REPORTER",
			"text": "MIME type of asset [NAME]",
			"description": "Returns the normalized MIME type of a registered external, project-local, or runtime text asset.",
			"arguments": { "NAME": {
				"type": "STRING",
				"defaultValue": "asset1"
			} }
		},
		{
			"opcode": "getVersion",
			"blockType": "REPORTER",
			"text": "Asset Cache version",
			"description": "Returns the Asset Cache implementation version.",
			"arguments": {}
		}
	]
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
	$id: "https://kubohiroya.github.io/turbowarp-asset-cache/schemas/block-editor-fixed-inputs.schema.json",
	$defs: {
		"setTextStyle": {
			"type": "object",
			"properties": {
				"PROPERTY": {
					"type": "string",
					"enum": [
						"animation",
						"font",
						"color",
						"width",
						"align"
					]
				},
				"VALUE": { "type": "string" }
			},
			"additionalProperties": false
		},
		"animation": {
			"type": "string",
			"enum": [
				"",
				"none",
				"type",
				"rainbow",
				"zoom",
				"shake"
			]
		},
		"font": { "type": "string" },
		"color": {
			"type": "string",
			"pattern": "^(?:|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$"
		},
		"width": {
			"type": "string",
			"$comment": "Empty/trimmed empty resets; otherwise normalizeTextStyleValue requires Number(value) finite and positive. Preserve the existing STRING grammar, including hexadecimal and leading plus."
		},
		"align": {
			"type": "string",
			"enum": [
				"",
				"left",
				"center",
				"right"
			]
		},
		"loadingCostumeAt": {
			"type": "object",
			"properties": { "INDEX": { "type": "number" } },
			"additionalProperties": false
		}
	}
};
//#endregion
//#region src/fixed-input-schema.ts
/** Canonical owner schema fragments; no network resources or runtime providers. */
function fixedInputBundle(fragment, schema) {
	const source = {
		repository: "turbowarp-asset-cache",
		path: "schemas/block-editor-fixed-inputs.schema.json",
		symbol: {
			"setTextStyle-PROPERTY": "#/$defs/setTextStyle/properties/PROPERTY",
			"setTextStyle-VALUE": "#/$defs/setTextStyle/properties/VALUE",
			"loadingCostumeAt-INDEX": "#/$defs/loadingCostumeAt/properties/INDEX"
		}[fragment] ?? `#/$defs/${fragment}`
	};
	return {
		identity: {
			ownerId: "turbowarp-asset-cache",
			contractId: "fixed-inputs",
			revision: "1",
			variantId: fragment
		},
		dialect: "2020-12",
		root: {
			retrievalUri: block_editor_fixed_inputs_schema_default.$id,
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
					repository: "turbowarp-asset-cache",
					path: "src/text-style.ts",
					symbol: "normalizeTextStyleProperty / normalizeTextStyleValue"
				},
				{
					repository: "turbowarp-asset-cache",
					path: "src/extension.ts",
					symbol: "getInfo / loadingCostumeAt"
				}
			],
			generatedFiles: [],
			referenceSchemas: [],
			generationSources: []
		}
	};
}
var fixedSchemas = block_editor_fixed_inputs_schema_default.$defs;
//#endregion
//#region src/text-style.ts
var TEXT_RUNTIME_NAMESPACE = "text";
var TEXT_STYLE_RUNTIME_NAMESPACE = "textStyle";
var TEXT_STYLE_PROPERTIES = [
	"animation",
	"font",
	"color",
	"width",
	"align"
];
var DEFAULT_STAGE_WIDTH = 480;
var DEFAULT_FONT = "Handwriting";
var DEFAULT_COLOR = "#ffffff";
var DEFAULT_ALIGNMENT = "center";
var DEFAULT_OUTLINE_COLOR = "#000000";
function textRuntimeVariableName(name) {
	return `${TEXT_RUNTIME_NAMESPACE}:${name}`;
}
function textStyleRuntimeVariableName(name, property) {
	return `${TEXT_STYLE_RUNTIME_NAMESPACE}:${name}:${property}`;
}
function normalizeTextStyleProperty(value) {
	const property = String(value ?? "").trim().toLowerCase();
	if (TEXT_STYLE_PROPERTIES.includes(property)) return property;
	throw new Error(`Unknown text style property: ${property || "(empty)"}`);
}
/**
* Normalize a DSL-facing style value for runtime-variable storage.
* An empty value intentionally resets the property to its default.
*/
function normalizeTextStyleValue(property, value) {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	switch (property) {
		case "animation": {
			const animation = raw.toLowerCase() === "typing" ? "type" : raw.toLowerCase();
			if (animation === "none" || animation === "type" || animation === "rainbow" || animation === "zoom" || animation === "shake") return animation;
			throw new Error(`Invalid text animation: ${raw}`);
		}
		case "font": return raw;
		case "color": {
			if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
			const shortColor = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
			if (shortColor) return `#${shortColor[1]}${shortColor[1]}${shortColor[2]}${shortColor[2]}${shortColor[3]}${shortColor[3]}`.toLowerCase();
			throw new Error(`Invalid text color: ${raw}`);
		}
		case "width": {
			const width = Number(raw);
			if (!Number.isFinite(width) || width <= 0) throw new Error(`Text width must be a positive number: ${raw}`);
			return String(width);
		}
		case "align": {
			const align = raw.toLowerCase();
			if (align === "left" || align === "center" || align === "right") return align;
			throw new Error(`Invalid text alignment: ${raw}`);
		}
	}
}
function resolveTextStyle(name, stageWidth, getRuntimeVariable) {
	const width = Number(stageWidth);
	const defaults = {
		animation: "none",
		font: DEFAULT_FONT,
		color: DEFAULT_COLOR,
		width: Number.isFinite(width) && width > 0 ? width : DEFAULT_STAGE_WIDTH,
		align: DEFAULT_ALIGNMENT
	};
	const read = (property) => normalizeTextStyleValue(property, getRuntimeVariable(textStyleRuntimeVariableName(name, property)));
	const animation = read("animation");
	const font = read("font");
	const color = read("color");
	const configuredWidth = read("width");
	const align = read("align");
	return {
		animation: animation ? animation : defaults.animation,
		font: font || defaults.font,
		color: color || defaults.color,
		width: configuredWidth ? Number(configuredWidth) : defaults.width,
		align: align ? align : defaults.align
	};
}
//#endregion
//#region src/fixed-input-editors.ts
var extensionId = "kubohiroyaassetcache";
var choices = (values) => values.map((value) => ({ value }));
var context = () => ({
	consumerId: "turbowarp-asset-cache",
	nowMs: 0,
	settings: null
});
var string = (value) => {
	if (typeof value !== "string") throw new TypeError("Expected a string literal.");
	return value;
};
var issue = () => [{ message: "Invalid asset style value." }];
/** New edits preserve the candidate token; existing aliases are display projections only. */
function styleBinding(property) {
	const values = property === "animation" ? [
		"",
		"none",
		"type",
		"rainbow",
		"zoom",
		"shake"
	] : property === "align" ? [
		"",
		"left",
		"center",
		"right"
	] : void 0;
	return {
		argument: "VALUE",
		schemaBundle: fixedInputBundle(property, fixedSchemas[property]),
		control: {
			kind: values ? "enum" : property === "color" ? "color" : property === "width" ? "number" : "text",
			reset: "",
			...values ? { choices: choices(values) } : {}
		},
		read(value) {
			return normalizeTextStyleValue(property, string(value));
		},
		encode(value) {
			const raw = string(value);
			if (property !== "width" || raw === "") return raw;
			normalizeTextStyleValue(property, raw);
			return raw;
		},
		validateCandidate(value) {
			try {
				normalizeTextStyleValue(property, string(value));
				return [];
			} catch {
				return issue();
			}
		}
	};
}
var fixedInputEditors = [{
	apiVersion: 1,
	extensionId,
	editorId: "text-style-fixed",
	opcodes: [`${extensionId}_setTextStyle`],
	contractId: "CP-asset-cache",
	contractRevision: "1",
	validationContext: context,
	bindings: [{
		argument: "PROPERTY",
		schemaBundle: fixedInputBundle("setTextStyle-PROPERTY", fixedSchemas.setTextStyle.properties.PROPERTY),
		control: {
			kind: "enum",
			choices: choices(TEXT_STYLE_PROPERTIES)
		},
		read(value) {
			const raw = string(value);
			try {
				return normalizeTextStyleProperty(raw);
			} catch {
				return raw;
			}
		},
		encode: (value) => string(value),
		validateCandidate(value) {
			try {
				normalizeTextStyleProperty(value);
				return [];
			} catch {
				return issue();
			}
		}
	}, {
		argument: "VALUE",
		schemaBundle: fixedInputBundle("setTextStyle-VALUE", fixedSchemas.setTextStyle.properties.VALUE),
		read: (value) => string(value),
		encode: (value) => string(value),
		validateCandidate: () => []
	}],
	dependencies: [{
		selector: "PROPERTY",
		dependents: ["VALUE"]
	}],
	branchPolicies: [{
		selector: "PROPERTY",
		normalize: {
			trim: true,
			lowercase: true
		},
		cases: TEXT_STYLE_PROPERTIES.map((property) => ({
			values: [property],
			activeDependents: ["VALUE"],
			bindings: [styleBinding(property)]
		}))
	}]
}, {
	apiVersion: 1,
	extensionId,
	editorId: "loading-costume-index-fixed",
	opcodes: [`${extensionId}_loadingCostumeAt`],
	contractId: "turbowarp-asset-cache/loadingCostumeAt.INDEX",
	contractRevision: "1",
	validationContext: context,
	bindings: [{
		argument: "INDEX",
		schemaBundle: fixedInputBundle("loadingCostumeAt-INDEX", fixedSchemas.loadingCostumeAt.properties.INDEX),
		control: { kind: "number" },
		read(value) {
			if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && value.trim() === "") throw new TypeError("Non-numeric index.");
			const number = Number(value);
			if (!Number.isFinite(number)) throw new TypeError("Nonfinite index.");
			return number;
		},
		encode(value) {
			const parsed = parseFixedNumberInput(value);
			if (parsed.kind !== "valid") throw new TypeError("Invalid index.");
			return parsed.token;
		},
		validateCandidate(value) {
			return Number.isFinite(Number(value)) ? [] : [{ message: "Invalid index." }];
		}
	}]
}];
/**
* Per-instance, idempotent registration. Legacy hosts never acquire the fixed capability.
*
* Every project load disposes the runtime, which releases the registrations, but the extension
* stays loaded for the next project: the same opcodes are registered again once that project has
* loaded. Only `dispose()` is final.
*/
function fixedInputRegistration(scratch) {
	const host = scratch;
	let active;
	let lastOpcodes;
	const removers = [];
	let disposed = false;
	let released = false;
	let listening = false;
	const release = () => {
		for (const remove of removers.splice(0).reverse()) remove();
		active = void 0;
	};
	const runtimeDisposed = () => {
		release();
		released = true;
	};
	const projectLoaded = () => {
		if (!released || lastOpcodes === void 0) return;
		released = false;
		try {
			registration.ensure(lastOpcodes);
		} catch {}
	};
	const shutdown = () => {
		disposed = true;
		released = false;
		if (listening) {
			host.vm?.runtime?.off?.("RUNTIME_DISPOSED", runtimeDisposed);
			host.vm?.runtime?.off?.("PROJECT_LOADED", projectLoaded);
			listening = false;
		}
		release();
	};
	const registration = {
		ensure(opcodes) {
			const api = host.gui?.blockEditors;
			if (disposed || api === active) return;
			release();
			released = false;
			lastOpcodes = [...opcodes];
			if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return;
			try {
				for (const definition of fixedInputEditors) if (definition.opcodes.every((opcode) => opcodes.includes(opcode))) {
					const remove = api.registerFixedInputEditor.call(api, definition);
					if (typeof remove !== "function") throw new TypeError("Invalid fixed registration cleanup.");
					removers.push(remove);
				}
				active = api;
				if (!listening) {
					host.vm?.runtime?.on?.("RUNTIME_DISPOSED", runtimeDisposed);
					host.vm?.runtime?.on?.("PROJECT_LOADED", projectLoaded);
					listening = true;
				}
			} catch (error) {
				release();
				throw error;
			}
		},
		dispose: shutdown
	};
	return registration;
}
//#endregion
//#region node_modules/.pnpm/@kubohiroya+turbowarp-named-data@0.9.0/node_modules/@kubohiroya/turbowarp-named-data/dist/composition.js
var NAMED_DATA_REGISTRY_SYMBOL_KEY = "@kubohiroya/turbowarp-named-data/registry";
var NAMED_DATA_REGISTRY_SYMBOL = Symbol.for(NAMED_DATA_REGISTRY_SYMBOL_KEY);
var NAMED_DATA_NAMESPACE_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
function isNamedDataNamespace(value) {
	return typeof value === "string" && NAMED_DATA_NAMESPACE_PATTERN.test(value);
}
var NAMED_DATA_KINDS = [
	"structured",
	"document",
	"binary",
	"asset"
];
var NAMED_DATA_SCOPES = ["target", "project"];
var NAMED_DATA_REPRESENTATIONS = [
	"json",
	"yaml",
	"html",
	"markdown",
	"raw"
];
var NAMED_DATA_SCHEMA_ID_PATTERN = /^[a-z][a-z0-9.-]{0,127}$/u;
var NAMED_DATA_SCHEMA_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
var NAMED_DATA_ERROR_CODES = [
	"NAMED_DATA_INVALID_REF",
	"NAMED_DATA_INVALID_REGISTRY",
	"NAMED_DATA_PROVIDER_CONFLICT",
	"NAMED_DATA_PROVIDER_NOT_FOUND",
	"NAMED_DATA_NOT_FOUND",
	"NAMED_DATA_KIND_MISMATCH",
	"NAMED_DATA_SCOPE_MISMATCH",
	"NAMED_DATA_SCHEMA_NOT_FOUND",
	"NAMED_DATA_SCHEMA_VERSION_MISMATCH",
	"NAMED_DATA_SCHEMA_UNRESOLVED",
	"NAMED_DATA_REPRESENTATION_UNSUPPORTED",
	"NAMED_DATA_INVALID_METADATA",
	"NAMED_DATA_BODY_TOO_LARGE",
	"NAMED_DATA_ABORTED",
	"NAMED_DATA_PROVIDER_RELEASED"
];
/** Native byte forms retained by each provider kind; this does not enable conversion. */
var NAMED_DATA_NATIVE_REPRESENTATIONS = Object.freeze({
	structured: Object.freeze(["json", "yaml"]),
	document: Object.freeze([
		"html",
		"markdown",
		"yaml",
		"json"
	]),
	binary: Object.freeze(["raw"]),
	asset: Object.freeze(["raw"])
});
var NamedDataError = class extends Error {
	constructor(code, message, options) {
		super(`${code}: ${message}`, options);
		this.code = code;
		this.name = "NamedDataError";
	}
};
var LIFECYCLE_SYMBOL = Symbol.for("@kubohiroya/turbowarp-named-data/lifecycle");
var errorCodes = new Set(NAMED_DATA_ERROR_CODES);
var NamedDataRegistry = class {
	constructor() {
		this.providers = /* @__PURE__ */ new Map();
		this.handles = /* @__PURE__ */ new Set();
	}
	registerProvider(provider, options = {}) {
		requireNamespace(provider.namespace);
		if (!NAMED_DATA_KINDS.includes(provider.kind)) throw new NamedDataError("NAMED_DATA_INVALID_REF", `Unknown provider kind: ${provider.kind}`);
		const key = providerKey(provider.namespace, provider.kind);
		if (this.providers.has(key)) throw new NamedDataError("NAMED_DATA_PROVIDER_CONFLICT", `Provider is already registered: ${provider.namespace}/${provider.kind}`);
		const entry = {
			provider,
			lifetime: options.lifetime ?? "session"
		};
		this.providers.set(key, entry);
		let active = true;
		return {
			namespace: provider.namespace,
			kind: provider.kind,
			unregister: async () => {
				if (!active) return;
				active = false;
				if (this.providers.get(key) === entry) {
					this.providers.delete(key);
					await this.releaseHandlesForProvider(provider.namespace, provider.kind);
					await provider.release("shutdown");
				}
			}
		};
	}
	canResolve(reference, representation) {
		try {
			validateReferenceShape(reference, representation);
			return (this.providers.get(providerKey(reference.namespace, reference.kind))?.provider)?.canResolve(reference, representation) ?? false;
		} catch {
			return false;
		}
	}
	async stat(reference, representation, context = {}) {
		const provider = this.resolveProvider(reference, representation, context);
		throwIfAborted(context.signal);
		try {
			const metadata = snapshotMetadata(await provider.stat(reference, representation, context));
			throwIfAborted(context.signal);
			validateMetadata(metadata, reference, representation);
			return metadata;
		} catch (error) {
			throw normalizeProviderError(error);
		}
	}
	async openBody(reference, representation, context = {}) {
		const provider = this.resolveProvider(reference, representation, context);
		throwIfAborted(context.signal);
		let opened;
		let metadata;
		try {
			opened = await provider.openBody(reference, representation, context);
			metadata = snapshotMetadata(opened);
			validateMetadata(metadata, reference, representation);
			if (!(opened.body instanceof Uint8Array) && !(opened.body instanceof ReadableStream)) throw new NamedDataError("NAMED_DATA_INVALID_METADATA", "Provider returned an invalid body.");
		} catch (error) {
			throw normalizeProviderError(error);
		}
		if (context.signal?.aborted) {
			await opened.release("abort");
			throw abortedError();
		}
		let released = false;
		let abortListener;
		const tracked = {
			namespace: reference.namespace,
			kind: reference.kind,
			release: async (reason = "complete") => {
				if (released) return;
				released = true;
				if (abortListener && context.signal) context.signal.removeEventListener("abort", abortListener);
				this.handles.delete(tracked);
				await opened.release(reason);
			}
		};
		this.handles.add(tracked);
		if (context.signal) {
			abortListener = () => {
				Promise.resolve(tracked.release("abort")).catch(() => void 0);
			};
			context.signal.addEventListener("abort", abortListener, { once: true });
			if (context.signal.aborted) {
				await tracked.release("abort");
				throw abortedError();
			}
		}
		return Object.freeze({
			...metadata,
			body: opened.body,
			release: tracked.release
		});
	}
	async clearSession() {
		const handles = [...this.handles];
		this.handles.clear();
		await Promise.allSettled(handles.map((handle) => handle.release("shutdown")));
		const sessionEntries = [...this.providers.entries()].filter(([, entry]) => entry.lifetime === "session");
		for (const [namespace] of sessionEntries) this.providers.delete(namespace);
		await Promise.allSettled(sessionEntries.map(([, entry]) => entry.provider.release("shutdown")));
		await Promise.allSettled([...this.providers.values()].map((entry) => entry.provider.clearSession?.()));
	}
	resolveProvider(reference, representation, context) {
		validateReference(reference, representation, context);
		const provider = this.providers.get(providerKey(reference.namespace, reference.kind))?.provider;
		if (!provider) {
			const hasNamespace = [...this.providers.values()].some((entry) => entry.provider.namespace === reference.namespace);
			throw new NamedDataError(hasNamespace ? "NAMED_DATA_KIND_MISMATCH" : "NAMED_DATA_PROVIDER_NOT_FOUND", hasNamespace ? `No provider for kind ${reference.kind} is registered in namespace ${reference.namespace}.` : `No provider can resolve namespace: ${reference.namespace}`);
		}
		if (!provider.canResolve(reference, representation)) throw new NamedDataError("NAMED_DATA_REPRESENTATION_UNSUPPORTED", `Provider ${reference.namespace} does not support representation: ${representation}`);
		return provider;
	}
	async releaseHandlesForProvider(namespace, kind) {
		const handles = [...this.handles].filter((handle) => handle.namespace === namespace && handle.kind === kind);
		await Promise.allSettled(handles.map((handle) => handle.release("shutdown")));
	}
};
function installNamedDataRegistry(runtime) {
	const host = runtime;
	const existing = host[NAMED_DATA_REGISTRY_SYMBOL];
	if (existing !== void 0) return requireCompatibleRegistry(existing);
	const registry = new NamedDataRegistry();
	Object.defineProperty(host, NAMED_DATA_REGISTRY_SYMBOL, {
		configurable: true,
		enumerable: false,
		writable: false,
		value: registry
	});
	return registry;
}
function bindNamedDataRegistryLifecycle(runtime, registry) {
	const host = runtime;
	const existing = host[LIFECYCLE_SYMBOL];
	if (existing !== void 0) {
		if (!isLifecycleBinding(existing) || existing.registry !== registry) throw new NamedDataError("NAMED_DATA_INVALID_REGISTRY", "Runtime already has a lifecycle binding for a different registry.");
		existing.references += 1;
		return lifecycleUnbind(runtime, host, existing);
	}
	const listener = () => {
		registry.clearSession();
	};
	runtime.on("PROJECT_STOP_ALL", listener);
	const binding = {
		registry,
		listener,
		references: 1
	};
	Object.defineProperty(host, LIFECYCLE_SYMBOL, {
		configurable: true,
		enumerable: false,
		writable: false,
		value: binding
	});
	return lifecycleUnbind(runtime, host, binding);
}
function isLifecycleBinding(value) {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value;
	return isCompatibleRegistry(candidate.registry) && typeof candidate.listener === "function" && Number.isSafeInteger(candidate.references) && (candidate.references ?? -1) >= 0;
}
function lifecycleUnbind(runtime, host, binding) {
	let active = true;
	return () => {
		if (!active || host[LIFECYCLE_SYMBOL] !== binding) return;
		active = false;
		binding.references -= 1;
		if (binding.references > 0) return;
		if (runtime.off) {
			runtime.off("PROJECT_STOP_ALL", binding.listener);
			delete host[LIFECYCLE_SYMBOL];
		}
	};
}
function requireCompatibleRegistry(value) {
	if (isCompatibleRegistry(value)) return value;
	throw new NamedDataError("NAMED_DATA_INVALID_REGISTRY", `Runtime slot ${NAMED_DATA_REGISTRY_SYMBOL_KEY} contains an invalid registry.`);
}
function isCompatibleRegistry(value) {
	if (typeof value !== "object" || value === null) return false;
	try {
		const candidate = value;
		return typeof candidate.registerProvider === "function" && typeof candidate.canResolve === "function" && typeof candidate.stat === "function" && typeof candidate.openBody === "function" && typeof candidate.clearSession === "function";
	} catch {
		return false;
	}
}
function validateReference(reference, representation, context) {
	validateReferenceShape(reference, representation);
	if (reference.scope === "target" && context.target === void 0) throw new NamedDataError("NAMED_DATA_SCOPE_MISMATCH", "Target scope requires target context.");
	if (reference.scope === "project" && context.project === void 0) throw new NamedDataError("NAMED_DATA_SCOPE_MISMATCH", "Project scope requires project context.");
	throwIfAborted(context.signal);
}
function validateReferenceShape(reference, representation) {
	if (!reference || typeof reference !== "object") throw invalidReference$1();
	requireNamespace(reference.namespace);
	if (typeof reference.name !== "string" || reference.name.length === 0 || reference.name.length > 256 || containsControlCharacter(reference.name) || !NAMED_DATA_KINDS.includes(reference.kind) || !NAMED_DATA_SCOPES.includes(reference.scope) || !NAMED_DATA_REPRESENTATIONS.includes(representation)) throw invalidReference$1();
	if (reference.schemaRef !== void 0) validateSchemaRef(reference.kind, reference.schemaRef);
}
function validateMetadata(metadata, reference, representation) {
	if (metadata.representation !== representation || !isNativeRepresentation(metadata.reference.kind, metadata.nativeRepresentation) || metadata.reference.namespace !== reference.namespace || metadata.reference.name !== reference.name || metadata.reference.kind !== reference.kind || metadata.reference.scope !== reference.scope || typeof metadata.mediaType !== "string" || metadata.mediaType.length === 0 || typeof metadata.revision !== "string" || metadata.revision.length === 0 || typeof metadata.replayable !== "boolean" || metadata.byteLength !== void 0 && (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength < 0) || metadata.digest !== void 0 && !/^sha256-[A-Za-z0-9_-]+$/u.test(metadata.digest)) throw invalidMetadata();
	const expectedSchema = reference.schemaRef;
	const actualSchema = metadata.schemaRef;
	if (actualSchema !== void 0) validateSchemaRef(metadata.reference.kind, actualSchema, "NAMED_DATA_INVALID_METADATA");
	if (metadata.reference.schemaRef !== void 0) validateSchemaRef(metadata.reference.kind, metadata.reference.schemaRef, "NAMED_DATA_INVALID_METADATA");
	if (!sameSchemaRef(expectedSchema, actualSchema) || !sameSchemaRef(expectedSchema, metadata.reference.schemaRef)) throw new NamedDataError("NAMED_DATA_SCHEMA_VERSION_MISMATCH", "Provider schemaRef does not match the requested reference.");
}
/**
* Copies provider metadata once so validation and consumers observe the same frozen identity.
* Fields are read exactly once; payload bodies are never part of the snapshot.
*/
function snapshotMetadata(metadata) {
	if (typeof metadata !== "object" || metadata === null) throw invalidMetadata();
	const source = metadata.reference;
	if (typeof source !== "object" || source === null) throw invalidMetadata();
	const { namespace, name, kind, scope, schemaRef: referenceSchemaRef } = source;
	const { nativeRepresentation, representation, mediaType, byteLength, digest, revision, replayable, schemaRef } = metadata;
	const reference = snapshotSchemaRef(referenceSchemaRef);
	const resolved = snapshotSchemaRef(schemaRef);
	return Object.freeze({
		reference: Object.freeze({
			namespace,
			name,
			kind,
			scope,
			...reference === void 0 ? {} : { schemaRef: reference }
		}),
		nativeRepresentation,
		representation,
		mediaType,
		...byteLength === void 0 ? {} : { byteLength },
		...digest === void 0 ? {} : { digest },
		revision,
		replayable,
		...resolved === void 0 ? {} : { schemaRef: resolved }
	});
}
function snapshotSchemaRef(schemaRef) {
	if (schemaRef === void 0) return void 0;
	if (typeof schemaRef !== "object" || schemaRef === null || Object.keys(schemaRef).some((key) => key !== "id" && key !== "version")) throw invalidSchemaRef("NAMED_DATA_INVALID_METADATA");
	const { id, version } = schemaRef;
	if (typeof id !== "string" || typeof version !== "string") throw invalidSchemaRef("NAMED_DATA_INVALID_METADATA");
	return Object.freeze({
		id,
		version
	});
}
function validateSchemaRef(kind, schemaRef, errorCode = "NAMED_DATA_INVALID_REF") {
	if (kind !== "structured" || typeof schemaRef !== "object" || schemaRef === null || !NAMED_DATA_SCHEMA_ID_PATTERN.test(String(schemaRef.id ?? "")) || !NAMED_DATA_SCHEMA_VERSION_PATTERN.test(String(schemaRef.version ?? "")) || Object.keys(schemaRef).some((key) => key !== "id" && key !== "version")) throw invalidSchemaRef(errorCode);
}
function invalidSchemaRef(errorCode) {
	return new NamedDataError(errorCode, "Invalid schemaRef; schema references require a structured value, stable id, and full SemVer version.");
}
function invalidMetadata() {
	return new NamedDataError("NAMED_DATA_INVALID_METADATA", "Provider returned invalid metadata.");
}
function sameSchemaRef(left, right) {
	return left === void 0 ? right === void 0 : right !== void 0 && left.id === right.id && left.version === right.version;
}
function isNativeRepresentation(kind, representation) {
	return NAMED_DATA_NATIVE_REPRESENTATIONS[kind].includes(representation);
}
function requireNamespace(namespace) {
	if (!isNamedDataNamespace(namespace)) throw invalidReference$1("Invalid namespace.");
}
function providerKey(namespace, kind) {
	return `${namespace}\0${kind}`;
}
function containsControlCharacter(value) {
	return [...value].some((character) => {
		const code = character.codePointAt(0) ?? 0;
		return code <= 31 || code === 127;
	});
}
function invalidReference$1(message = "Invalid named-data reference.") {
	return new NamedDataError("NAMED_DATA_INVALID_REF", message);
}
function throwIfAborted(signal) {
	if (signal?.aborted) throw abortedError();
}
function abortedError() {
	return new NamedDataError("NAMED_DATA_ABORTED", "Named-data operation was aborted.");
}
function normalizeProviderError(error) {
	if (error instanceof NamedDataError) return error;
	if (error instanceof Error && "code" in error && typeof error.code === "string" && errorCodes.has(error.code)) return new NamedDataError(error.code, error.message, { cause: error });
	return new NamedDataError("NAMED_DATA_PROVIDER_RELEASED", "Provider operation failed.", { cause: error });
}
function configuredFlag$1(name) {
	const value = globalThis.__TW_NAMED_DATA_FEATURE_FLAGS__?.[name];
	return value === true || value === "true";
}
Object.freeze({
	NAMED_DATA_REGISTRY_MVP: configuredFlag$1("NAMED_DATA_REGISTRY_MVP"),
	NAMED_DATA_SCHEMA_REF: configuredFlag$1("NAMED_DATA_SCHEMA_REF")
});
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
//#region src/asset-cache-error.ts
var AssetManagerError = class extends Error {
	constructor(code, message, context) {
		const hintText = context.hint ? ` ${context.hint}` : "";
		super(`[Asset Cache][${code}] ${message}${hintText}`, { cause: context.cause });
		_defineProperty(this, "code", void 0);
		_defineProperty(this, "operation", void 0);
		_defineProperty(this, "assetName", void 0);
		_defineProperty(this, "resourceId", void 0);
		_defineProperty(this, "actorName", void 0);
		_defineProperty(this, "expectedKind", void 0);
		_defineProperty(this, "actualKind", void 0);
		_defineProperty(this, "hint", void 0);
		_defineProperty(this, "candidates", void 0);
		this.name = "AssetManagerError";
		this.code = code;
		this.operation = context.operation;
		this.assetName = context.assetName;
		this.resourceId = context.resourceId;
		this.actorName = context.actorName;
		this.expectedKind = context.expectedKind;
		this.actualKind = context.actualKind;
		this.hint = context.hint;
		this.candidates = context.candidates ?? [];
	}
};
function editDistance(left, right) {
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) current[rightIndex] = Math.min((current[rightIndex - 1] ?? 0) + 1, (previous[rightIndex] ?? 0) + 1, (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
		previous.splice(0, previous.length, ...current);
	}
	return previous[right.length] ?? 0;
}
function suggestNames(value, choices, limit = 3) {
	const input = String(value ?? "").trim();
	if (!input || limit <= 0) return [];
	const normalizedInput = input.toLocaleLowerCase();
	return [...new Set([...choices].map((choice) => choice.trim()).filter(Boolean))].map((choice, index) => ({
		choice,
		index,
		exactCaseInsensitive: choice.toLocaleLowerCase() === normalizedInput,
		distance: editDistance(normalizedInput, choice.toLocaleLowerCase())
	})).sort((left, right) => Number(right.exactCaseInsensitive) - Number(left.exactCaseInsensitive) || left.distance - right.distance || left.index - right.index).slice(0, limit).map(({ choice }) => choice);
}
function suggestionHint(candidates) {
	if (candidates.length === 0) return void 0;
	if (candidates.length === 1) return `Did you mean "${candidates[0]}"?`;
	return `Did you mean one of: ${candidates.map((candidate) => `"${candidate}"`).join(", ")}?`;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/feature-flags.ts
function configuredFlag(name) {
	const configured = globalThis.__TW_ASSET_MANAGER_FEATURE_FLAGS__?.[name];
	return configured === true || configured === "true";
}
/**
* Startup-fixed rollout flags. Optional features remain disabled unless a host
* explicitly configures them before loading the extension bundle.
*/
var FEATURE_FLAGS = Object.freeze({
	ENABLE_LIVE_ASSET_REPLACEMENT: configuredFlag("ENABLE_LIVE_ASSET_REPLACEMENT"),
	ENABLE_STRICT_ASSET_KIND_REPLACEMENT: configuredFlag("ENABLE_STRICT_ASSET_KIND_REPLACEMENT"),
	NAMED_ASSET_BODY_PROVIDER: configuredFlag("NAMED_ASSET_BODY_PROVIDER")
});
//#endregion
//#region src/dom-image-resource.ts
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
var XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
var FORBIDDEN_SVG_ELEMENTS = /* @__PURE__ */ new Set([
	"animate",
	"animatemotion",
	"animatetransform",
	"discard",
	"embed",
	"foreignobject",
	"iframe",
	"object",
	"script",
	"set"
]);
var SAFE_DATA_IMAGE_REFERENCE = /^data:image\/(?:avif|bmp|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;
async function createDOMImageResourceBacking(input, onIdle) {
	const normalizedInput = {
		...input,
		mimeType: normalizedImageMimeType(input.mimeType)
	};
	const verified = normalizedInput.mimeType === "image/svg+xml" ? verifySVGImage(normalizedInput) : await verifyRasterImage(normalizedInput);
	const objectURL = URL.createObjectURL(new Blob([copyArrayBuffer(verified.bytes)], { type: verified.mimeType }));
	let leaseCount = 0;
	let revoked = false;
	let idleListener = onIdle;
	const backing = Object.freeze({ acquire(onRelease) {
		if (revoked) throw new Error("DOM image resource backing has been released.");
		leaseCount += 1;
		let released = false;
		let releaseListener = onRelease;
		let backingReference = backing;
		const resource = Object.freeze({
			url: objectURL,
			mimeType: verified.mimeType,
			width: verified.width,
			height: verified.height,
			get released() {
				return released;
			},
			release() {
				if (released) return;
				released = true;
				leaseCount -= 1;
				const releasedBacking = backingReference;
				backingReference = void 0;
				try {
					if (leaseCount === 0) {
						revoked = true;
						URL.revokeObjectURL(objectURL);
					}
				} finally {
					const listener = releaseListener;
					releaseListener = void 0;
					try {
						listener?.(resource);
					} finally {
						if (revoked) {
							const listener = idleListener;
							idleListener = void 0;
							if (releasedBacking) listener?.(releasedBacking);
						}
					}
				}
			}
		});
		return resource;
	} });
	return backing;
}
function verifySVGImage(input) {
	let source;
	try {
		source = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
	} catch (error) {
		throw invalidResource(input.name, "SVG bytes are not valid UTF-8.", error);
	}
	if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet\b/i.test(source)) throw unsafeSVG(input.name, "DOCTYPE, entity, and stylesheet processing instructions are forbidden.");
	if (typeof DOMParser !== "function" || typeof XMLSerializer !== "function") throw new AssetManagerError("DEPENDENCY_MISSING", "DOMParser and XMLSerializer are required to validate SVG image resources.", {
		operation: "resolveDOMImageResource",
		assetName: input.name,
		hint: "Resolve SVG resources in a browser DOM environment."
	});
	let document;
	try {
		document = new DOMParser().parseFromString(source, "image/svg+xml");
	} catch (error) {
		throw invalidResource(input.name, "SVG markup is not well-formed XML.", error);
	}
	const root = document.documentElement;
	if (root.localName.toLowerCase() === "parsererror" || document.getElementsByTagName("parsererror").length > 0) throw invalidResource(input.name, "SVG markup is not well-formed XML.");
	if (root.namespaceURI !== SVG_NAMESPACE || root.localName.toLowerCase() !== "svg") throw invalidResource(input.name, "SVG resource must have an SVG root element.");
	validateSVGElement(input.name, root);
	for (const element of root.getElementsByTagName("*")) validateSVGElement(input.name, element);
	const { width, height } = svgIntrinsicSize(input.name, root);
	const serialized = new XMLSerializer().serializeToString(document);
	return {
		bytes: new TextEncoder().encode(serialized),
		mimeType: "image/svg+xml",
		width,
		height
	};
}
function validateSVGElement(name, element) {
	const localName = element.localName.toLowerCase();
	if (element.namespaceURI !== SVG_NAMESPACE) throw unsafeSVG(name, `Element namespace is not allowed: ${element.namespaceURI ?? "(none)"}.`);
	if (FORBIDDEN_SVG_ELEMENTS.has(localName)) throw unsafeSVG(name, `SVG <${localName}> elements are forbidden.`);
	if (localName === "style") validateCSSReferences(name, element.textContent ?? "");
	for (const attribute of [...element.attributes]) {
		const attributeName = attribute.localName.toLowerCase();
		if (attributeName.startsWith("on")) throw unsafeSVG(name, `SVG event handler attribute ${attribute.name} is forbidden.`);
		if (attribute.namespaceURI && ![
			XLINK_NAMESPACE,
			XML_NAMESPACE,
			XMLNS_NAMESPACE
		].includes(attribute.namespaceURI)) throw unsafeSVG(name, `Attribute namespace is not allowed: ${attribute.namespaceURI}.`);
		if (attributeName === "base" && attribute.namespaceURI === XML_NAMESPACE) throw unsafeSVG(name, "SVG xml:base is forbidden.");
		if (attributeName === "href" || attributeName === "src") validateImageReference(name, attribute.value);
		if (attributeName === "style" || /url\s*\(/i.test(attribute.value)) validateCSSReferences(name, attribute.value);
	}
}
function validateImageReference(name, rawReference) {
	const reference = rawReference.trim();
	if (!reference || reference.startsWith("#") || SAFE_DATA_IMAGE_REFERENCE.test(reference)) return;
	throw unsafeSVG(name, `External SVG reference is forbidden: ${safeLabel(reference)}.`);
}
function validateCSSReferences(name, css) {
	if (/[\\@]|\/\*|expression\s*\(|-moz-binding\s*:|(?:-webkit-)?image(?:-set)?\s*\(|cross-fade\s*\(|(?:https?|file|ftp|javascript):|\/\//i.test(css)) throw unsafeSVG(name, "Imported, obfuscated, external, or executable SVG CSS is forbidden.");
	for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) validateImageReference(name, match[2] ?? "");
}
function svgIntrinsicSize(name, root) {
	const rawWidth = root.getAttribute("width");
	const rawHeight = root.getAttribute("height");
	const rawViewBox = root.getAttribute("viewBox");
	const width = absoluteSVGLength(rawWidth);
	const height = absoluteSVGLength(rawHeight);
	const viewBox = svgViewBox(rawViewBox);
	if (rawWidth !== null && width === null) throw invalidResource(name, "SVG width must be a positive absolute length.");
	if (rawHeight !== null && height === null) throw invalidResource(name, "SVG height must be a positive absolute length.");
	if (rawViewBox !== null && viewBox === null) throw invalidResource(name, "SVG viewBox must contain four finite values and positive dimensions.");
	if (width !== null && height !== null) return {
		width,
		height
	};
	if (width !== null && viewBox) return {
		width,
		height: width * viewBox.height / viewBox.width
	};
	if (height !== null && viewBox) return {
		width: height * viewBox.width / viewBox.height,
		height
	};
	if (viewBox) return {
		width: viewBox.width,
		height: viewBox.height
	};
	throw invalidResource(name, "SVG resource must declare positive absolute width/height or a positive viewBox.");
}
function absoluteSVGLength(raw) {
	if (raw === null || !raw.trim()) return null;
	const match = /^([+]?(?:\d+\.?\d*|\.\d+))(px|in|cm|mm|q|pt|pc)?$/i.exec(raw.trim());
	if (!match) return null;
	const pixels = Number(match[1]) * ((/* @__PURE__ */ new Map([
		["", 1],
		["px", 1],
		["in", 96],
		["cm", 96 / 2.54],
		["mm", 96 / 25.4],
		["q", 96 / 101.6],
		["pt", 96 / 72],
		["pc", 16]
	])).get((match[2] ?? "").toLowerCase()) ?? NaN);
	return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}
function svgViewBox(raw) {
	if (raw === null) return null;
	const values = raw.trim().split(/[\s,]+/).map(Number);
	if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || !(values[2] > 0) || !(values[3] > 0)) return null;
	return {
		width: values[2],
		height: values[3]
	};
}
async function verifyRasterImage(input) {
	const detectedMimeType = sniffRasterMimeType(input.bytes);
	if (!detectedMimeType || detectedMimeType !== input.mimeType) throw new AssetManagerError("ASSET_TYPE_MISMATCH", `Image asset "${input.name}" bytes do not match MIME type ${input.mimeType}.`, {
		operation: "resolveDOMImageResource",
		assetName: input.name,
		expectedKind: input.mimeType,
		actualKind: detectedMimeType ?? "unrecognized image bytes",
		hint: "Use PNG, JPEG, GIF, WebP, BMP, or AVIF bytes with the matching MIME type."
	});
	if (typeof createImageBitmap !== "function") throw new AssetManagerError("DEPENDENCY_MISSING", "createImageBitmap is required to validate raster image dimensions.", {
		operation: "resolveDOMImageResource",
		assetName: input.name,
		hint: "Resolve raster resources in a browser that supports createImageBitmap."
	});
	let bitmap;
	try {
		bitmap = await createImageBitmap(new Blob([copyArrayBuffer(input.bytes)], { type: input.mimeType }));
	} catch (error) {
		throw invalidResource(input.name, "Raster image bytes could not be decoded.", error);
	}
	try {
		if (!Number.isFinite(bitmap.width) || bitmap.width <= 0 || !Number.isFinite(bitmap.height) || bitmap.height <= 0) throw invalidResource(input.name, "Raster image has invalid intrinsic dimensions.");
		return {
			bytes: input.bytes,
			mimeType: input.mimeType,
			width: bitmap.width,
			height: bitmap.height
		};
	} finally {
		bitmap.close();
	}
}
function sniffRasterMimeType(bytes) {
	if (startsWith(bytes, [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	])) return "image/png";
	if (startsWith(bytes, [
		255,
		216,
		255
	])) return "image/jpeg";
	if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
	if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
	if (ascii(bytes, 0, 2) === "BM") return "image/bmp";
	if (ascii(bytes, 4, 4) === "ftyp") {
		const brand = ascii(bytes, 8, 4);
		if (brand === "avif" || brand === "avis") return "image/avif";
	}
	return null;
}
function normalizedImageMimeType(value) {
	const mimeType = value.split(";")[0]?.trim().toLowerCase() ?? "";
	if (mimeType === "image/jpg" || mimeType === "image/pjpeg") return "image/jpeg";
	if (mimeType === "image/x-png") return "image/png";
	if (mimeType === "image/x-ms-bmp") return "image/bmp";
	return mimeType;
}
function startsWith(bytes, prefix) {
	return prefix.every((value, index) => bytes[index] === value);
}
function ascii(bytes, offset, length) {
	if (bytes.byteLength < offset + length) return "";
	return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function copyArrayBuffer(bytes) {
	return Uint8Array.from(bytes).buffer;
}
function invalidResource(name, message, cause) {
	return new AssetManagerError("RESOURCE_ID_INVALID", message, {
		operation: "resolveDOMImageResource",
		assetName: name,
		hint: "Provide a well-formed image with verifiable intrinsic dimensions.",
		cause
	});
}
function unsafeSVG(name, message) {
	return new AssetManagerError("RESOURCE_ID_INVALID", message, {
		operation: "resolveDOMImageResource",
		assetName: name,
		hint: "Remove scripts, event handlers, embedded HTML, and external references from the SVG."
	});
}
function safeLabel(value) {
	const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
	return JSON.stringify(normalized || "(empty)");
}
//#endregion
//#region src/audio-voice.ts
function normalizeAudioVoiceGain(value, label = "Audio voice gain") {
	const gain = value === void 0 ? 1 : value;
	if (typeof gain !== "number" || !Number.isFinite(gain) || gain < 0 || gain > 1) throw new TypeError(`${label} must be a finite number from 0 to 1.`);
	return gain;
}
//#endregion
//#region src/named-body-provider.ts
var NAMED_ASSET_BODY_NAMESPACE = "asset";
function requireNamedAssetBodyReference(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidReference();
	const reference = value;
	if (reference.namespace !== "asset" || typeof reference.name !== "string" || reference.name.length === 0 || reference.kind !== "asset" || reference.scope !== "project") throw invalidReference();
	return Object.freeze({
		namespace: NAMED_ASSET_BODY_NAMESPACE,
		name: reference.name,
		kind: "asset",
		scope: "project"
	});
}
function invalidReference() {
	return new NamedDataError("NAMED_DATA_INVALID_REF", "Expected an asset/project reference with a non-empty string name.");
}
function namedBodyAbortError() {
	return new NamedDataError("NAMED_DATA_ABORTED", "Named asset body resolution was aborted.");
}
function throwIfNamedBodyAborted(signal) {
	if (signal?.aborted) throw namedBodyAbortError();
}
//#endregion
//#region src/extension.ts
var EXTENSION_ID = extensionConfig.id;
var EXTENSION_VERSION = "0.14.0";
var EXTENSION_DOCS_URI = extensionConfig.docsURI;
var BLOCK_ICON_URI = extensionConfig.blockIconURI;
var STAGE_RESOURCE_NAME = "@stage";
async function sha256Digest(bytes) {
	const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
	return `sha256-${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
var blockDefinitions = block_definitions_default.blocks;
blockDefinitions.unshift({
	opcode: "validateProjectAssetAddress",
	blockType: "REPORTER",
	text: "validate project asset address [RESOURCE_ID] for [NAME]",
	description: "Returns a JSON validation result without fetching, caching, registering, or rendering the asset.",
	arguments: {
		RESOURCE_ID: {
			type: "STRING",
			defaultValue: "costume:Sprite1:costume1"
		},
		NAME: {
			type: "STRING",
			defaultValue: "asset1"
		}
	},
	hideFromPalette: true
}, {
	opcode: "setLoadingBackdrop",
	blockType: "COMMAND",
	text: "set loading backdrop asset to [NAME]",
	description: "Configures the image asset shown behind the loading indicator.",
	arguments: { NAME: {
		type: "STRING",
		defaultValue: "loadingBackdrop"
	} },
	hideFromPalette: true
}, {
	opcode: "setLoadingCostumes",
	blockType: "COMMAND",
	text: "set loading costume assets to [NAMES]",
	description: "Configures the comma-separated image assets used by the loading indicator.",
	arguments: { NAMES: {
		type: "STRING",
		defaultValue: "loading1,loading2"
	} },
	hideFromPalette: true
}, {
	opcode: "prepareLoadingAssets",
	blockType: "COMMAND",
	text: "prioritize loading assets in list [LIST]",
	description: "Moves configured loading assets to the front of the named asset definition list.",
	arguments: { LIST: {
		type: "STRING",
		defaultValue: "assetList"
	} },
	hideFromPalette: true
}, {
	opcode: "loadingAssetCount",
	blockType: "REPORTER",
	text: "loading asset count",
	description: "Returns the number of configured loading assets present in the prepared asset list.",
	arguments: {},
	hideFromPalette: true
}, {
	opcode: "loadingBackdrop",
	blockType: "REPORTER",
	text: "loading backdrop asset",
	description: "Returns the configured loading backdrop asset name.",
	arguments: {},
	hideFromPalette: true
}, {
	opcode: "loadingCostumeAt",
	blockType: "REPORTER",
	text: "loading costume for asset number [INDEX]",
	description: "Returns the configured loading costume asset for a one-based regular asset number.",
	arguments: { INDEX: {
		type: "NUMBER",
		defaultValue: "1"
	} },
	hideFromPalette: true
});
function normalizeName(value) {
	return String(value ?? "").trim();
}
function literalProjectName(value, label) {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty literal string.`);
	return value;
}
function parseProjectAssetLocator(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project asset locator must be an object.");
	const input = value;
	const kind = input.kind;
	const allowed = kind === "costume" ? /* @__PURE__ */ new Set([
		"kind",
		"name",
		"target"
	]) : kind === "sound" ? /* @__PURE__ */ new Set([
		"kind",
		"name",
		"target"
	]) : /* @__PURE__ */ new Set(["kind", "name"]);
	if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("Project asset locator contains an unknown field.");
	const name = literalProjectName(input.name, "Project asset source name");
	if (kind === "backdrop") {
		if (Object.hasOwn(input, "target")) throw new Error("Backdrop locator must not provide target.");
		return Object.freeze({
			kind,
			name
		});
	}
	if (kind === "costume") return Object.freeze({
		kind,
		name,
		target: literalProjectName(input.target, "Costume target name")
	});
	if (kind === "sound") return Object.freeze({
		kind,
		name,
		...Object.hasOwn(input, "target") ? { target: literalProjectName(input.target, "Sound target name") } : {}
	});
	throw new Error("Project asset locator kind must be backdrop, costume, or sound.");
}
function guessMimeType(value) {
	const name = String(value ?? "").toLowerCase().split("?")[0]?.split("#")[0] ?? "";
	return [
		[[".svg"], "image/svg+xml"],
		[[".png"], "image/png"],
		[[".jpg", ".jpeg"], "image/jpeg"],
		[[".webp"], "image/webp"],
		[[".gif"], "image/gif"],
		[[".mp3"], "audio/mpeg"],
		[[".wav"], "audio/wav"],
		[[".ogg"], "audio/ogg"],
		[[".m4a"], "audio/mp4"],
		[[".aac"], "audio/aac"]
	].find(([extensions]) => extensions.some((extension) => name.endsWith(extension)))?.[1] ?? "application/octet-stream";
}
function normalizeMimeType(mimeType, urlOrName) {
	const raw = String(mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	return !raw || raw === "application/octet-stream" || raw === "binary/octet-stream" ? guessMimeType(urlOrName) : raw;
}
function parseResourceIdentifier(value, fallbackAssetName) {
	const resourceId = normalizeName(value);
	if (!resourceId) return { kind: "cache" };
	if (/^https?:\/\//i.test(resourceId)) return {
		kind: "external",
		url: resourceId
	};
	const separatorIndex = resourceId.indexOf(":");
	if (separatorIndex < 0) {
		const fallbackName = normalizeName(fallbackAssetName);
		const bareScheme = resourceId.toLowerCase();
		if (bareScheme === "costume" && fallbackName) return {
			kind: "costume",
			spriteName: fallbackName,
			costumeName: null
		};
		if (bareScheme === "backdrop" && fallbackName) return {
			kind: "backdrop",
			backdropName: fallbackName
		};
		if (bareScheme === "sound" && fallbackName) return {
			kind: "sound",
			spriteName: STAGE_RESOURCE_NAME,
			soundName: fallbackName
		};
		if (bareScheme === "text" && fallbackName) return {
			kind: "text",
			runtimeVariableName: textRuntimeVariableName(parseLocalResourceName(fallbackName, "Text variable"))
		};
		throw new Error(`Unsupported resource identifier: ${resourceId}`);
	}
	const scheme = resourceId.slice(0, separatorIndex).trim().toLowerCase();
	const payload = resourceId.slice(separatorIndex + 1).trim();
	switch (scheme) {
		case "costume": {
			const [spriteName, costumeName] = splitLocalResourcePair(payload, "costume", fallbackAssetName);
			return {
				kind: "costume",
				spriteName,
				costumeName
			};
		}
		case "backdrop": return {
			kind: "backdrop",
			backdropName: parseLocalResourceName(payload, "Backdrop")
		};
		case "sound": {
			const [spriteName, soundName] = splitLocalResourcePair(payload, "sound", fallbackAssetName);
			return {
				kind: "sound",
				spriteName,
				soundName
			};
		}
		case "text": return {
			kind: "text",
			runtimeVariableName: textRuntimeVariableName(parseLocalResourceName(payload, "Text variable"))
		};
		default: throw new Error(`Unsupported resource scheme: ${scheme}`);
	}
}
function splitLocalResourcePair(payload, scheme, fallbackAssetName) {
	if (!payload.includes(":") && fallbackAssetName !== void 0) {
		const spriteName = payload.trim();
		const assetName = normalizeName(fallbackAssetName);
		if (!spriteName) throw new Error(`${scheme} source name is empty.`);
		if (!assetName) throw new Error(`${scheme} asset name is empty.`);
		return [spriteName, assetName];
	}
	const parts = payload.split(":");
	if (parts.length !== 2) throw new Error(`${scheme} resource must specify a source and asset name separated by exactly one colon.`);
	const sourceName = parts[0]?.trim() ?? "";
	const assetName = parts[1]?.trim() ?? "";
	if (!sourceName) throw new Error(`${scheme} source name is empty.`);
	if (!assetName) throw new Error(`${scheme} asset name is empty.`);
	return [sourceName, assetName];
}
function parseLocalResourceName(payload, label) {
	const name = payload.trim();
	if (!name) throw new Error(`${label} name is empty.`);
	if (name.includes(":")) throw new Error(`${label} name must not contain a colon.`);
	return name;
}
function requireAssetNameValue(value, operation = "registerAsset") {
	const name = normalizeName(value);
	if (!name) throw new AssetManagerError("INVALID_ASSET_NAME", "Asset name is empty.", {
		operation,
		assetName: name,
		hint: "Provide a non-empty asset name."
	});
	return name;
}
function requireTextAssetNameValue(value, operation = "registerAsset") {
	const name = requireAssetNameValue(value, operation);
	if (name.includes(":")) throw new AssetManagerError("INVALID_ASSET_NAME", `Text asset name "${name}" must not contain a colon.`, {
		operation,
		assetName: name,
		hint: "Use a logical name without a colon."
	});
	return name;
}
function copyEmbeddedBytes(value, assetName) {
	let bytes;
	if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
	else if (value instanceof Uint8Array) bytes = value;
	else throw new AssetManagerError("RESOURCE_ID_INVALID", `Embedded asset "${assetName}" must provide an ArrayBuffer or Uint8Array.`, {
		operation: "registerEmbeddedAsset",
		assetName,
		hint: "Pass validated binary image or audio bytes."
	});
	if (bytes.byteLength === 0) throw new AssetManagerError("RESOURCE_ID_INVALID", `Embedded asset "${assetName}" is empty.`, {
		operation: "registerEmbeddedAsset",
		assetName,
		hint: "Pass at least one byte."
	});
	return Uint8Array.from(bytes).buffer;
}
function embeddedBitmapResolution(value, mimeType, assetName) {
	if (value === void 0) return 1;
	if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") throw new AssetManagerError("ASSET_TYPE_MISMATCH", `Embedded asset "${assetName}" can specify bitmapResolution only for bitmap images.`, {
		operation: "registerEmbeddedAsset",
		assetName,
		expectedKind: "bitmap image",
		actualKind: mimeType,
		hint: "Remove bitmapResolution or use a bitmap image MIME type."
	});
	if (value !== 1 && value !== 2) throw new AssetManagerError("RESOURCE_ID_INVALID", `Embedded bitmap asset "${assetName}" must use bitmapResolution 1 or 2.`, {
		operation: "registerEmbeddedAsset",
		assetName,
		hint: "Use Scratch bitmap resolution 1 or 2."
	});
	return value;
}
function findStageTarget(runtime) {
	const stage = runtime.targets.find((target) => target.isStage);
	if (!stage) throw new AssetManagerError("SPRITE_NOT_FOUND", "Stage target was not found.", {
		operation: "resolveStage",
		actorName: STAGE_RESOURCE_NAME,
		hint: "Load a project with a valid stage target."
	});
	return stage;
}
function findProjectTargetByName(runtime, name) {
	return runtime.targets.find((target) => !target.isStage && target.isOriginal && target.sprite?.name === name) ?? runtime.targets.find((target) => !target.isStage && target.sprite?.name === name) ?? null;
}
function findProjectCostume(target, costumeName, assetId) {
	const costumes = target.sprite?.costumes ?? [];
	return (assetId ? costumes.find((costume) => costume.assetId === assetId) : void 0) ?? costumes.find((costume) => costume.name === costumeName) ?? null;
}
function findProjectSound(target, soundName, assetId) {
	const sounds = target.sprite?.sounds ?? [];
	return (assetId ? sounds.find((sound) => sound.assetId === assetId) : void 0) ?? sounds.find((sound) => sound.name === soundName) ?? null;
}
function resolveCostumeAddress(runtime, name, spriteName, costumeName) {
	const target = findProjectTargetByName(runtime, spriteName);
	if (!target) {
		const candidates = suggestNames(spriteName, runtime.targets.flatMap((candidate) => !candidate.isStage && candidate.sprite?.name ? [candidate.sprite.name] : []));
		throw new AssetManagerError("SPRITE_NOT_FOUND", `Sprite not found: ${spriteName}.`, {
			operation: "registerAsset",
			assetName: name,
			actorName: spriteName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	const costumes = target.sprite?.costumes ?? [];
	const costume = costumeName === null ? costumes.find((candidate) => candidate.name === name) ?? (costumes.length === 1 ? costumes[0] : null) : findProjectCostume(target, costumeName, null);
	if (!costume && costumeName === null && costumes.length > 1) {
		const candidates = suggestNames(name, costumes.map((candidate) => candidate.name));
		throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Costume shorthand is ambiguous: ${spriteName} has multiple costumes and none is named ${name}.`, {
			operation: "registerAsset",
			assetName: name,
			actorName: spriteName,
			candidates,
			hint: suggestionHint(candidates) ?? "Specify the costume name explicitly."
		});
	}
	const resolvedCostumeName = costume?.name ?? costumeName ?? name;
	if (!costume) {
		const candidates = suggestNames(resolvedCostumeName, costumes.map((candidate) => candidate.name));
		throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Costume not found: ${spriteName}/${resolvedCostumeName}.`, {
			operation: "registerAsset",
			assetName: name,
			actorName: spriteName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	return {
		target,
		costume,
		costumeName: resolvedCostumeName
	};
}
function resolveBackdropAddress(runtime, backdropName) {
	const target = findStageTarget(runtime);
	const costume = findProjectCostume(target, backdropName, null);
	if (!costume) {
		const candidates = suggestNames(backdropName, (target.sprite?.costumes ?? []).map((candidate) => candidate.name));
		throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Backdrop not found: ${backdropName}.`, {
			operation: "registerAsset",
			assetName: backdropName,
			actorName: STAGE_RESOURCE_NAME,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	return {
		target,
		costume
	};
}
function resolveSoundAddress(runtime, spriteName, soundName, assetName = soundName) {
	const isStage = spriteName.toLowerCase() === STAGE_RESOURCE_NAME;
	const target = isStage ? findStageTarget(runtime) : findProjectTargetByName(runtime, spriteName);
	if (!target) {
		const candidates = suggestNames(spriteName, runtime.targets.flatMap((candidate) => candidate.sprite?.name ? [candidate.sprite.name] : []));
		throw new AssetManagerError("SPRITE_NOT_FOUND", `Sound source not found: ${spriteName}.`, {
			operation: "registerAsset",
			assetName,
			actorName: spriteName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	const sound = findProjectSound(target, soundName, null);
	if (!sound) {
		const candidates = suggestNames(soundName, (target.sprite?.sounds ?? []).map((candidate) => candidate.name));
		throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Sound not found: ${spriteName}/${soundName}.`, {
			operation: "registerAsset",
			assetName,
			actorName: spriteName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	return {
		target,
		sound,
		isStage
	};
}
function resolveLiteralSoundAddress(runtime, targetName, soundName, assetName) {
	const isStage = targetName === void 0;
	const target = isStage ? findStageTarget(runtime) : findProjectTargetByName(runtime, targetName);
	if (!target) {
		const candidates = suggestNames(targetName ?? STAGE_RESOURCE_NAME, runtime.targets.flatMap((candidate) => !candidate.isStage && candidate.sprite?.name ? [candidate.sprite.name] : []));
		throw new AssetManagerError("SPRITE_NOT_FOUND", "Structured sound target was not found.", {
			operation: "registerProjectAsset",
			assetName,
			actorName: targetName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	const sound = findProjectSound(target, soundName, null);
	if (!sound) {
		const candidates = suggestNames(soundName, (target.sprite?.sounds ?? []).map((candidate) => candidate.name));
		throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", "Structured project sound was not found.", {
			operation: "registerProjectAsset",
			assetName,
			actorName: targetName,
			candidates,
			hint: suggestionHint(candidates)
		});
	}
	return {
		target,
		sound,
		isStage,
		targetName: targetName ?? STAGE_RESOURCE_NAME
	};
}
function validateProjectAssetAddress(runtime, assetName, resourceIdentifier) {
	let fallbackType = "asset-name";
	let fallbackLabel = normalizeName(assetName);
	try {
		const name = requireAssetNameValue(assetName);
		const resourceId = normalizeName(resourceIdentifier);
		if (resourceId === "text" || resourceId.startsWith("text:")) requireTextAssetNameValue(name);
		fallbackType = "resource-id";
		fallbackLabel = resourceId;
		const resource = parseResourceIdentifier(resourceIdentifier, name);
		switch (resource.kind) {
			case "costume":
				resolveCostumeAddress(runtime, name, resource.spriteName, resource.costumeName);
				break;
			case "backdrop":
				resolveBackdropAddress(runtime, resource.backdropName);
				break;
			case "sound":
				resolveSoundAddress(runtime, resource.spriteName, resource.soundName, name);
				break;
			case "text": requireTextAssetNameValue(name);
		}
		return {
			ok: true,
			kind: resource.kind,
			projectLocal: resource.kind !== "cache" && resource.kind !== "external"
		};
	} catch (error) {
		return {
			ok: false,
			type: error instanceof AssetManagerError ? error.code : fallbackType === "asset-name" ? "INVALID_ASSET_NAME" : "RESOURCE_ID_INVALID",
			label: error instanceof AssetManagerError ? error.code === "SPRITE_NOT_FOUND" ? error.actorName ?? error.assetName ?? fallbackLabel : error.code === "RESOURCE_ID_INVALID" ? error.resourceId ?? error.assetName ?? fallbackLabel : error.assetName ?? error.actorName ?? error.resourceId ?? fallbackLabel : fallbackLabel,
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
var AssetManagerExtension = class {
	unregisterNamedBodyProvider() {
		this.namedBodyProviderValue?.release("shutdown");
		this.namedBodyProviderRegistration?.unregister();
		this.namedBodyProviderRegistration = void 0;
		this.unbindNamedDataRegistryLifecycle?.();
		this.unbindNamedDataRegistryLifecycle = void 0;
	}
	constructor(featureFlags = FEATURE_FLAGS, runtime = Scratch.vm.runtime) {
		_defineProperty(this, "runtime", void 0);
		_defineProperty(this, "renderer", void 0);
		_defineProperty(this, "externalAssets", /* @__PURE__ */ new Map());
		_defineProperty(this, "costumeAssets", /* @__PURE__ */ new Map());
		_defineProperty(this, "soundAssets", /* @__PURE__ */ new Map());
		_defineProperty(this, "textAssets", /* @__PURE__ */ new Map());
		_defineProperty(this, "assetRegistry", /* @__PURE__ */ new Map());
		_defineProperty(this, "displayedAssets", /* @__PURE__ */ new Map());
		_defineProperty(this, "explicitAudio", /* @__PURE__ */ new WeakSet());
		_defineProperty(this, "playingAudio", /* @__PURE__ */ new Map());
		_defineProperty(this, "audioVoiceStops", /* @__PURE__ */ new WeakMap());
		_defineProperty(this, "registrationVersions", /* @__PURE__ */ new Map());
		_defineProperty(this, "successfulRegistrationVersions", /* @__PURE__ */ new Map());
		_defineProperty(this, "registrationCancellationVersions", /* @__PURE__ */ new Map());
		_defineProperty(this, "registrationCommits", /* @__PURE__ */ new Map());
		_defineProperty(this, "persistentStore", null);
		_defineProperty(this, "featureFlags", void 0);
		_defineProperty(this, "loadingBackdropName", "");
		_defineProperty(this, "lastAssetErrorType", "");
		_defineProperty(this, "lastAssetErrorLabel", "");
		_defineProperty(this, "assetErrorVersion", 0);
		_defineProperty(this, "domImageResourceVersions", /* @__PURE__ */ new Map());
		_defineProperty(this, "domImageResourceBackings", /* @__PURE__ */ new Map());
		_defineProperty(this, "activeDOMImageResources", /* @__PURE__ */ new Set());
		_defineProperty(this, "activeDOMImageResourcesByName", /* @__PURE__ */ new Map());
		_defineProperty(this, "domImageCapabilityValue", void 0);
		_defineProperty(this, "namedBodyProviderValue", void 0);
		_defineProperty(this, "namedBodyProviderRegistration", void 0);
		_defineProperty(this, "unbindNamedDataRegistryLifecycle", void 0);
		_defineProperty(this, "openNamedBodySnapshots", /* @__PURE__ */ new Set());
		_defineProperty(this, "namedBodyLifecycleVersion", 0);
		_defineProperty(this, "listeningForNamedBodyLifecycle", false);
		_defineProperty(this, "listeningForDOMImageLifecycle", false);
		_defineProperty(this, "releaseAllDOMImageResourcesForLifecycle", () => {
			this.releaseAllDOMImageResources();
		});
		_defineProperty(this, "releaseNamedBodySnapshotsForLifecycle", () => {
			this.releaseOpenNamedBodySnapshots();
		});
		_defineProperty(this, "fixedEditors", fixedInputRegistration(Scratch));
		_defineProperty(this, "listeningForTargetStops", false);
		_defineProperty(this, "releaseStoppedTarget", (target) => {
			if (target && !this.runtime.targets.includes(target)) this.displayedAssets.delete(target.id);
		});
		this.runtime = runtime;
		this.renderer = runtime.renderer;
		this.featureFlags = Object.freeze({ ...featureFlags });
		if (this.featureFlags.NAMED_ASSET_BODY_PROVIDER) {
			this.namedBodyProviderValue = this.createNamedBodyProvider();
			const registry = installNamedDataRegistry(this.runtime);
			this.namedBodyProviderRegistration = registry.registerProvider(this.namedBodyProviderValue, { lifetime: "persistent" });
			this.unbindNamedDataRegistryLifecycle = bindNamedDataRegistryLifecycle(this.runtime, registry);
			this.startListeningForNamedBodyLifecycle();
		}
		this.ensureRuntimeListeners();
	}
	/** A reusable composition reattaches its own listener when registering new assets. */
	ensureRuntimeListeners() {
		if (this.listeningForTargetStops || !this.runtime.on) return;
		this.runtime.on("STOP_FOR_TARGET", this.releaseStoppedTarget);
		this.listeningForTargetStops = true;
	}
	/** Release only this instance's subscription, leaving other runtime owners untouched. */
	releaseRuntimeListeners() {
		if (!this.listeningForTargetStops || !this.runtime.off) return;
		this.runtime.off("STOP_FOR_TARGET", this.releaseStoppedTarget);
		this.listeningForTargetStops = false;
	}
	setLoadingBackdrop(args) {
		this.loadingBackdropName = normalizeName(args.NAME);
		this.loadingAssetCountValue = 0;
	}
	setLoadingCostumes(args) {
		const seen = /* @__PURE__ */ new Set();
		this.loadingCostumes = String(args.NAMES ?? "").split(",").map((name) => normalizeName(name)).filter((name) => {
			if (!name || seen.has(name)) return false;
			seen.add(name);
			return true;
		});
		this.loadingAssetCountValue = 0;
	}
	prepareLoadingAssets(args, util) {
		const listName = normalizeName(args.LIST);
		const list = util.target?.lookupVariableByNameAndType?.(listName, "list");
		if (!list || !Array.isArray(list.value)) throw new Error(`Loading asset list not found: ${listName || "(empty)"}`);
		const loadingBackdrop = this.loadingBackdropName;
		const loadingCostumes = this.loadingCostumes ?? [];
		const loadingCostumeNames = new Set(loadingCostumes);
		const loadingNames = new Set([loadingBackdrop, ...loadingCostumes].filter((name) => name.length > 0));
		const entries = list.value.map((entry) => String(entry));
		const declaredNames = new Set(entries.map((entry) => {
			const separatorIndex = entry.indexOf(",");
			return normalizeName(separatorIndex < 0 ? entry : entry.slice(0, separatorIndex));
		}));
		const missingNames = [...loadingNames].filter((name) => !declaredNames.has(name));
		if (missingNames.length > 0) throw new Error(`Loading asset is not declared: ${missingNames.join(", ")}`);
		const backdropEntries = [];
		const prioritized = [];
		const regular = [];
		for (const entry of entries) {
			const separatorIndex = entry.indexOf(",");
			const assetName = normalizeName(separatorIndex < 0 ? entry : entry.slice(0, separatorIndex));
			if (loadingBackdrop && assetName === loadingBackdrop) backdropEntries.push(entry);
			else (loadingCostumeNames.has(assetName) ? prioritized : regular).push(entry);
		}
		list.value.splice(0, list.value.length, ...backdropEntries, ...prioritized, ...regular);
		this.loadingAssetCountValue = backdropEntries.length + prioritized.length;
	}
	loadingAssetCount() {
		return this.loadingAssetCountValue ?? 0;
	}
	loadingBackdrop() {
		return this.loadingBackdropName;
	}
	loadingCostumeAt(args) {
		const loadingCostumes = this.loadingCostumes ?? [];
		if (loadingCostumes.length === 0) return "";
		const numericIndex = Number(args.INDEX);
		return loadingCostumes[((Number.isFinite(numericIndex) ? Math.max(1, Math.trunc(numericIndex)) : 1) - 1) % loadingCostumes.length];
	}
	getInfo() {
		const blocks = blockDefinitions.map((block) => this.toScratchBlock(block));
		this.fixedEditors.ensure(blocks.map((block) => `${EXTENSION_ID}_${block.opcode}`));
		return {
			id: EXTENSION_ID,
			name: Scratch.translate(block_definitions_default.extensionName),
			docsURI: EXTENSION_DOCS_URI,
			blockIconURI: BLOCK_ICON_URI,
			color1: extensionConfig.color1,
			color2: extensionConfig.color2,
			color3: extensionConfig.color3,
			blocks
		};
	}
	/**
	* Final teardown of this extension instance. Project reloads emit
	* RUNTIME_DISPOSED but keep the instance, so that event only clears
	* per-project state; registrations and listeners are removed here.
	*/
	dispose() {
		this.fixedEditors.dispose();
		this.unregisterNamedBodyProvider();
		this.releaseAllDOMImageResources();
		this.stopListeningForDOMImageLifecycle();
		this.releaseRuntimeListeners();
	}
	/**
	* Exposes the stock extension registry through a host-neutral DOM image
	* resource contract for other unsandboxed extensions.
	*/
	getDOMImageCapability() {
		this.startListeningForDOMImageLifecycle();
		this.domImageCapabilityValue ?? (this.domImageCapabilityValue = Object.freeze({
			isRegistered: (name) => this.assetRegistry.has(normalizeName(name)),
			getMimeType: (name) => this.getAssetMimeType({ NAME: name }),
			resolveDOMImageResource: (name) => this.resolveExtensionDOMImageResource(name)
		}));
		return this.domImageCapabilityValue;
	}
	/**
	* Returns the optional read-only `asset` body provider. The startup-fixed
	* feature flag keeps the adapter completely absent from the default path.
	*/
	getNamedBodyProvider() {
		if (this.featureFlags.NAMED_ASSET_BODY_PROVIDER !== true) return null;
		return this.namedBodyProviderValue ?? null;
	}
	/** Canonical typed entry point for the existing asset registry provider. */
	getNamedDataProvider() {
		return this.getNamedBodyProvider();
	}
	validateProjectAssetAddress(args) {
		return JSON.stringify(validateProjectAssetAddress(this.runtime, args.NAME, args.RESOURCE_ID));
	}
	async registerProjectAssetLiteral(assetName, locatorInput) {
		const name = requireAssetNameValue(assetName, "registerProjectAsset");
		let locator;
		try {
			locator = parseProjectAssetLocator(locatorInput);
		} catch (error) {
			throw new AssetManagerError("RESOURCE_ID_INVALID", errorMessage(error), {
				operation: "registerProjectAsset",
				assetName: name,
				hint: "Pass a structured backdrop, costume, or sound locator.",
				cause: error
			});
		}
		switch (locator.kind) {
			case "backdrop":
				await this.registerBackdropReference(name, locator.name);
				return;
			case "costume":
				await this.registerCostumeReference(name, locator.target, locator.name);
				return;
			case "sound":
				await this.registerLiteralSoundReference(name, locator.target, locator.name);
				return;
		}
	}
	async registerAsset(args) {
		const errorVersion = ++this.assetErrorVersion;
		this.clearAssetError();
		let fallbackType = "asset-name";
		let fallbackLabel = normalizeName(args.NAME);
		try {
			const name = this.requireAssetName(args.NAME);
			const resourceId = normalizeName(args.RESOURCE_ID);
			if (resourceId === "text" || resourceId.startsWith("text:")) this.requireTextAssetName(name);
			fallbackType = "resource-id";
			fallbackLabel = resourceId;
			let resource;
			try {
				resource = parseResourceIdentifier(args.RESOURCE_ID, name);
			} catch (error) {
				throw new AssetManagerError("RESOURCE_ID_INVALID", errorMessage(error), {
					operation: "registerAsset",
					assetName: name,
					resourceId,
					hint: "Use an HTTP(S) URL or a supported costume, backdrop, sound, or text resource ID.",
					cause: error
				});
			}
			switch (resource.kind) {
				case "cache":
					fallbackType = "cache";
					fallbackLabel = name;
					await this.registerExternalAsset("", name);
					return;
				case "external":
					fallbackType = "external";
					fallbackLabel = resource.url;
					await this.registerExternalAsset(resource.url, name);
					return;
				case "costume":
					fallbackType = "costume";
					fallbackLabel = resource.costumeName ?? name;
					await this.registerCostumeReference(name, resource.spriteName, resource.costumeName);
					return;
				case "backdrop":
					fallbackType = "backdrop";
					fallbackLabel = resource.backdropName;
					await this.registerBackdropReference(name, resource.backdropName);
					return;
				case "sound":
					fallbackType = "sound";
					fallbackLabel = resource.soundName;
					await this.registerSoundReference(name, resource.spriteName, resource.soundName);
					return;
				case "text":
					fallbackType = "text";
					fallbackLabel = resource.runtimeVariableName;
					await this.registerTextReference(name, resource.runtimeVariableName);
					return;
			}
		} catch (error) {
			const diagnostic = error instanceof AssetManagerError ? error : new AssetManagerError("REPLACEMENT_FAILED", errorMessage(error), {
				operation: "registerAsset",
				assetName: fallbackType === "asset-name" ? fallbackLabel : normalizeName(args.NAME),
				resourceId: normalizeName(args.RESOURCE_ID),
				hint: "The previous registration and display were kept. Check the resource and try again.",
				cause: error
			});
			if (this.assetErrorVersion === errorVersion) {
				if (diagnostic instanceof AssetManagerError) {
					this.lastAssetErrorType = diagnostic.code;
					this.lastAssetErrorLabel = diagnostic.code === "SPRITE_NOT_FOUND" ? diagnostic.actorName ?? diagnostic.assetName ?? fallbackLabel : diagnostic.code === "RESOURCE_ID_INVALID" ? diagnostic.resourceId ?? diagnostic.assetName ?? fallbackLabel : diagnostic.assetName ?? diagnostic.actorName ?? diagnostic.resourceId ?? fallbackLabel;
				}
			}
			throw diagnostic;
		}
	}
	async registerEmbeddedAsset(input) {
		const name = this.requireAssetName(input.name, "registerEmbeddedAsset");
		const sourceName = normalizeName(input.sourceName) || name;
		const mimeType = normalizeMimeType(input.mimeType, sourceName);
		const mediaKind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "unknown";
		if (mediaKind === "unknown") throw new AssetManagerError("ASSET_TYPE_MISMATCH", `Embedded asset "${name}" has unsupported MIME type ${mimeType}.`, {
			operation: "registerEmbeddedAsset",
			assetName: name,
			expectedKind: "image or audio",
			actualKind: mimeType,
			hint: "Use an image/* or audio/* MIME type."
		});
		const bitmapResolution = embeddedBitmapResolution(input.bitmapResolution, mimeType, name);
		const data = copyEmbeddedBytes(input.bytes, name);
		const token = this.beginRegistration(name);
		const prepared = {
			kind: "external",
			name,
			url: sourceName,
			mimeType,
			data,
			cachedAt: Date.now(),
			skinId: null,
			...mediaKind === "image" && mimeType !== "image/svg+xml" ? { bitmapResolution } : {}
		};
		await this.commitPreparedAsset(name, "external", prepared, token);
		return Object.freeze({
			name,
			mimeType
		});
	}
	assetErrorType() {
		return this.lastAssetErrorType;
	}
	assetErrorLabel() {
		return this.lastAssetErrorLabel;
	}
	/** Legacy opcode retained for existing projects. */
	async loadAsset(args) {
		const name = this.requireAssetName(args.NAME, "loadAsset");
		const resourceId = normalizeName(args.URL);
		try {
			await this.registerExternalAsset(resourceId, name);
		} catch (error) {
			if (error instanceof AssetManagerError) throw error;
			throw new AssetManagerError("REPLACEMENT_FAILED", errorMessage(error), {
				operation: "loadAsset",
				assetName: name,
				resourceId,
				hint: "The previous registration and display were kept. Check the URL or cache.",
				cause: error
			});
		}
	}
	deleteMemoryAsset(args) {
		this.unregisterAsset(normalizeName(args.NAME));
	}
	deleteAllMemoryAssets() {
		this.releaseAllDOMImageResources();
		for (const name of this.registrationVersions.keys()) this.cancelRegistrations(name);
		for (const asset of this.externalAssets.values()) this.deleteOwnedSkinIfExists(asset);
		this.externalAssets.clear();
		this.costumeAssets.clear();
		this.soundAssets.clear();
		this.textAssets.clear();
		this.assetRegistry.clear();
		this.displayedAssets.clear();
		for (const audio of [...this.playingAudio.keys()]) this.stopExternalAudio(audio);
		this.playingAudio.clear();
	}
	async deleteCachedAsset(args) {
		const name = normalizeName(args.NAME);
		await this.cacheDelete(name);
	}
	async deleteAllCachedAssets() {
		await this.cacheClear();
	}
	isLoaded(args) {
		return this.assetRegistry.has(normalizeName(args.NAME));
	}
	async setThisSpriteSkin(args, util) {
		if (!util.target || util.target.isStage) throw new AssetManagerError("SPRITE_NOT_FOUND", "This block must be used on a sprite or its clone.", {
			operation: "setThisSpriteSkin",
			hint: "Run this block from a sprite target."
		});
		await this.applyAssetToTarget(util.target, args.NAME, util);
	}
	async setSpriteSkin(args, util) {
		const name = normalizeName(args.SPRITE);
		const target = this.findTargetByName(name);
		if (!target) {
			const candidates = suggestNames(name, this.runtime.targets.flatMap((candidate) => !candidate.isStage && candidate.sprite?.name ? [candidate.sprite.name] : []));
			throw new AssetManagerError("SPRITE_NOT_FOUND", `Sprite not found: ${name}.`, {
				operation: "setSpriteSkin",
				actorName: name,
				candidates,
				hint: suggestionHint(candidates)
			});
		}
		await this.applyAssetToTarget(target, args.NAME, util);
	}
	async setStageSkin(args) {
		await this.applyAssetToTarget(this.getStageTarget(), args.NAME);
	}
	async playSound(args) {
		await this.playResolvedSound(args.NAME, false);
	}
	async playSoundUntilDone(args) {
		await this.playResolvedSound(args.NAME, true);
	}
	async createAudioVoice(value, options = {}) {
		if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Audio voice options must be an object.");
		if (Object.keys(options).some((key) => key !== "gain")) throw new TypeError("Audio voice options contain an unknown property.");
		const gain = normalizeAudioVoiceGain(options.gain, "Audio voice initial gain");
		const name = normalizeName(value);
		const resource = await this.resolveAudioBytes(name);
		const playback = this.startBrowserAudioVoice(name, resource.bytes, resource.mimeType, gain, "createAudioVoice");
		await playback.started;
		return playback.voice;
	}
	async createAudioPlayback(source, options = {}, onDispose = () => {}) {
		validateAudioPlaybackOptions(options);
		if (!source || typeof source !== "object" || Array.isArray(source) || Object.keys(source).length !== 1 || Object.hasOwn(source, "asset") === Object.hasOwn(source, "url")) throw new TypeError("Audio requires exactly one asset or URL.");
		if (Object.hasOwn(source, "url")) {
			if (typeof source.url !== "string" || !/^https?:\/\/[^\s]+$/u.test(source.url)) throw new TypeError("Audio URL must use HTTP(S) without credentials.");
			const url = new URL(source.url);
			if (!url.hostname || url.username || url.password) throw new TypeError("Invalid audio URL.");
			return this.prepareBrowserAudio("", source.url, options, onDispose, "createAudioPlayback");
		}
		const name = normalizeName(source.asset);
		const version = this.registrationVersions.get(name);
		const resource = await this.resolveAudioBytes(name);
		if (!this.assetRegistry.has(name) || version !== this.registrationVersions.get(name)) throw new Error("Audio source was released or replaced while preparing.");
		const bytes = resource.bytes instanceof Uint8Array ? new Uint8Array(resource.bytes).buffer : resource.bytes;
		const url = URL.createObjectURL(new Blob([bytes], { type: resource.mimeType }));
		return this.prepareBrowserAudio(name, url, options, () => {
			URL.revokeObjectURL(url);
			onDispose();
		}, "createAudioPlayback");
	}
	prepareBrowserAudio(name, url, options, release, operation) {
		let audio;
		let controller;
		try {
			const directAudio = operation === "createAudioPlayback" && /^https?:/u.test(url);
			audio = directAudio ? new Audio() : new Audio(url);
			if (directAudio) {
				audio.crossOrigin = "anonymous";
				audio.src = url;
			}
			controller = createBrowserAudioPlayback(audio, options, () => {
				this.playingAudio.delete(audio);
				this.audioVoiceStops.delete(audio);
				release();
			}, (cause) => this.playbackError(name, cause, operation));
		} catch (cause) {
			release();
			throw this.playbackError(name, cause, operation);
		}
		if (operation === "createAudioPlayback") this.explicitAudio.add(audio);
		this.playingAudio.set(audio, name);
		this.audioVoiceStops.set(audio, () => controller.dispose());
		return controller;
	}
	stopSound(args) {
		const name = normalizeName(args.NAME);
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("stopSound", name);
		if (kind === "external") {
			const asset = this.externalAssets.get(name);
			if (!asset) throw this.assetNotRegistered("stopSound", name);
			asset.mimeType = normalizeMimeType(asset.mimeType, asset.url || name);
			if (!asset.mimeType.startsWith("audio/")) throw this.assetTypeMismatch("stopSound", name, "audio", `external/${this.externalMediaKind(asset)}`);
			for (const [audio, assetName] of [...this.playingAudio]) if (assetName === name && !this.explicitAudio.has(audio)) this.stopExternalAudio(audio);
			return;
		}
		if (kind === "sound") {
			const { target, sound, soundBank } = this.resolveSoundReference(name);
			for (const [audio, assetName] of [...this.playingAudio]) if (assetName === name && !this.explicitAudio.has(audio)) this.stopExternalAudio(audio);
			soundBank.stop(target, sound.soundId);
			return;
		}
		throw this.assetTypeMismatch("stopSound", name, "audio", kind);
	}
	stopAllSounds() {
		for (const audio of [...this.playingAudio.keys()]) this.stopExternalAudio(audio);
		this.playingAudio.clear();
		for (const target of this.runtime.targets) target.sprite?.soundBank?.stopAllSounds(target);
	}
	getAssetMimeType(args) {
		const name = normalizeName(args.NAME);
		const kind = this.assetRegistry.get(name);
		if (!kind) return "";
		switch (kind) {
			case "external": {
				const asset = this.externalAssets.get(name);
				return asset ? normalizeMimeType(asset.mimeType, asset.url || name) : "";
			}
			case "costume":
			case "backdrop": {
				const { costume } = this.resolveCostumeReference(name);
				return this.projectAssetMimeType(costume.dataFormat, "image");
			}
			case "sound": {
				const { sound } = this.resolveSoundReference(name);
				return this.projectAssetMimeType(sound.dataFormat, "audio");
			}
			case "text": return "text/plain";
		}
	}
	async resolveImageAssetBytes(args) {
		const name = normalizeName(args.NAME);
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("resolveDOMImageResource", name);
		if (kind === "external") {
			const asset = this.externalAssets.get(name);
			if (!asset) throw this.assetNotRegistered("resolveDOMImageResource", name);
			const mimeType = normalizeMimeType(asset.mimeType, asset.url || name);
			if (!mimeType.startsWith("image/")) throw this.assetTypeMismatch("resolveDOMImageResource", name, "image", `external/${this.externalMediaKind(asset)}`);
			return Object.freeze({
				bytes: new Uint8Array(asset.data.slice(0)),
				mimeType
			});
		}
		if (kind === "costume" || kind === "backdrop") {
			const { costume } = this.resolveCostumeReference(name);
			const mimeType = this.projectAssetMimeType(costume.dataFormat, "image");
			const asset = await this.resolveProjectImageStorageAsset(name, costume);
			const source = asset.data instanceof Uint8Array ? asset.data : new Uint8Array(asset.data);
			return Object.freeze({
				bytes: Uint8Array.from(source),
				mimeType
			});
		}
		throw this.assetTypeMismatch("resolveDOMImageResource", name, "image", kind);
	}
	getVersion() {
		return EXTENSION_VERSION;
	}
	async setTextValue(args) {
		const name = this.requireTextAssetName(args.NAME, "setTextValue");
		const kind = this.assetRegistry.get(name);
		if (kind !== void 0 && kind !== "text") throw this.assetTypeMismatch("setTextValue", name, "text", kind);
		const reference = this.textAssets.get(name);
		this.setRuntimeVariable(reference?.runtimeVariableName ?? textRuntimeVariableName(name), String(args.VALUE ?? ""));
		const targets = this.runtime.targets.filter((target) => this.displayedAssets.get(target.id)?.assetName === name);
		await Promise.all(targets.map(async (target) => {
			await this.applyTextToTarget(target, name, {
				runtime: this.runtime,
				target
			});
			this.setDisplayBinding(target, name, "text");
		}));
	}
	setTextStyle(args) {
		const name = this.requireTextAssetName(args.NAME, "setTextStyle");
		const kind = this.assetRegistry.get(name);
		if (kind !== void 0 && kind !== "text") throw this.assetTypeMismatch("setTextStyle", name, "text", kind);
		let property;
		try {
			property = normalizeTextStyleProperty(args.PROPERTY);
		} catch (error) {
			throw new AssetManagerError("STYLE_PROPERTY_INVALID", errorMessage(error), {
				operation: "setTextStyle",
				assetName: name,
				hint: "Use animation, font, color, width, or align.",
				cause: error
			});
		}
		let value;
		try {
			value = normalizeTextStyleValue(property, args.VALUE);
		} catch (error) {
			throw new AssetManagerError("STYLE_VALUE_INVALID", errorMessage(error), {
				operation: "setTextStyle",
				assetName: name,
				hint: `Provide a valid ${property} value.`,
				cause: error
			});
		}
		this.setRuntimeVariable(textStyleRuntimeVariableName(name, property), value);
	}
	assetNotRegistered(operation, name) {
		const candidates = suggestNames(name, this.assetRegistry.keys());
		return new AssetManagerError("ASSET_NOT_REGISTERED", `Cannot ${operation} asset "${name}": no registered asset has that name.`, {
			operation,
			assetName: name,
			candidates,
			hint: suggestionHint(candidates) ?? "Register the asset before using it."
		});
	}
	assetTypeMismatch(operation, name, expectedKind, actualKind) {
		return new AssetManagerError("ASSET_TYPE_MISMATCH", `Cannot ${operation} asset "${name}": expected ${expectedKind}, but it is ${actualKind}.`, {
			operation,
			assetName: name,
			expectedKind,
			actualKind,
			hint: `Use an asset registered as ${expectedKind}.`
		});
	}
	toScratchBlock(block) {
		return {
			opcode: block.opcode,
			blockType: Scratch.BlockType[block.blockType],
			text: Scratch.translate(block.text),
			...block.hideFromPalette ? { hideFromPalette: true } : {},
			...Object.keys(block.arguments).length > 0 ? { arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
				type: Scratch.ArgumentType[argument.type],
				defaultValue: argument.defaultValue
			}])) } : {}
		};
	}
	requireAssetName(value, operation = "registerAsset") {
		return requireAssetNameValue(value, operation);
	}
	requireTextAssetName(value, operation = "registerAsset") {
		return requireTextAssetNameValue(value, operation);
	}
	clearAssetError() {
		this.lastAssetErrorType = "";
		this.lastAssetErrorLabel = "";
	}
	beginRegistration(name) {
		const version = (this.registrationVersions.get(name) ?? 0) + 1;
		this.registrationVersions.set(name, version);
		return {
			version,
			cancellationVersion: this.registrationCancellationVersions.get(name) ?? 0
		};
	}
	cancelRegistrations(name) {
		const cancellationVersion = (this.registrationCancellationVersions.get(name) ?? 0) + 1;
		this.registrationCancellationVersions.set(name, cancellationVersion);
	}
	isRegistrationCancellationCurrent(name, token) {
		return (this.registrationCancellationVersions.get(name) ?? 0) === token.cancellationVersion;
	}
	async registerExternalAsset(url, name) {
		const token = this.beginRegistration(name);
		const record = url ? await this.fetchExternalAsset(url, name) : await this.cacheLookup(name);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		if (!record) {
			const candidates = suggestNames(name, this.assetRegistry.keys());
			throw new AssetManagerError("ASSET_NOT_REGISTERED", `Asset "${name}" is not cached and no URL was provided.`, {
				operation: "registerAsset",
				assetName: name,
				candidates,
				hint: suggestionHint(candidates) ?? "Register an HTTP(S) URL before loading from cache."
			});
		}
		const prepared = {
			...record,
			kind: "external",
			mimeType: normalizeMimeType(record.mimeType, record.url || name),
			skinId: null
		};
		await this.commitPreparedAsset(name, "external", prepared, token, url ? record : void 0);
	}
	async registerCostumeReference(name, spriteName, costumeName) {
		const token = this.beginRegistration(name);
		const { target, costume, costumeName: resolvedCostumeName } = resolveCostumeAddress(this.runtime, name, spriteName, costumeName);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		await this.commitPreparedAsset(name, "costume", {
			kind: "costume",
			name,
			targetId: target.id,
			targetName: spriteName,
			isStage: false,
			costumeName: resolvedCostumeName,
			assetId: costume.assetId ?? null
		}, token);
	}
	async registerBackdropReference(name, backdropName) {
		const token = this.beginRegistration(name);
		const { target: stage, costume } = resolveBackdropAddress(this.runtime, backdropName);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		await this.commitPreparedAsset(name, "backdrop", {
			kind: "backdrop",
			name,
			targetId: stage.id,
			targetName: STAGE_RESOURCE_NAME,
			isStage: true,
			costumeName: backdropName,
			assetId: costume.assetId ?? null
		}, token);
	}
	async registerSoundReference(name, spriteName, soundName) {
		const token = this.beginRegistration(name);
		const { target, sound, isStage } = resolveSoundAddress(this.runtime, spriteName, soundName, name);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		await this.commitPreparedAsset(name, "sound", {
			kind: "sound",
			name,
			targetId: target.id,
			targetName: isStage ? STAGE_RESOURCE_NAME : spriteName,
			isStage,
			soundName,
			assetId: sound.assetId ?? null
		}, token);
	}
	async registerLiteralSoundReference(name, targetName, soundName) {
		const token = this.beginRegistration(name);
		const resolved = resolveLiteralSoundAddress(this.runtime, targetName, soundName, name);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		await this.commitPreparedAsset(name, "sound", {
			kind: "sound",
			name,
			targetId: resolved.target.id,
			targetName: resolved.targetName,
			isStage: resolved.isStage,
			soundName,
			assetId: resolved.sound.assetId ?? null
		}, token);
	}
	async registerTextReference(name, runtimeVariableName) {
		const token = this.beginRegistration(name);
		this.requireTextAssetName(name);
		if (!this.isRegistrationCancellationCurrent(name, token)) return;
		await this.commitPreparedAsset(name, "text", {
			kind: "text",
			name,
			runtimeVariableName
		}, token);
	}
	unregisterAsset(name) {
		this.cancelRegistrations(name);
		for (const [audio, assetName] of [...this.playingAudio]) if (assetName === name) this.stopExternalAudio(audio);
		this.invalidateDOMImageResources(name);
		const kind = this.assetRegistry.get(name);
		if (!kind) return;
		const asset = this.getRegisteredAsset(name, kind);
		this.removeRegisteredAsset(name, kind);
		this.disposeRegisteredAsset(asset);
		this.assetRegistry.delete(name);
		for (const [targetId, binding] of this.displayedAssets) if (binding.assetName === name) this.displayedAssets.delete(targetId);
	}
	async commitPreparedAsset(name, kind, prepared, token, cacheRecord) {
		const commit = (this.registrationCommits.get(name) ?? Promise.resolve()).catch(() => void 0).then(async () => {
			if (!this.isRegistrationCancellationCurrent(name, token) || token.version < (this.successfulRegistrationVersions.get(name) ?? 0)) {
				this.disposeRegisteredAsset(prepared);
				return;
			}
			const currentKind = this.assetRegistry.get(name);
			const current = currentKind ? this.getRegisteredAsset(name, currentKind) : void 0;
			this.assertReplacementKind(name, currentKind, current, kind, prepared);
			let previousCached;
			let nextCached;
			if (cacheRecord) {
				previousCached = await this.cacheLookup(name);
				if (!this.isRegistrationCancellationCurrent(name, token)) {
					this.disposeRegisteredAsset(prepared);
					return;
				}
				nextCached = {
					...cacheRecord,
					generation: this.store().nextGeneration()
				};
				await this.cachePut(nextCached);
				if (!this.isRegistrationCancellationCurrent(name, token)) {
					await this.restoreCacheIfGeneration(name, nextCached.generation, previousCached);
					this.disposeRegisteredAsset(prepared);
					return;
				}
			}
			try {
				await this.commitPreparedAssetNow(name, kind, prepared, token);
			} catch (error) {
				if (nextCached) await this.restoreCacheIfGeneration(name, nextCached.generation, previousCached ?? null);
				throw error;
			}
			this.invalidateDOMImageResources(name);
			if (!this.isRegistrationCancellationCurrent(name, token)) {
				if (nextCached) await this.restoreCacheIfGeneration(name, nextCached.generation, previousCached ?? null);
				return;
			}
			this.successfulRegistrationVersions.set(name, token.version);
			if (nextCached) this.store().commit(name, nextCached);
		});
		this.registrationCommits.set(name, commit);
		try {
			await commit;
		} finally {
			if (this.registrationCommits.get(name) === commit) this.registrationCommits.delete(name);
		}
	}
	async commitPreparedAssetNow(name, kind, prepared, token) {
		const currentKind = this.assetRegistry.get(name);
		const current = currentKind ? this.getRegisteredAsset(name, currentKind) : void 0;
		this.assertReplacementKind(name, currentKind, current, kind, prepared);
		if (currentKind === kind && current && this.featureFlags.ENABLE_LIVE_ASSET_REPLACEMENT) {
			await this.replaceRegisteredAsset(name, kind, current, prepared, token);
			return;
		}
		if (currentKind) this.removeRegisteredAsset(name, currentKind);
		this.installRegisteredAsset(name, kind, prepared);
		this.disposeRegisteredAsset(current);
		for (const [targetId, binding] of this.displayedAssets) if (binding.assetName === name) this.displayedAssets.delete(targetId);
	}
	assertReplacementKind(name, currentKind, current, nextKind, next) {
		if (!currentKind || !this.featureFlags.ENABLE_STRICT_ASSET_KIND_REPLACEMENT) return;
		let expectedKind = currentKind;
		let actualKind = nextKind;
		if (currentKind === "external" && nextKind === "external" && current?.kind === "external" && next.kind === "external") {
			const currentMedia = this.externalMediaKind(current);
			const nextMedia = this.externalMediaKind(next);
			if (currentMedia === nextMedia || currentMedia === "unknown" || nextMedia === "unknown") return;
			expectedKind = `external/${currentMedia}`;
			actualKind = `external/${nextMedia}`;
		} else if (currentKind === nextKind) return;
		throw new AssetManagerError("ASSET_TYPE_CHANGE", `Cannot replace asset "${name}": it is currently registered as ${expectedKind}, but the new resource is ${actualKind}.`, {
			operation: "registerAsset",
			assetName: name,
			expectedKind,
			actualKind,
			hint: "Delete the existing asset first if this type change is intentional."
		});
	}
	async replaceRegisteredAsset(name, kind, current, prepared, token) {
		const managedDisplays = [...this.displayedAssets].filter(([, binding]) => binding.assetName === name && binding.assetKind === kind).flatMap(([targetId, binding]) => {
			const target = this.runtime.targets.find((candidate) => candidate.id === targetId);
			if (target && this.isDisplayBindingCurrent(target, binding)) return [{
				target,
				binding
			}];
			this.displayedAssets.delete(targetId);
			return [];
		});
		let preparedDisplays;
		try {
			const skin = kind === "text" || managedDisplays.length === 0 ? null : await this.resolveSkinFromAsset(name, kind, prepared);
			preparedDisplays = managedDisplays.map(({ target, binding }) => ({
				target,
				binding,
				skin
			}));
		} catch (error) {
			this.disposeRegisteredAsset(prepared);
			throw new AssetManagerError("REPLACEMENT_FAILED", `Cannot prepare replacement asset "${name}": ${errorMessage(error)}`, {
				operation: "registerAsset",
				assetName: name,
				hint: "The old registration and display were kept.",
				cause: error
			});
		}
		if (!this.isRegistrationCancellationCurrent(name, token)) {
			this.disposeRegisteredAsset(prepared);
			return;
		}
		this.installRegisteredAsset(name, kind, prepared);
		const attemptedTargets = [];
		try {
			for (const display of preparedDisplays) {
				if (!this.isRegistrationCancellationCurrent(name, token)) break;
				if (!this.runtime.targets.includes(display.target)) {
					this.displayedAssets.delete(display.target.id);
					continue;
				}
				if (this.displayedAssets.get(display.target.id) !== display.binding) continue;
				if (!this.isDisplayBindingCurrent(display.target, display.binding)) {
					this.displayedAssets.delete(display.target.id);
					continue;
				}
				attemptedTargets.push(display.target);
				if (kind === "text") await this.applyTextReferenceToTarget(display.target, name, prepared, {
					runtime: this.runtime,
					target: display.target
				});
				else if (display.skin) this.applySkinToTarget(display.target, display.skin);
				if (this.isRegistrationCancellationCurrent(name, token)) this.setDisplayBinding(display.target, name, kind, display.skin?.skinId);
			}
		} catch (error) {
			if (!this.isRegistrationCancellationCurrent(name, token)) {
				this.disposeRegisteredAsset(current);
				return;
			}
			this.installRegisteredAsset(name, kind, current);
			let rollbackError;
			for (const target of attemptedTargets) {
				if (!this.runtime.targets.includes(target)) continue;
				try {
					if (kind === "text") await this.applyTextReferenceToTarget(target, name, current, {
						runtime: this.runtime,
						target
					});
					else {
						const currentSkin = await this.resolveSkinFromAsset(name, kind, current);
						this.applySkinToTarget(target, currentSkin);
						this.setDisplayBinding(target, name, kind, currentSkin.skinId);
						continue;
					}
					this.setDisplayBinding(target, name, kind);
				} catch (rollbackFailure) {
					rollbackError ?? (rollbackError = rollbackFailure);
				}
			}
			this.disposeRegisteredAsset(prepared);
			throw new AssetManagerError("REPLACEMENT_FAILED", `Cannot replace asset "${name}": ${errorMessage(error)}`, {
				operation: "registerAsset",
				assetName: name,
				hint: rollbackError ? `The old registration was restored, but its display could not be reapplied: ${errorMessage(rollbackError)}` : "The old registration and display were restored.",
				cause: error
			});
		}
		this.disposeRegisteredAsset(current);
	}
	getRegisteredAsset(name, kind) {
		if (kind === "external") return this.externalAssets.get(name);
		if (kind === "costume" || kind === "backdrop") return this.costumeAssets.get(name);
		if (kind === "sound") return this.soundAssets.get(name);
		return this.textAssets.get(name);
	}
	installRegisteredAsset(name, kind, asset) {
		if (kind === "external") this.externalAssets.set(name, asset);
		else if (kind === "costume" || kind === "backdrop") this.costumeAssets.set(name, asset);
		else if (kind === "sound") this.soundAssets.set(name, asset);
		else this.textAssets.set(name, asset);
		this.assetRegistry.set(name, kind);
	}
	removeRegisteredAsset(name, kind) {
		if (kind === "external") this.externalAssets.delete(name);
		else if (kind === "costume" || kind === "backdrop") this.costumeAssets.delete(name);
		else if (kind === "sound") this.soundAssets.delete(name);
		else this.textAssets.delete(name);
	}
	disposeRegisteredAsset(asset) {
		if (asset?.kind === "external") this.deleteOwnedSkinIfExists(asset);
	}
	externalMediaKind(asset) {
		const mimeType = normalizeMimeType(asset.mimeType, asset.url || asset.name);
		if (mimeType.startsWith("image/")) return "image";
		if (mimeType.startsWith("audio/")) return "audio";
		return "unknown";
	}
	/** The page's one owner of the `tw-asset-cache` database, shared with every other copy of this package. */
	store() {
		this.persistentStore ?? (this.persistentStore = acquirePersistentAssetStore());
		return this.persistentStore;
	}
	async cacheLookup(name) {
		const committed = this.store().committed(name);
		return committed === void 0 ? await this.cacheGet(name) : committed;
	}
	async cacheGet(name) {
		return await this.store().get(name);
	}
	async cachePut(record) {
		await this.store().put(record);
	}
	async cacheDelete(name) {
		await this.store().delete(name);
	}
	async cacheClear() {
		await this.store().clear();
	}
	async restoreCacheIfGeneration(name, generation, previous) {
		await this.store().restoreIfGeneration(name, generation, previous);
	}
	async fetchExternalAsset(url, name) {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to fetch asset "${name}": ${response.status} ${response.statusText}`);
		const blob = await response.blob();
		return {
			name,
			url,
			mimeType: normalizeMimeType(blob.type || response.headers.get("Content-Type"), url),
			data: await blob.arrayBuffer(),
			cachedAt: Date.now()
		};
	}
	getStageTarget() {
		return findStageTarget(this.runtime);
	}
	findTargetByName(name) {
		return findProjectTargetByName(this.runtime, name);
	}
	resolveReferencedTarget(targetId, targetName, isStage) {
		const byId = this.runtime.targets.find((target) => target.id === targetId);
		if (byId) return byId;
		if (isStage) return this.getStageTarget();
		const byName = this.findTargetByName(targetName);
		if (!byName) {
			const candidates = suggestNames(targetName, this.runtime.targets.flatMap((target) => target.sprite?.name ? [target.sprite.name] : []));
			throw new AssetManagerError("SPRITE_NOT_FOUND", `Asset source target no longer exists: ${targetName}.`, {
				operation: "resolveAsset",
				actorName: targetName,
				candidates,
				hint: suggestionHint(candidates)
			});
		}
		return byName;
	}
	findCostume(target, costumeName, assetId) {
		return findProjectCostume(target, costumeName, assetId);
	}
	findSound(target, soundName, assetId) {
		return findProjectSound(target, soundName, assetId);
	}
	async resolveSkin(value) {
		const name = normalizeName(value);
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("show", name);
		const asset = this.getRegisteredAsset(name, kind);
		if (!asset) throw this.assetNotRegistered("show", name);
		return this.resolveSkinFromAsset(name, kind, asset);
	}
	async applyAssetToTarget(target, value, util) {
		const name = normalizeName(value);
		const kind = this.assetRegistry.get(name);
		let skinId;
		if (!kind) throw this.assetNotRegistered("show", name);
		if (!this.runtime.targets.includes(target)) return;
		if (kind === "text") await this.applyTextToTarget(target, name, util);
		else if (kind === "external" || kind === "costume" || kind === "backdrop") {
			const skin = await this.resolveSkin(name);
			if (!this.runtime.targets.includes(target)) return;
			this.applySkinToTarget(target, skin);
			skinId = skin.skinId;
		} else throw this.assetTypeMismatch("show", name, "image or text", kind);
		if (!this.runtime.targets.includes(target)) return;
		this.setDisplayBinding(target, name, kind, skinId);
	}
	setDisplayBinding(target, name, kind, skinId) {
		if (kind === "sound") {
			this.displayedAssets.delete(target.id);
			return;
		}
		this.displayedAssets.set(target.id, {
			assetName: name,
			assetKind: kind,
			skinId: skinId ?? null
		});
	}
	isDisplayBindingCurrent(target, binding) {
		if (binding.assetKind === "text") return true;
		if (binding.skinId === null || target.drawableID === void 0 || target.drawableID === null) return false;
		return this.renderer._allDrawables?.[target.drawableID]?.skin?.id === binding.skinId;
	}
	applyResolvedSkinToTarget(target, name, skin) {
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("show", name);
		if (kind !== "external" && kind !== "costume" && kind !== "backdrop") throw this.assetTypeMismatch("show", name, "image", kind);
		this.applySkinToTarget(target, skin);
		this.setDisplayBinding(target, name, kind, skin.skinId);
	}
	async applyTextToTarget(target, name, util) {
		if (target.isStage) throw this.assetTypeMismatch("show on stage", name, "image", "text");
		const reference = this.textAssets.get(name);
		if (!reference) throw this.assetNotRegistered("show", name);
		await this.applyTextReferenceToTarget(target, name, reference, util);
	}
	async applyTextReferenceToTarget(target, name, reference, util) {
		if (target.isStage) throw this.assetTypeMismatch("show on stage", name, "image", "text");
		const temporaryVariables = this.requireTemporaryVariables("show", name);
		const getRuntimeVariable = (variableName) => temporaryVariables.getRuntimeVariable({ VAR: variableName });
		let style;
		try {
			style = resolveTextStyle(name, this.runtime.stageWidth, getRuntimeVariable);
		} catch (error) {
			throw new AssetManagerError("STYLE_VALUE_INVALID", errorMessage(error), {
				operation: "show",
				assetName: name,
				hint: "Correct the stored text style value before showing this asset.",
				cause: error
			});
		}
		const setFont = this.requireAnimatedTextOpcode("text_setFont", name);
		const setColor = this.requireAnimatedTextOpcode("text_setColor", name);
		const setWidth = this.requireAnimatedTextOpcode("text_setWidth", name);
		const setOutlineWidth = this.runtime.getOpcodeFunction?.("text_setOutlineWidth");
		const setOutlineColor = this.runtime.getOpcodeFunction?.("text_setOutlineColor");
		const displayText = this.requireAnimatedTextOpcode(style.animation === "none" ? "text_setText" : "text_animateText", name);
		const blockUtility = {
			...util,
			target,
			runtime: util?.runtime ?? this.runtime
		};
		const text = getRuntimeVariable(reference.runtimeVariableName);
		await Promise.resolve(setFont({ FONT: style.font }, blockUtility));
		await Promise.resolve(setColor({ COLOR: style.color }, blockUtility));
		await Promise.resolve(setWidth({
			WIDTH: style.width,
			ALIGN: style.align
		}, blockUtility));
		if (setOutlineWidth) await Promise.resolve(setOutlineWidth({ WIDTH: 2 }, blockUtility));
		if (setOutlineColor) await Promise.resolve(setOutlineColor({ COLOR: DEFAULT_OUTLINE_COLOR }, blockUtility));
		const displayResult = displayText(style.animation === "none" ? { TEXT: String(text ?? "") } : {
			ANIMATE: style.animation,
			TEXT: String(text ?? "")
		}, blockUtility);
		if (style.animation === "none") await Promise.resolve(displayResult);
		else Promise.resolve(displayResult).catch((error) => {
			console.error(new AssetManagerError("ANIMATION_FAILED", `Animated Text failed for asset "${name}": ${errorMessage(error)}`, {
				operation: "animateText",
				assetName: name,
				hint: "Check the Animated Text extension and animation value.",
				cause: error
			}));
		});
	}
	requireTemporaryVariables(operation = "setTextValue", assetName) {
		const temporaryVariables = this.runtime.ext_lmsTempVars2;
		if (!temporaryVariables?.getRuntimeVariable) throw new AssetManagerError("DEPENDENCY_MISSING", "Temporary Variables extension is not loaded.", {
			operation,
			assetName,
			hint: "Load the lmsTempVars2 extension before using runtime text assets."
		});
		return temporaryVariables;
	}
	setRuntimeVariable(name, value) {
		const assetName = name.split(":")[1];
		const temporaryVariables = this.requireTemporaryVariables("setRuntimeVariable", assetName);
		if (!temporaryVariables.setRuntimeVariable) throw new AssetManagerError("DEPENDENCY_MISSING", "Temporary Variables extension does not support setting runtime variables.", {
			operation: "setRuntimeVariable",
			assetName,
			hint: "Load a Temporary Variables version that provides setRuntimeVariable."
		});
		temporaryVariables.setRuntimeVariable({
			VAR: name,
			STRING: value
		});
	}
	requireAnimatedTextOpcode(opcode, assetName) {
		const implementation = this.runtime.getOpcodeFunction?.(opcode);
		if (!implementation) throw new AssetManagerError("DEPENDENCY_MISSING", `Animated Text extension is not loaded or does not provide ${opcode}.`, {
			operation: "show",
			assetName,
			hint: "Load a compatible Animated Text extension before showing text assets."
		});
		return implementation;
	}
	async ensureExternalSkin(name) {
		const asset = this.externalAssets.get(name);
		if (!asset) throw this.assetNotRegistered("show", name);
		return this.ensureExternalAssetSkin(asset, name);
	}
	async resolveProjectImageStorageAsset(name, costume) {
		if (costume.asset?.data) return costume.asset;
		const assetId = costume.assetId;
		const dataFormat = costume.dataFormat?.toLowerCase();
		const storage = this.runtime.storage;
		if (!assetId || !dataFormat || !storage) throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Project image bytes are unavailable for asset "${name}".`, {
			operation: "resolveDOMImageResource",
			assetName: name,
			hint: "Resolve the resource while its project costume and VM storage are available."
		});
		const cached = storage.get?.(assetId);
		if (cached?.data) return cached;
		const assetType = dataFormat === "svg" ? storage.AssetType.ImageVector : storage.AssetType.ImageBitmap;
		const loaded = await storage.load?.(assetType, assetId, dataFormat);
		if (!loaded?.data) throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Project image bytes are unavailable for asset "${name}".`, {
			operation: "resolveDOMImageResource",
			assetName: name,
			hint: "Keep the project asset available in VM storage until the resource is resolved."
		});
		return loaded;
	}
	cancelledDOMImageResolution(name) {
		const error = /* @__PURE__ */ new Error(`DOM image resource resolution was cancelled: ${JSON.stringify(name)}`);
		error.name = "AbortError";
		return error;
	}
	async resolveExtensionDOMImageResource(nameInput) {
		const name = normalizeName(nameInput);
		const version = this.domImageResourceVersions.get(name) ?? 0;
		let entry = this.domImageResourceBackings.get(name);
		if (entry?.version !== version) {
			let nextEntry;
			const promise = (async () => {
				const resolved = await this.resolveImageAssetBytes({ NAME: name });
				const backing = await createDOMImageResourceBacking({
					name,
					bytes: resolved.bytes,
					mimeType: resolved.mimeType
				}, (idleBacking) => {
					if (this.domImageResourceBackings.get(name) === nextEntry && nextEntry.backing === idleBacking) this.domImageResourceBackings.delete(name);
				});
				nextEntry.backing = backing;
				return backing;
			})();
			nextEntry = {
				version,
				promise
			};
			entry = nextEntry;
			this.domImageResourceBackings.set(name, entry);
			try {
				await promise;
			} catch (error) {
				if (this.domImageResourceBackings.get(name) === entry) this.domImageResourceBackings.delete(name);
				throw error;
			}
		}
		const backing = await entry.promise;
		let controller;
		const resource = backing.acquire(() => {
			if (controller) this.releaseActiveDOMImageResource(controller);
		});
		if ((this.domImageResourceVersions.get(name) ?? 0) !== version || !this.assetRegistry.has(name)) {
			resource.release();
			throw this.cancelledDOMImageResolution(name);
		}
		controller = {
			name,
			resource
		};
		this.activeDOMImageResources.add(controller);
		const named = this.activeDOMImageResourcesByName.get(name) ?? /* @__PURE__ */ new Set();
		named.add(controller);
		this.activeDOMImageResourcesByName.set(name, named);
		return resource;
	}
	releaseActiveDOMImageResource(controller) {
		this.activeDOMImageResources.delete(controller);
		const named = this.activeDOMImageResourcesByName.get(controller.name);
		named?.delete(controller);
		if (named?.size === 0) this.activeDOMImageResourcesByName.delete(controller.name);
	}
	invalidateDOMImageResources(name) {
		this.domImageResourceVersions.set(name, (this.domImageResourceVersions.get(name) ?? 0) + 1);
		this.domImageResourceBackings.delete(name);
		for (const controller of [...this.activeDOMImageResourcesByName.get(name) ?? []]) controller.resource.release();
	}
	releaseAllDOMImageResources() {
		const names = /* @__PURE__ */ new Set([...this.domImageResourceBackings.keys(), ...this.activeDOMImageResourcesByName.keys()]);
		for (const name of names) this.domImageResourceVersions.set(name, (this.domImageResourceVersions.get(name) ?? 0) + 1);
		this.domImageResourceBackings.clear();
		for (const controller of [...this.activeDOMImageResources]) controller.resource.release();
	}
	startListeningForDOMImageLifecycle() {
		if (this.listeningForDOMImageLifecycle || !this.runtime.on) return;
		this.listeningForDOMImageLifecycle = true;
		this.runtime.on("PROJECT_STOP_ALL", this.releaseAllDOMImageResourcesForLifecycle);
		this.runtime.on("PROJECT_LOADED", this.releaseAllDOMImageResourcesForLifecycle);
		this.runtime.on("RUNTIME_DISPOSED", this.releaseAllDOMImageResourcesForLifecycle);
	}
	stopListeningForDOMImageLifecycle() {
		if (!this.listeningForDOMImageLifecycle || !this.runtime.off) return;
		this.listeningForDOMImageLifecycle = false;
		this.runtime.off("PROJECT_STOP_ALL", this.releaseAllDOMImageResourcesForLifecycle);
		this.runtime.off("PROJECT_LOADED", this.releaseAllDOMImageResourcesForLifecycle);
		this.runtime.off("RUNTIME_DISPOSED", this.releaseAllDOMImageResourcesForLifecycle);
	}
	createNamedBodyProvider() {
		let providerReleased = false;
		const requireProvider = () => {
			if (providerReleased) throw new NamedDataError("NAMED_DATA_PROVIDER_RELEASED", "The named asset body provider has been released.");
		};
		return Object.freeze({
			namespace: NAMED_ASSET_BODY_NAMESPACE,
			kind: "asset",
			canResolve: (reference, representation) => !providerReleased && reference.namespace === "asset" && reference.kind === "asset" && reference.scope === "project" && representation === "raw",
			stat: async (reference, representation, context) => {
				requireProvider();
				const resolved = await this.resolveNamedBodySource(reference, representation, context);
				requireProvider();
				return resolved.metadata;
			},
			openBody: async (reference, representation, context) => {
				requireProvider();
				const lifecycleVersion = this.namedBodyLifecycleVersion;
				const { metadata, data } = await this.resolveNamedBodySource(reference, representation, context);
				requireProvider();
				if (this.namedBodyLifecycleVersion !== lifecycleVersion) throw namedBodyAbortError();
				throwIfNamedBodyAborted(context.signal);
				let body = new Uint8Array(data.slice(0));
				let released = false;
				let snapshot;
				const abortRelease = () => release("abort");
				const release = (reason) => {
					if (released) return;
					released = true;
					body = null;
					context.signal?.removeEventListener("abort", abortRelease);
					this.openNamedBodySnapshots.delete(snapshot);
				};
				snapshot = Object.freeze({
					...metadata,
					get body() {
						if (!body) throw new NamedDataError("NAMED_DATA_PROVIDER_RELEASED", "The named asset body snapshot has been released.");
						return body;
					},
					release
				});
				this.openNamedBodySnapshots.add(snapshot);
				context.signal?.addEventListener("abort", abortRelease, { once: true });
				if (context.signal?.aborted) {
					release("abort");
					throw namedBodyAbortError();
				}
				return snapshot;
			},
			clearSession: () => {
				this.releaseOpenNamedBodySnapshots();
			},
			release: (reason) => {
				if (providerReleased) return;
				providerReleased = true;
				this.releaseOpenNamedBodySnapshots();
				this.stopListeningForNamedBodyLifecycle();
			}
		});
	}
	async resolveNamedBodySource(referenceInput, representation, context) {
		throwIfNamedBodyAborted(context.signal);
		const reference = requireNamedAssetBodyReference(referenceInput);
		if (reference.scope !== "project" || context.project === void 0) throw new NamedDataError("NAMED_DATA_SCOPE_MISMATCH", "Named asset bodies require project scope and project context.");
		if (representation !== "raw") throw new NamedDataError("NAMED_DATA_REPRESENTATION_UNSUPPORTED", `Named assets cannot be rendered as ${representation}.`);
		const name = normalizeName(reference.name);
		await this.registrationCommits.get(name)?.catch(() => void 0);
		throwIfNamedBodyAborted(context.signal);
		const kind = this.assetRegistry.get(name);
		if (!kind) throw new NamedDataError("NAMED_DATA_NOT_FOUND", `No registered asset has the name ${JSON.stringify(name)}.`);
		if (kind !== "external") throw new NamedDataError("NAMED_DATA_REPRESENTATION_UNSUPPORTED", `Asset ${JSON.stringify(name)} is not backed by session memory.`);
		const asset = this.externalAssets.get(name);
		if (!asset) throw new NamedDataError("NAMED_DATA_NOT_FOUND", `No in-memory asset has the name ${JSON.stringify(name)}.`);
		return {
			metadata: Object.freeze({
				reference: Object.freeze({
					...reference,
					name
				}),
				nativeRepresentation: "raw",
				representation: "raw",
				mediaType: normalizeMimeType(asset.mimeType, asset.url || name),
				byteLength: asset.data.byteLength,
				digest: await sha256Digest(new Uint8Array(asset.data)),
				revision: String(this.successfulRegistrationVersions.get(name) ?? 0),
				replayable: true
			}),
			data: asset.data
		};
	}
	releaseOpenNamedBodySnapshots() {
		this.namedBodyLifecycleVersion += 1;
		for (const snapshot of [...this.openNamedBodySnapshots]) snapshot.release();
	}
	startListeningForNamedBodyLifecycle() {
		if (this.listeningForNamedBodyLifecycle || !this.runtime.on) return;
		this.listeningForNamedBodyLifecycle = true;
		this.runtime.on("PROJECT_STOP_ALL", this.releaseNamedBodySnapshotsForLifecycle);
		this.runtime.on("PROJECT_LOADED", this.releaseNamedBodySnapshotsForLifecycle);
		this.runtime.on("RUNTIME_DISPOSED", this.releaseNamedBodySnapshotsForLifecycle);
	}
	stopListeningForNamedBodyLifecycle() {
		if (!this.listeningForNamedBodyLifecycle || !this.runtime.off) return;
		this.listeningForNamedBodyLifecycle = false;
		this.runtime.off("PROJECT_STOP_ALL", this.releaseNamedBodySnapshotsForLifecycle);
		this.runtime.off("PROJECT_LOADED", this.releaseNamedBodySnapshotsForLifecycle);
		this.runtime.off("RUNTIME_DISPOSED", this.releaseNamedBodySnapshotsForLifecycle);
	}
	async ensureExternalAssetSkin(asset, name) {
		asset.mimeType = normalizeMimeType(asset.mimeType, asset.url || name);
		if (!asset.mimeType.startsWith("image/")) throw this.assetTypeMismatch("show", name, "image", `external/${this.externalMediaKind(asset)}`);
		if (asset.skinId !== null) return asset.skinId;
		const blob = new Blob([asset.data], { type: asset.mimeType });
		asset.skinId = asset.mimeType === "image/svg+xml" ? this.renderer.createSVGSkin(await blob.text()) : this.renderer.createBitmapSkin(await createImageBitmap(blob), asset.bitmapResolution ?? 1);
		return asset.skinId;
	}
	async resolveSkinFromAsset(name, kind, asset) {
		if (kind === "external" && asset.kind === "external") return {
			skinId: await this.ensureExternalAssetSkin(asset, name),
			sourceSize: null
		};
		if ((kind === "costume" || kind === "backdrop") && (asset.kind === "costume" || asset.kind === "backdrop")) {
			const { target, costume } = this.resolveCostumeAssetReference(name, asset);
			return {
				skinId: costume.skinId,
				sourceSize: target.isStage || !Number.isFinite(target.size) ? null : target.size
			};
		}
		throw this.assetTypeMismatch("show", name, "image", kind);
	}
	resolveCostumeReference(name) {
		const reference = this.costumeAssets.get(name);
		if (!reference) throw this.assetNotRegistered("show", name);
		return this.resolveCostumeAssetReference(name, reference);
	}
	resolveCostumeAssetReference(name, reference) {
		const target = this.resolveReferencedTarget(reference.targetId, reference.targetName, reference.isStage);
		const costume = this.findCostume(target, reference.costumeName, reference.assetId);
		if (!costume) {
			const candidates = suggestNames(reference.costumeName, (target.sprite?.costumes ?? []).map((candidate) => candidate.name));
			throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Costume no longer exists: ${reference.targetName}/${reference.costumeName}.`, {
				operation: "show",
				assetName: name,
				actorName: reference.targetName,
				candidates,
				hint: suggestionHint(candidates)
			});
		}
		if (typeof costume.skinId !== "number") throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Costume skin is not available: ${reference.targetName}/${reference.costumeName}.`, {
			operation: "show",
			assetName: name,
			actorName: reference.targetName,
			hint: "Wait for the project costume to finish loading and try again."
		});
		return {
			target,
			costume
		};
	}
	resolveSoundAssetReference(name) {
		const reference = this.soundAssets.get(name);
		if (!reference) throw this.assetNotRegistered("playSound", name);
		const target = this.resolveReferencedTarget(reference.targetId, reference.targetName, reference.isStage);
		const sound = this.findSound(target, reference.soundName, reference.assetId);
		if (!sound) {
			const candidates = suggestNames(reference.soundName, (target.sprite?.sounds ?? []).map((candidate) => candidate.name));
			throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Sound no longer exists: ${reference.targetName}/${reference.soundName}.`, {
				operation: "playSound",
				assetName: name,
				actorName: reference.targetName,
				candidates,
				hint: suggestionHint(candidates)
			});
		}
		return {
			target,
			sound
		};
	}
	resolveSoundReference(name) {
		const { target, sound } = this.resolveSoundAssetReference(name);
		if (!sound.soundId) throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Sound ID is not available: ${target.sprite?.name ?? target.id}/${sound.name}.`, {
			operation: "playSound",
			assetName: name,
			actorName: target.sprite?.name ?? target.id,
			hint: "Wait for the project sound to finish loading and try again."
		});
		const soundBank = target.sprite?.soundBank;
		if (!soundBank) throw new AssetManagerError("DEPENDENCY_MISSING", `Sound bank is not available: ${target.sprite?.name ?? target.id}.`, {
			operation: "playSound",
			assetName: name,
			actorName: target.sprite?.name ?? target.id,
			hint: "Use a TurboWarp runtime with sound support."
		});
		return {
			target,
			sound,
			soundBank
		};
	}
	deleteOwnedSkinIfExists(asset) {
		if (!asset || asset.skinId === null) return;
		try {
			this.renderer.destroySkin(asset.skinId);
		} catch (error) {
			console.warn("Failed to destroy skin", error);
		}
		asset.skinId = null;
	}
	applySkinToTarget(target, skin) {
		if (target.drawableID === void 0 || target.drawableID === null) throw new AssetManagerError("SPRITE_NOT_FOUND", `Target drawable not found: ${target.sprite?.name ?? "unknown"}.`, {
			operation: "show",
			actorName: target.sprite?.name ?? target.id,
			hint: "Use a live target with an initialized renderer drawable."
		});
		this.renderer.updateDrawableSkinId(target.drawableID, skin.skinId);
		if (!target.isStage && target.isOriginal && skin.sourceSize !== null && target.size !== skin.sourceSize) target.setSize(skin.sourceSize);
		target.emitVisualChange?.();
		this.runtime.requestRedraw?.();
	}
	async playResolvedSound(value, waitUntilDone) {
		const name = normalizeName(value);
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("playSound", name);
		if (kind === "external") {
			await this.playExternalSound(name, waitUntilDone);
			return;
		}
		if (kind === "sound") {
			await this.playProjectSound(name, waitUntilDone);
			return;
		}
		throw this.assetTypeMismatch("playSound", name, "audio", kind);
	}
	async resolveAudioBytes(name) {
		const kind = this.assetRegistry.get(name);
		if (!kind) throw this.assetNotRegistered("createAudioVoice", name);
		if (kind === "external") {
			const asset = this.externalAssets.get(name);
			if (!asset) throw this.assetNotRegistered("createAudioVoice", name);
			asset.mimeType = normalizeMimeType(asset.mimeType, asset.url || name);
			if (!asset.mimeType.startsWith("audio/")) throw this.assetTypeMismatch("createAudioVoice", name, "audio", `external/${this.externalMediaKind(asset)}`);
			return {
				bytes: asset.data,
				mimeType: asset.mimeType
			};
		}
		if (kind !== "sound") throw this.assetTypeMismatch("createAudioVoice", name, "audio", kind);
		const { target, sound } = this.resolveSoundAssetReference(name);
		const assetId = sound.assetId;
		const dataFormat = sound.dataFormat;
		const storage = this.runtime.storage;
		let asset = sound.asset ?? (assetId ? storage?.get?.(assetId) : null);
		if (!asset && assetId && dataFormat && storage?.load && storage.AssetType.Sound !== void 0) try {
			asset = await storage.load(storage.AssetType.Sound, assetId, dataFormat);
		} catch (error) {
			throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Sound bytes could not be loaded: ${target.sprite?.name ?? target.id}/${sound.name}.`, {
				operation: "createAudioVoice",
				assetName: name,
				actorName: target.sprite?.name ?? target.id,
				hint: "Wait for the project sound to finish loading and try again.",
				cause: error
			});
		}
		if (!asset?.data) throw new AssetManagerError("SOURCE_ASSET_NOT_FOUND", `Sound bytes are not available: ${target.sprite?.name ?? target.id}/${sound.name}.`, {
			operation: "createAudioVoice",
			assetName: name,
			actorName: target.sprite?.name ?? target.id,
			hint: "Use a TurboWarp runtime that retains or can reload project sound assets."
		});
		return {
			bytes: asset.data,
			mimeType: this.projectAssetMimeType(dataFormat, "audio")
		};
	}
	startBrowserAudioVoice(name, bytes, mimeType, initialGain, operation) {
		const blobBytes = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
		const url = URL.createObjectURL(new Blob([blobBytes], { type: mimeType }));
		const controller = this.prepareBrowserAudio(name, url, { gain: initialGain }, () => URL.revokeObjectURL(url), operation);
		let active = true;
		const stop = () => {
			if (!active) return;
			active = false;
			controller.dispose();
		};
		const started = controller.play();
		const ended = controller.ended.then(() => stop(), (error) => {
			stop();
			if (operation === "createAudioVoice") throw error;
		});
		ended.catch(() => {});
		return {
			voice: Object.freeze({
				ended,
				setGain(value) {
					const gain = normalizeAudioVoiceGain(value);
					if (active) controller.setGain(gain);
				},
				stop
			}),
			started: started.catch((error) => {
				const legacyStop = operation === "playSound" && !active && error instanceof Error && error.name === "AbortError";
				stop();
				if (!legacyStop) throw error;
			})
		};
	}
	async playExternalSound(name, waitUntilDone) {
		const asset = this.externalAssets.get(name);
		if (!asset) throw this.assetNotRegistered("playSound", name);
		asset.mimeType = normalizeMimeType(asset.mimeType, asset.url || name);
		if (!asset.mimeType.startsWith("audio/")) throw this.assetTypeMismatch("playSound", name, "audio", `external/${this.externalMediaKind(asset)}`);
		const playback = this.startBrowserAudioVoice(name, asset.data, asset.mimeType, 1, "playSound");
		if (!waitUntilDone) {
			playback.started.catch((error) => console.error(error));
			return;
		}
		await playback.started;
		await playback.voice.ended;
	}
	stopExternalAudio(audio) {
		const stopVoice = this.audioVoiceStops.get(audio);
		if (stopVoice) {
			stopVoice();
			return;
		}
		try {
			audio.pause();
			audio.currentTime = 0;
			audio.dispatchEvent(new Event("ended"));
		} catch {} finally {
			this.playingAudio.delete(audio);
		}
	}
	async playProjectSound(name, waitUntilDone) {
		const { target, sound, soundBank } = this.resolveSoundReference(name);
		const playResult = soundBank.playSound(target, sound.soundId);
		const playPromise = Promise.resolve(playResult);
		if (!waitUntilDone) {
			playPromise.catch((error) => console.error(this.playbackError(name, error)));
			return;
		}
		try {
			await playPromise;
		} catch (error) {
			throw this.playbackError(name, error);
		}
	}
	playbackError(name, cause, operation = "playSound") {
		return new AssetManagerError("PLAYBACK_FAILED", `Failed to play audio asset "${name}": ${errorMessage(cause)}`, {
			operation,
			assetName: name,
			hint: "Check browser audio permissions and the registered audio resource.",
			cause
		});
	}
	projectAssetMimeType(dataFormat, kind) {
		if (dataFormat) {
			const guessed = guessMimeType(`asset.${dataFormat}`);
			if (guessed !== "application/octet-stream") return guessed;
		}
		return kind === "image" ? "image/x-scratch-costume" : "audio/x-scratch-sound";
	}
};
//#endregion
//#region src/animation.ts
/**
* Asset Cache with actor-level background asset animation.
*
* ACTOR is resolved from a clone-local actorName variable before falling back
* to the existing named-sprite behaviour of setSpriteSkin.
* ASSETS and DURATIONS are comma-separated strings. ASSETS contains registered
* image or audio asset names. Each duration is the interval before the next
* action, and a zero groups those adjacent actions. Loop has one interval per
* action; sequence omits the final interval. COSTUMES remains accepted as a
* compatibility alias for projects saved with the earlier block.
*/
var AnimatedAssetManagerExtension = class extends AssetManagerExtension {
	constructor(featureFlags = FEATURE_FLAGS) {
		super(featureFlags);
		_defineProperty(this, "actorAnimations", /* @__PURE__ */ new Map());
		_defineProperty(this, "animationGeneration", 0);
		const stopAll = () => this.stopAllActorAnimations();
		const stopTarget = (target) => {
			if (target) this.stopTarget(target);
		};
		Scratch.vm.runtime.on?.("PROJECT_STOP_ALL", stopAll);
		Scratch.vm.runtime.on?.("PROJECT_START", stopAll);
		Scratch.vm.runtime.on?.("STOP_FOR_TARGET", stopTarget);
		Scratch.vm.runtime.on?.("RUNTIME_DISPOSED", stopAll);
	}
	async setThisSpriteSkin(args, util) {
		this.stopTarget(util.target);
		await super.setThisSpriteSkin(args, util);
	}
	async setSpriteSkin(args, util) {
		const actor = this.requireActorName(args.ACTOR ?? args.SPRITE);
		const target = this.resolveActorTarget(actor, util);
		this.stopActor(actor);
		await this.applyAssetToTarget(target, args.NAME, util);
	}
	startActorLoop(args, util) {
		const actor = this.requireActorName(args.ACTOR);
		const target = this.resolveActorTarget(actor, util);
		const assets = this.getAnimationAssetsInput(args);
		if (!assets.text) {
			if (normalizeName(args.DURATIONS)) throw new Error(`DURATIONS must be empty when ${assets.argumentName} is empty.`);
			this.stopActor(actor);
			return;
		}
		this.startActorAnimation(actor, target, this.parseAnimation(assets.text, args.DURATIONS, assets.argumentName, "loop"));
	}
	startActorSequence(args, util) {
		const actor = this.requireActorName(args.ACTOR);
		const target = this.resolveActorTarget(actor, util);
		const assets = this.getAnimationAssetsInput(args);
		if (!assets.text) throw new Error(`${assets.argumentName} is empty.`);
		this.startActorAnimation(actor, target, this.parseAnimation(assets.text, args.DURATIONS, assets.argumentName, "sequence"));
	}
	stopActorAnimation(args, util) {
		const actor = this.requireActorName(args.ACTOR);
		this.resolveActorTarget(actor, util);
		this.stopActor(actor);
	}
	async finishAllActorSequences() {
		const pending = [];
		for (const [actor, state] of [...this.actorAnimations]) {
			if (state.mode !== "sequence") continue;
			const finalImage = [...state.actions].reverse().find((action) => action.kind === "image");
			this.stopActor(actor);
			if (!finalImage || !this.runtime.targets.includes(state.target)) continue;
			pending.push(this.resolveSkin(finalImage.assetName).then((skin) => {
				if (this.runtime.targets.includes(state.target)) this.applyResolvedSkinToTarget(state.target, finalImage.assetName, skin);
			}));
		}
		await Promise.all(pending);
	}
	deleteAllMemoryAssets() {
		this.stopAllActorAnimations();
		super.deleteAllMemoryAssets();
	}
	getAnimationAssetsInput(args) {
		if (args.ASSETS !== void 0) return {
			text: normalizeName(args.ASSETS),
			argumentName: "ASSETS"
		};
		return {
			text: normalizeName(args.COSTUMES),
			argumentName: "COSTUMES"
		};
	}
	requireActorName(value) {
		const actor = normalizeName(value);
		if (!actor) throw new AssetManagerError("SPRITE_NOT_FOUND", "Actor name is empty.", {
			operation: "resolveActor",
			actorName: actor,
			hint: "Provide the name of a project sprite or actor clone."
		});
		return actor;
	}
	actorNameOf(target) {
		return normalizeName(target.lookupVariableByNameAndType?.("actorName", "")?.value);
	}
	resolveActorTarget(actor, util) {
		const invokingTarget = util?.target;
		if (invokingTarget && !invokingTarget.isStage && (this.actorNameOf(invokingTarget) === actor || invokingTarget.sprite?.name === actor)) return invokingTarget;
		const actorNameMatches = this.runtime.targets.filter((target) => !target.isStage && this.actorNameOf(target) === actor);
		const matches = actorNameMatches.length > 0 ? actorNameMatches : this.runtime.targets.filter((target) => !target.isStage && target.sprite?.name === actor);
		if (matches.length > 1) throw new AssetManagerError("SPRITE_NAME_AMBIGUOUS", `Actor name is not unique: ${actor}.`, {
			operation: "resolveActor",
			actorName: actor,
			hint: "Give every actor target a unique name."
		});
		const target = matches[0] ?? this.findTargetByName(actor);
		if (!target) {
			const candidates = suggestNames(actor, [...new Set(this.runtime.targets.flatMap((candidate) => {
				if (candidate.isStage) return [];
				return [this.actorNameOf(candidate), candidate.sprite?.name ?? ""].filter(Boolean);
			}))]);
			throw new AssetManagerError("SPRITE_NOT_FOUND", `Actor not found: ${actor}.`, {
				operation: "resolveActor",
				actorName: actor,
				candidates,
				hint: suggestionHint(candidates)
			});
		}
		return target;
	}
	parseAnimation(assetsValue, durationsValue, argumentName, mode) {
		const assetNames = String(assetsValue ?? "").split(",").map((value) => value.trim());
		const durationsText = normalizeName(durationsValue);
		const durationTexts = durationsText ? durationsText.split(",").map((value) => value.trim()) : [];
		if (assetNames.some((name) => !name)) throw new Error(`${argumentName} contains an empty item.`);
		if (durationTexts.some((duration) => !duration)) throw new Error("DURATIONS contains an empty item.");
		const expectedDurationCount = mode === "loop" ? assetNames.length : assetNames.length - 1;
		if (durationTexts.length !== expectedDurationCount) throw new Error(`${mode} requires ${expectedDurationCount} DURATIONS items for ${assetNames.length} ${argumentName} items, but received ${durationTexts.length}.`);
		const intervalsMs = durationTexts.map((duration, index) => {
			const seconds = Number(duration);
			if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`DURATIONS item ${index + 1} must be a non-negative number: ${duration}`);
			return seconds * 1e3;
		});
		if (mode === "loop" && !intervalsMs.some((durationMs) => durationMs > 0)) throw new Error("DURATIONS for loop must contain at least one positive number.");
		return {
			actions: assetNames.map((assetName) => this.createAnimationAction(assetName)),
			intervalsMs,
			mode
		};
	}
	startActorAnimation(actor, target, definition) {
		this.stopActor(actor);
		const state = {
			...definition,
			actor,
			target,
			actionIndex: 0,
			deadline: performance.now(),
			timer: null,
			generation: ++this.animationGeneration
		};
		this.actorAnimations.set(actor, state);
		this.showCurrentStep(actor, state);
	}
	createAnimationAction(assetName) {
		if (!this.isLoaded({ NAME: assetName })) throw this.assetNotRegistered("animate", assetName);
		const mimeType = this.getAssetMimeType({ NAME: assetName });
		if (mimeType.startsWith("image/")) return {
			assetName,
			kind: "image"
		};
		if (mimeType.startsWith("audio/")) return {
			assetName,
			kind: "audio"
		};
		throw this.assetTypeMismatch("animate", assetName, "image or audio", mimeType || "unknown MIME type");
	}
	async showCurrentStep(actor, state) {
		if (!this.isCurrent(actor, state)) return;
		const target = state.target;
		if (!this.runtime.targets.includes(target)) {
			this.stopActor(actor);
			return;
		}
		const batch = this.getCurrentBatch(state);
		if (!batch) {
			this.stopActor(actor);
			return;
		}
		try {
			let selectedImageIndex = -1;
			for (let index = 0; index < batch.actions.length; index += 1) if (batch.actions[index]?.kind === "image") selectedImageIndex = index;
			const selectedImage = batch.actions[selectedImageIndex];
			const selectedSkin = await (selectedImage ? this.resolveSkin(selectedImage.assetName) : Promise.resolve(null));
			if (!this.isCurrent(actor, state)) return;
			if (!this.runtime.targets.includes(target)) {
				this.stopActor(actor);
				return;
			}
			const soundStarts = [];
			for (let index = 0; index < batch.actions.length; index += 1) {
				const action = batch.actions[index];
				if (!action) continue;
				if (action.kind === "audio") soundStarts.push(this.playResolvedSound(action.assetName, false));
				else if (index === selectedImageIndex && selectedSkin) this.applyResolvedSkinToTarget(target, action.assetName, selectedSkin);
			}
			await Promise.all(soundStarts);
		} catch (error) {
			this.stopActor(actor);
			const assetNames = batch.actions.map((action) => action.assetName).join(", ");
			console.error(new AssetManagerError("ANIMATION_FAILED", `Failed to run actor "${target.sprite?.name ?? target.id}" actions "${assetNames}": ${errorMessage(error)}`, {
				operation: "animateActor",
				actorName: target.sprite?.name ?? target.id,
				hint: "Check that every animation asset is still registered and usable.",
				cause: error
			}));
			return;
		}
		if (!this.isCurrent(actor, state)) return;
		const intervalMs = batch.intervalMs;
		const nextActionIndex = batch.nextActionIndex;
		if (intervalMs === null || nextActionIndex === null) {
			this.actorAnimations.delete(actor);
			return;
		}
		state.deadline += intervalMs;
		const now = performance.now();
		if (state.deadline <= now) state.deadline = now + intervalMs;
		const delay = state.deadline - now;
		state.timer = setTimeout(() => this.advance(actor, state, nextActionIndex), delay);
	}
	getCurrentBatch(state) {
		if (!state.actions[state.actionIndex]) return null;
		const actions = [];
		let actionIndex = state.actionIndex;
		for (let count = 0; count < state.actions.length; count += 1) {
			const action = state.actions[actionIndex];
			if (!action) return null;
			actions.push(action);
			const intervalMs = state.intervalsMs[actionIndex];
			if (intervalMs === void 0) return {
				actions,
				intervalMs: null,
				nextActionIndex: null
			};
			const nextActionIndex = (actionIndex + 1) % state.actions.length;
			if (intervalMs > 0) return {
				actions,
				intervalMs,
				nextActionIndex
			};
			actionIndex = nextActionIndex;
		}
		return null;
	}
	advance(actor, state, nextActionIndex) {
		if (!this.isCurrent(actor, state)) return;
		state.timer = null;
		state.actionIndex = nextActionIndex;
		this.showCurrentStep(actor, state);
	}
	isCurrent(actor, state) {
		return this.actorAnimations.get(actor)?.generation === state.generation;
	}
	stopActor(actor) {
		const state = this.actorAnimations.get(actor);
		if (!state) return;
		this.actorAnimations.delete(actor);
		if (state.timer !== null) clearTimeout(state.timer);
	}
	stopTarget(target) {
		for (const [actor, state] of this.actorAnimations) if (state.target === target) this.stopActor(actor);
	}
	stopAllActorAnimations() {
		for (const actor of [...this.actorAnimations.keys()]) this.stopActor(actor);
	}
};
//#endregion
//#region src/index.ts
if (extensionConfig.unsandboxed === "required" && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
Scratch.extensions.register(new AnimatedAssetManagerExtension());
//#endregion

})(Scratch);
