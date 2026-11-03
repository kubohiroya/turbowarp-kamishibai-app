import {validateKamishibaiEmbeddedYamlRoot} from './embedded-yaml-root-validation.js';
import {createKamishibaiGraphDocumentProvider} from './embedded-yaml-graph-provider.js';
import {
  createProjectRepresentationAdapter,
  canPatchProjectRepresentations,
} from '@kubohiroya/turbowarp-document-data/project-views';
import {
  buildKamishibaiDocumentViewCandidate,
  buildKamishibaiDocumentPreview,
  buildKamishibaiDocumentPreviewArtifact,
} from './embedded-yaml-project-views.js';
import {activeKamishibaiDocumentView} from './embedded-yaml-view-state.js';
import {documentViewsEnabledAtStartup} from './embedded-yaml-feature-flags.js';
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {type DocumentSourceVM} from '@kubohiroya/turbowarp-document-source';
import {getDocumentSourceRegistry} from '@kubohiroya/turbowarp-document-data/document-source';
import {
  createKamishibaiDocumentSourceOwnerOptions,
  documentSourceEnabledAtStartup,
} from './document-source.js';
import type {
  SourceDocumentAdapter,
  SourceDocumentPrepared,
  SourceDocumentProvider,
  SourceDocumentSnapshot,
} from '@kubohiroya/turbowarp-document-data/composition';
import schema from '../../schema/dsl-4.schema.json' with {type: 'json'};
import editorSchema from '../../schema/dsl-4-editor.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from './production-source-frontend.js';
import {createDsl4EmbeddedSourceDescriptor} from './source-descriptor.js';
import {
  createDsl4RuntimeArtifactDescriptor,
  type RuntimeArtifact,
  type RuntimeArtifactSuccess,
} from './runtime-artifact-descriptor.js';
import {loadDsl4RuntimeComponent} from './runtime-artifact-loader.js';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
} from './block-source-shared.js';
import {dsl4StandardProductionFeatureFlags} from './feature-flags.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
import {
  kamishibaiEmbeddedYamlProviderId,
  kamishibaiEmbeddedYamlDocumentId,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
} from './embedded-yaml-identity.js';

type JsonObject = Record<string, unknown>;
type SourceDescriptor = Awaited<ReturnType<typeof createDsl4EmbeddedSourceDescriptor>>;
interface Component extends JsonObject {
  source: SourceDescriptor;
  artifact: RuntimeArtifact;
}
interface Target {
  isOriginal?: boolean;
}
interface Runtime {
  targets?: Target[];
  extensionStorage?: JsonObject;
  emitProjectChanged(): void;
  on?(event: string, listener: () => void): void;
  off?(event: string, listener: () => void): void;
}
interface Vm {
  runtime: Runtime;
  toJSON(targetId?: string, options?: {allowOptimization?: boolean}): string;
  stopAll?(): void;
  saveProjectSb3?(): Promise<unknown>;
  loadProject?(bytes: Uint8Array): Promise<unknown>;
}
const BUNDLE = 'kubohiroyakamishibai4';
const COMPONENT = 'kubohiroyakamishibairuntime4';
const limits = Object.freeze({
  maxSourceBytes: 1024 * 1024,
  maxAssetFiles: 4096,
  maxTotalAssetBytes: 128 * 1024 * 1024,
});
const record = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const originalTargets = (runtime: Runtime) =>
  (runtime.targets ?? []).filter((target) => target.isOriginal !== false);
const sameTargets = (expected: Target[], runtime: Runtime) => {
  const current = originalTargets(runtime);
  return (
    expected.length === current.length &&
    expected.every((target, index) => target === current[index])
  );
};
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => freeze(item));
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
const error = (code: string, message: string, diagnostics?: unknown) =>
  Object.assign(new Error(message), {code, ...(diagnostics ? {diagnostics} : {})});
function invalid(result: {diagnostics?: readonly {code?: string; message?: string}[]}) {
  const first = result.diagnostics?.[0];
  return error(
    first?.code || 'YAML_INVALID',
    first?.message || 'The embedded YAML story is invalid.',
    result.diagnostics,
  );
}
const filename = (component: Component) =>
  typeof component.source.displayName === 'string' && component.source.displayName
    ? component.source.displayName
    : 'story.k4.yml';

function locate(project: JsonObject, frontend: Dsl4SourceFrontend) {
  validateKamishibaiEmbeddedYamlRoot(project);
  if (!Array.isArray(project.targets))
    throw error('PROJECT_INVALID', 'The project is unavailable.');
  const blockStory = project.targets.some(
    (target) =>
      record(target) &&
      record(target.blocks) &&
      Object.values(target.blocks).some(
        (block) =>
          record(block) &&
          typeof block.opcode === 'string' &&
          (block.opcode === dsl4LabeledBlockSourceHatOpcode ||
            block.opcode === dsl4ConfigBlockSourceHatOpcode ||
            block.opcode.endsWith('whenDsl4Source')),
      ),
  );
  if (blockStory)
    throw error(
      'BLOCK_SOURCE',
      'This story is authored with blocks. Edit its story blocks instead.',
    );
  const storage = record(project.extensionStorage) ? project.extensionStorage : {};
  const bundle = record(storage[BUNDLE]) ? storage[BUNDLE] : {};
  const components = record(bundle.components) ? bundle.components : {};
  const bundled = components[COMPONENT];
  const direct = storage[COMPONENT];
  if (bundled !== undefined && direct !== undefined)
    throw error('AMBIGUOUS_SOURCE', 'The project contains two runtime component channels.');
  const component = bundled ?? direct;
  if (!record(component))
    throw error('NO_EMBEDDED_YAML', 'This project has no embedded YAML story.');
  if (component.compiled !== undefined)
    throw error('COMPILED_SOURCE', 'Compiled stories do not provide editable source YAML.');
  if (!record(component.application) || component.application.mode !== 'story')
    throw error(
      'MENU_SOURCE',
      'This project opens an external story; its embedded YAML is only a startup menu.',
    );
  if (
    !record(component.source) ||
    component.source.mode !== 'embedded' ||
    typeof component.source.text !== 'string'
  )
    throw error('NO_EMBEDDED_YAML', 'This project has no embedded YAML story.');
  if (!record(component.assets) || component.assets.formatVersion !== 1)
    throw error('ASSET_FORMAT', 'This asset storage format cannot be edited here.');
  const parsed = frontend.parse(component.source.text, {
    sourceId: component.source.sourceId as string,
  });
  if (!parsed.ok) throw invalid(parsed);
  return {
    component: component as Component,
    channel: bundled !== undefined ? ('bundled' as const) : ('unbundled' as const),
  };
}

/** Build and validate a replacement in a caller-owned project copy, with no VM writes. */
async function buildSourceReplacement(
  project: JsonObject,
  sourceText: string,
  frontend: Dsl4SourceFrontend,
) {
  if (typeof sourceText !== 'string') throw error('YAML_INVALID', 'The YAML source must be text.');
  const original = await loadDsl4RuntimeComponent(project, frontend, limits);
  if (!original.ok) throw invalid(original);
  const {component: previous, channel} = locate(project, frontend);
  if (sourceText === previous.source.text) return {project, component: previous};
  if (previous.source.sourceOrigins !== undefined || previous.assetDistribution !== undefined)
    throw error(
      'SOURCE_METADATA',
      'This story has source provenance or distribution metadata. Edit its source project to preserve that metadata.',
    );
  const source = await createDsl4EmbeddedSourceDescriptor(sourceText, {
    sourceId: previous.source.sourceId,
    displayName: previous.source.displayName,
    ...(previous.source.cacheIdentity ? {cacheIdentity: previous.source.cacheIdentity} : {}),
    maxSourceBytes: limits.maxSourceBytes,
  });
  const parsed = frontend.parse(source.text, {sourceId: source.sourceId});
  if (!parsed.ok) throw invalid(parsed);
  const artifact = await createDsl4RuntimeArtifactDescriptor(
    parsed.storyDocument,
    source,
    previous.artifact.controlProfile,
    limits,
  );
  if (!artifact.ok) throw invalid(artifact);
  const component = {
    ...previous,
    source,
    artifact: (artifact as unknown as RuntimeArtifactSuccess).artifact,
  };
  const storage = project.extensionStorage as JsonObject;
  const parent =
    channel === 'bundled' ? (storage[BUNDLE] as {components: JsonObject}).components : storage;
  parent[COMPONENT] = component;
  const validation = await loadDsl4RuntimeComponent(project, frontend, limits);
  if (!validation.ok) throw invalid(validation);
  return {project, component};
}

/** UI metadata never serializes embedded extension code, assets or the block workspace. */
function createMetadataReader(vm: Vm, frontend: Dsl4SourceFrontend) {
  const runtime = vm.runtime;
  let cachedText: unknown,
    cachedId: unknown,
    cachedResult: ReturnType<Dsl4SourceFrontend['parse']> | undefined;
  const cachedFrontend: Dsl4SourceFrontend = {
    ...frontend,
    parse(source, options) {
      const id = options?.sourceId;
      if (source !== cachedText || id !== cachedId || !cachedResult) {
        cachedText = source;
        cachedId = id;
        cachedResult = frontend.parse(source, options);
      }
      return cachedResult;
    },
  };
  return () => {
    try {
      if (vm.runtime !== runtime) throw error('PROJECT_CONFLICT', 'The project changed.');
      // Enumerable keys are the serialized namespaces; static bundles add nonenumerable aliases.
      const storage = Object.fromEntries(Object.entries(runtime.extensionStorage ?? {}));
      const project = {targets: [], extensionStorage: storage};
      const current = locate(project, cachedFrontend);
      return {
        available: true,
        filename: filename(current.component),
        activeRepresentation: activeKamishibaiDocumentView(project)?.activeKind ?? 'source',
      };
    } catch (exception) {
      const failure = exception as Error & {code?: string};
      return {
        available: false,
        ...(failure.code ? {code: failure.code} : {}),
        reason: failure.message,
      };
    }
  };
}

/** The App owns the one canonical source and validates every atomic replacement. */
function createDocument(vm: Vm, frontend: Dsl4SourceFrontend) {
  const runtime = vm.runtime;
  const metadata = createMetadataReader(vm, frontend);
  let generation = 0;
  let disposed = false;
  const loaded = () => {
    generation++;
  };
  runtime.on?.('PROJECT_LOADED', loaded);
  runtime.on?.('RUNTIME_DISPOSED', loaded);
  const read = () => {
    if (disposed) throw error('DOCUMENT_DISPOSED', 'This editing session has ended.');
    if (vm.runtime !== runtime)
      throw error('PROJECT_CONFLICT', 'The project changed. Open the YAML again.');
    const fingerprint = vm.toJSON(undefined, {allowOptimization: false});
    const project = JSON.parse(fingerprint) as JsonObject;
    return {fingerprint, ...locate(project, frontend)};
  };
  const liveSlot = (channel: 'bundled' | 'unbundled') => {
    const storage = runtime.extensionStorage;
    const bundle = channel === 'bundled' ? storage?.[BUNDLE] : null;
    const parent =
      channel === 'bundled' ? (record(bundle) ? bundle.components : undefined) : storage;
    const descriptor = record(parent)
      ? Object.getOwnPropertyDescriptor(parent, COMPONENT)
      : undefined;
    if (
      !record(parent) ||
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      descriptor.writable !== true
    )
      throw error('COMPONENT_UNAVAILABLE', 'The runtime component cannot be saved safely.');
    return {storage, bundle, parent, component: descriptor.value as unknown, descriptor};
  };
  type Saved = Omit<ReturnType<typeof read>, 'component'> &
    Omit<ReturnType<typeof liveSlot>, 'component'> & {
      liveComponent: unknown;
      generation: number;
      targets: Target[];
    };
  const snapshots = new WeakMap<SourceDocumentSnapshot, Saved>();
  const candidates = new WeakMap<
    SourceDocumentPrepared,
    {snapshot: SourceDocumentSnapshot; component: Component; changed: boolean}
  >();
  const baseline = (snapshot: SourceDocumentSnapshot) => {
    const saved = snapshots.get(snapshot);
    if (!saved) throw error('DOCUMENT_CONFLICT', 'Open the embedded YAML before editing it.');
    if (disposed) throw error('DOCUMENT_DISPOSED', 'This editing session has ended.');
    if (vm.runtime !== runtime)
      throw error('PROJECT_CONFLICT', 'The project changed. Open the YAML again.');
    const fingerprint = vm.toJSON(undefined, {allowOptimization: false});
    const live = liveSlot(saved.channel);
    if (
      saved.generation !== generation ||
      !sameTargets(saved.targets, runtime) ||
      saved.fingerprint !== fingerprint ||
      saved.storage !== live.storage ||
      saved.bundle !== live.bundle ||
      saved.parent !== live.parent ||
      saved.liveComponent !== live.component
    )
      throw error(
        'PROJECT_CONFLICT',
        'The project changed. Open the YAML again before applying it.',
      );
    return {saved, live};
  };
  return Object.freeze({
    inspect() {
      return metadata();
    },
    capture() {
      const current = read();
      const live = liveSlot(current.channel);
      if (JSON.stringify(live.component) !== JSON.stringify(current.component))
        throw error('PROJECT_CONFLICT', 'The project changed while opening YAML.');
      const snapshot = freeze({
        source: current.component.source.text,
        sourceName: filename(current.component),
        componentId: COMPONENT,
      });
      snapshots.set(snapshot, {
        fingerprint: current.fingerprint,
        channel: current.channel,
        ...live,
        liveComponent: live.component,
        generation,
        targets: originalTargets(runtime),
      });
      return snapshot;
    },
    async prepare(snapshot: SourceDocumentSnapshot, sourceText: string) {
      const {saved} = baseline(snapshot);
      const built = await buildSourceReplacement(
        JSON.parse(saved.fingerprint) as JsonObject,
        sourceText,
        frontend,
      );
      baseline(snapshot);
      const prepared = freeze({source: built.component.source.text});
      candidates.set(prepared, {
        snapshot,
        component: built.component,
        changed: prepared.source !== snapshot.source,
      });
      return prepared;
    },
    async commit(snapshot: SourceDocumentSnapshot, prepared: SourceDocumentPrepared) {
      const candidate = candidates.get(prepared);
      if (!candidate || candidate.snapshot !== snapshot)
        throw error('DOCUMENT_CONFLICT', 'Validate this editing session before applying it.');
      const {live} = baseline(snapshot);
      if (!candidate.changed) {
        candidates.delete(prepared);
        return {source: prepared.source};
      }
      Object.defineProperty(live.parent, COMPONENT, {
        ...live.descriptor,
        value: {
          ...(live.component as Component),
          source: copy(candidate.component.source),
          artifact: copy(candidate.component.artifact),
        },
      });
      candidates.delete(prepared);
      snapshots.delete(snapshot);
      try {
        runtime.emitProjectChanged();
      } catch {
        /* Observer failure cannot undo a committed document. */
      }
      return {source: prepared.source};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      runtime.off?.('PROJECT_LOADED', loaded);
      runtime.off?.('RUNTIME_DISPOSED', loaded);
    },
  });
}

const defaultSourceFrontend = () =>
  createDsl4ProductionSourceFrontend(schema, {
    runtimeStateExpressionsEnabled: dsl4StandardProductionFeatureFlags.dsl4ExpressionRuntimeState,
    narrativeControlEnabled: dsl4StandardProductionFeatureFlags.dsl4NarrativeControl,
  });

/** Validate a document source and rewrite the owner component in the caller's project copy. */
export async function buildKamishibaiDocumentSourceProject(
  project: Record<string, unknown>,
  source: string,
  sourceFrontend?: Dsl4SourceFrontend,
): Promise<{project: Record<string, unknown>; component: {source: {text: string}}}> {
  return buildSourceReplacement(
    project as JsonObject,
    source,
    sourceFrontend ?? defaultSourceFrontend(),
  );
}

export interface KamishibaiEmbeddedYamlProviderOptions {
  readonly sourceFrontend?: Dsl4SourceFrontend;
  readonly documentViewsEnabled?: boolean;
  readonly documentSourceEnabled?: boolean;
  /** The host's own network capability, used only for explicit Editor source requests. */
  readonly fetch?: typeof globalThis.fetch | undefined;
}

/** Register this provider with the shared VM registry; the Editor need not import the App. */
function createSingleFileKamishibaiEmbeddedYamlProvider(
  vmInput: unknown,
  options: KamishibaiEmbeddedYamlProviderOptions = {},
): SourceDocumentProvider {
  if (
    !record(vmInput) ||
    !record(vmInput.runtime) ||
    typeof vmInput.toJSON !== 'function' ||
    typeof vmInput.runtime.emitProjectChanged !== 'function'
  )
    throw error('VM_UNAVAILABLE', 'The Editor VM is unavailable.');
  const vm = vmInput as unknown as Vm;
  const frontend = options.sourceFrontend ?? defaultSourceFrontend();
  const viewsEnabled = options.documentViewsEnabled ?? documentViewsEnabledAtStartup;
  const canReplaceProject = () => canPatchProjectRepresentations(vm);
  const activeView = () =>
    activeKamishibaiDocumentView({extensionStorage: vm.runtime.extensionStorage})?.activeKind ??
    'source';
  const requireRawSource = () => {
    if (activeView() !== 'source')
      throw error(
        'DOCUMENT_VIEW_ACTIVE',
        'Reflect the active block view into source before editing the raw YAML.',
      );
  };
  const probe = createDocument(vm, frontend);
  const documents = new Set<SourceDocumentAdapter>();
  const listeners = new Set<() => void>();
  let disposed = false;
  let lastOwner: unknown,
    lastSource: unknown,
    lastViews: unknown,
    lastText: unknown,
    lastActiveKinds: string | undefined;
  const changed = () => {
    const storage = vm.runtime.extensionStorage ?? {};
    const bundle = record(storage[BUNDLE]) ? storage[BUNDLE] : {};
    const components = record(bundle.components) ? bundle.components : {};
    const current = components[COMPONENT] ?? storage[COMPONENT];
    const source = record(current) ? current.source : undefined;
    const views = record(current) ? current.editorViews : undefined;
    const text = record(source) ? source.text : undefined;
    const activeKinds = JSON.stringify(
      record(views) && record(views.views)
        ? Object.entries(views.views).map(([key, value]) => [
            key,
            record(value) ? value.activeKind : undefined,
          ])
        : [],
    );
    if (
      current === lastOwner &&
      source === lastSource &&
      views === lastViews &&
      text === lastText &&
      activeKinds === lastActiveKinds
    )
      return;
    lastOwner = current;
    lastSource = source;
    lastViews = views;
    lastText = text;
    lastActiveKinds = activeKinds;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Metadata observers cannot change source. */
      }
    }
  };
  vm.runtime.on?.('PROJECT_LOADED', changed);
  vm.runtime.on?.('RUNTIME_DISPOSED', changed);
  vm.runtime.on?.('PROJECT_CHANGED', changed);
  return Object.freeze({
    id: kamishibaiEmbeddedYamlProviderId,
    hatOpcodes: Object.freeze([
      dsl4EmbeddedYamlRootOpcode,
      dsl4BundledEmbeddedYamlRootOpcode,
      dsl4EmbeddedYamlHatOpcode,
      dsl4BundledEmbeddedYamlHatOpcode,
      dsl4EmbeddedYamlConfigHatOpcode,
      dsl4BundledEmbeddedYamlConfigHatOpcode,
    ]),
    list() {
      if (disposed) return [];
      const state = probe.inspect();
      return [
        {
          documentId: kamishibaiEmbeddedYamlDocumentId,
          filename: state.filename || 'story.k4.yml',
          format: 'yaml' as const,
          activeRepresentation:
            'activeRepresentation' in state ? state.activeRepresentation : 'source',
          ...(viewsEnabled
            ? {
                representations: [
                  {
                    kind: 'yaml-blocks',
                    label: '共通YAMLブロック',
                    fromSource: true,
                    fromRepresentations: ['schema-blocks', 'yaml-blocks'],
                    toSource: true,
                    available: canReplaceProject(),
                    ...(!canReplaceProject()
                      ? {reason: 'The Editor does not support selective block updates.'}
                      : {}),
                  },
                  {
                    kind: 'schema-blocks',
                    label: '台本ブロック',
                    fromSource: true,
                    fromRepresentations: ['yaml-blocks', 'schema-blocks'],
                    toSource: true,
                    available: canReplaceProject(),
                    ...(!canReplaceProject()
                      ? {reason: 'The Editor does not support selective block updates.'}
                      : {}),
                  },
                ],
              }
            : {}),
          docsURL:
            'https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/dsl-author-guides/dsl-4.0-author-guide/',
          available: state.available,
          ...('reason' in state && state.reason ? {reason: state.reason} : {}),
          schema: {id: editorSchema.$id, schema: editorSchema},
        },
      ];
    },
    open(documentId: string) {
      if (disposed) throw error('DOCUMENT_DISPOSED', 'This document provider has ended.');
      if (documentId !== kamishibaiEmbeddedYamlDocumentId)
        throw error('DOCUMENT_NOT_FOUND', 'This document is not owned by the Kamishibai provider.');
      const base = createDocument(vm, frontend);
      const adapter =
        viewsEnabled && canReplaceProject()
          ? createProjectRepresentationAdapter({
              vm,
              adapter: base,
              reference: {providerId: kamishibaiEmbeddedYamlProviderId, documentId},
              buildPreviewArtifact: (input) =>
                buildKamishibaiDocumentPreviewArtifact(input, {
                  frontend,
                  replaceSource: (project, source) =>
                    buildSourceReplacement(project, source, frontend),
                }),
              buildPreview: (input) =>
                buildKamishibaiDocumentPreview(input, {
                  frontend,
                  replaceSource: (project, source) =>
                    buildSourceReplacement(project, source, frontend),
                }),
              buildCandidate: (input) =>
                buildKamishibaiDocumentViewCandidate(input, {
                  frontend,
                  replaceSource: (project, source) =>
                    buildSourceReplacement(project, source, frontend),
                }),
            })
          : base;
      const owned = Object.freeze({
        ...adapter,
        async prepare(snapshot: SourceDocumentSnapshot, source: string) {
          requireRawSource();
          return adapter.prepare(snapshot, source);
        },
        async commit(snapshot: SourceDocumentSnapshot, candidate: SourceDocumentPrepared) {
          requireRawSource();
          return adapter.commit(snapshot, candidate);
        },
        dispose() {
          adapter.dispose();
          documents.delete(owned);
        },
      });
      documents.add(owned);
      return owned;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      probe.dispose();
      for (const document of documents) document.dispose();
      documents.clear();
      listeners.clear();
      vm.runtime.off?.('PROJECT_LOADED', changed);
      vm.runtime.off?.('RUNTIME_DISPOSED', changed);
      vm.runtime.off?.('PROJECT_CHANGED', changed);
    },
  });
}

/** Select the canonical single-file or source-graph owner after every project load. */
export function createKamishibaiEmbeddedYamlProvider(
  vmInput: unknown,
  options: KamishibaiEmbeddedYamlProviderOptions = {},
): SourceDocumentProvider {
  const frontend = options.sourceFrontend ?? defaultSourceFrontend();
  const single = createSingleFileKamishibaiEmbeddedYamlProvider(vmInput, {
    ...options,
    sourceFrontend: frontend,
  });
  const graph = createKamishibaiGraphDocumentProvider(vmInput, {
    sourceFrontend: frontend,
    documentViewsEnabled: options.documentViewsEnabled ?? documentViewsEnabledAtStartup,
  });
  const vm = vmInput as Vm;
  let disposed = false;
  const selected = () => {
    if (disposed) throw error('DOCUMENT_DISPOSED', 'This document provider has ended.');
    const storage = vm.runtime.extensionStorage ?? {};
    const bundle = record(storage[BUNDLE]) ? storage[BUNDLE] : {};
    const components = record(bundle.components) ? bundle.components : {};
    const owner = components[COMPONENT] ?? storage[COMPONENT];
    return record(owner) && Object.hasOwn(owner, 'sourceDocuments') ? graph : single;
  };
  return Object.freeze({
    id: kamishibaiEmbeddedYamlProviderId,
    hatOpcodes: Object.freeze([
      ...new Set([...(single.hatOpcodes ?? []), ...(graph.hatOpcodes ?? [])]),
    ]),
    list: () => (disposed ? [] : selected().list()),
    open: (documentId: string) => selected().open(documentId),
    subscribe(listener: () => void) {
      const offSingle = single.subscribe?.(listener),
        offGraph = graph.subscribe?.(listener);
      return () => {
        offSingle?.();
        offGraph?.();
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      single.dispose?.();
      graph.dispose?.();
    },
  });
}

const registrationSlot = Symbol.for(
  '@kubohiroya/turbowarp-kamishibai-app/embedded-yaml-registration/v1',
);

/** The runtime owns registration; reloading it invalidates old editing sessions. */
export function registerKamishibaiEmbeddedYamlProvider(
  vmInput: unknown,
  options: KamishibaiEmbeddedYamlProviderOptions = {},
): () => void {
  const vm = vmInput as Vm & {[registrationSlot]?: () => void};
  vm[registrationSlot]?.();
  const frontend = options.sourceFrontend ?? defaultSourceFrontend();
  const provider = createKamishibaiEmbeddedYamlProvider(vm, {
    ...options,
    sourceFrontend: frontend,
  });
  // The data source contract adds URL locations; without it this owner keeps SB3-only documents.
  const documentSourceEnabled = options.documentSourceEnabled ?? documentSourceEnabledAtStartup;
  const unregister = documentSourceEnabled
    ? getDocumentSourceRegistry(vm as unknown as DocumentSourceVM).register(
        provider,
        createKamishibaiDocumentSourceOwnerOptions({
          replaceSource: (project, source) =>
            buildSourceReplacement(project as JsonObject, source, frontend),
          ...(options.fetch ? {fetch: options.fetch} : {}),
        }),
      )
    : getSourceDocumentRegistry(vm).register(provider);
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    if (vm[registrationSlot] === dispose) delete vm[registrationSlot];
    unregister();
  };
  Object.defineProperty(vm, registrationSlot, {value: dispose, configurable: true});
  return dispose;
}
