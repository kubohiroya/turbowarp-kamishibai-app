import {parse as parseYaml} from 'yaml';
import {validateKamishibaiEmbeddedYamlRoot} from './embedded-yaml-root-validation.js';
import {
  createProjectRepresentationAdapter,
  canPatchProjectRepresentations,
} from '@kubohiroya/turbowarp-document-data/project-views';
import type {
  SourceDocumentAdapter,
  SourceDocumentProvider,
  SourceDocumentSnapshot,
  SourceDocumentPrepared,
} from '@kubohiroya/turbowarp-document-data/composition';
import {encodeSourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import editorSchema from '../../schema/dsl-4-editor.schema.json' with {type: 'json'};
import type {Dsl4SourceFrontend} from './source-frontend.js';
import {
  readEmbeddedYamlSourceGraphRecord,
  createEmbeddedYamlSourceGraphRecord,
  validateGraphComponentProjection,
  composeGraphComponent,
  sourceGraphDocumentId,
  sourceGraphDocumentPath,
} from './embedded-yaml-source-graph.js';
import {
  buildKamishibaiGraphDocumentViewCandidate,
  buildKamishibaiGraphDocumentPreview,
  buildKamishibaiGraphDocumentPreviewArtifact,
} from './embedded-yaml-graph-views.js';
import {
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlConfigHatOpcode,
  dsl4BundledEmbeddedYamlConfigHatOpcode,
  kamishibaiEmbeddedYamlProviderId,
} from './embedded-yaml-identity.js';
import {
  dsl4EmbeddedYamlIncludeOpcode,
  dsl4BundledEmbeddedYamlIncludeOpcode,
} from './embedded-yaml-include-views.js';

type ObjectRecord = Record<string, unknown>;
interface Target {
  isOriginal?: boolean;
}
interface Runtime {
  extensionStorage?: ObjectRecord;
  targets?: Target[];
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
const BUNDLE = 'kubohiroyakamishibai4',
  COMPONENT = 'kubohiroyakamishibairuntime4';
const object = (value: unknown): value is ObjectRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
function selected(project: ObjectRecord) {
  const storage = object(project.extensionStorage) ? project.extensionStorage : {};
  const bundle = object(storage[BUNDLE]) ? storage[BUNDLE] : {};
  const components = object(bundle.components) ? bundle.components : {};
  const bundled = components[COMPONENT],
    direct = storage[COMPONENT];
  if (bundled !== undefined && direct !== undefined)
    fail('AMBIGUOUS_SOURCE', 'The project contains two runtime component channels.');
  const component = bundled ?? direct;
  if (!object(component)) fail('SOURCE_GRAPH_MISSING', 'The source document graph is unavailable.');
  const parent = bundled !== undefined ? components : storage;
  const graph = readEmbeddedYamlSourceGraphRecord(component.sourceDocuments);
  return {
    storage,
    bundle,
    parent,
    component,
    graph,
    channel: bundled !== undefined ? ('bundled' as const) : ('unbundled' as const),
  };
}
function document(project: ObjectRecord, documentId: string) {
  const current = selected(project),
    path = sourceGraphDocumentPath(current.graph, documentId),
    file = current.graph.files[path];
  if (!file) fail('DOCUMENT_NOT_FOUND', 'This source document is not registered.');
  return {...current, path, file};
}
function activeDocuments(component: ObjectRecord) {
  const views =
    object(component.editorViews) && object(component.editorViews.views)
      ? component.editorViews.views
      : {};
  return Object.entries(views).filter(
    ([, state]) =>
      object(state) && typeof state.activeKind === 'string' && state.activeKind !== 'source',
  );
}
function activeKind(component: ObjectRecord, documentId: string) {
  const key = encodeSourceDocumentReference({
    providerId: kamishibaiEmbeddedYamlProviderId,
    documentId,
  });
  const views =
    object(component.editorViews) && object(component.editorViews.views)
      ? component.editorViews.views
      : {};
  return object(views[key]) && typeof views[key].activeKind === 'string'
    ? views[key].activeKind
    : 'source';
}
/** Validate the complete source graph and replace one raw document in a caller-owned copy. */
export async function replaceGraphDocumentSource(
  project: ObjectRecord,
  documentId: string,
  source: string,
  frontend: Dsl4SourceFrontend,
) {
  const root = validateKamishibaiEmbeddedYamlRoot(project, {
    allowEntryMismatch: true,
  });
  if (typeof source !== 'string') fail('YAML_INVALID', 'The YAML source must be text.');
  const current = document(project, documentId);
  const entryPath =
    root?.path ?? fail('K4-ROOT-MISSING', 'An explicit source graph root is required.');
  const entryChanged = entryPath !== current.graph.entryPath;
  if (entryChanged && activeDocuments(current.component).length)
    fail('DOCUMENT_VIEW_ACTIVE', 'Reflect every active block view before changing the root file.');
  await validateGraphComponentProjection(current.component, frontend, {
    project,
  });
  const files = Object.fromEntries(
    Object.entries(current.graph.files).map(([path, file]) => [
      path,
      path === current.path ? source : file.source,
    ]),
  );
  if (entryChanged) {
    const entryValue = parseYaml(files[entryPath]!, {
      maxAliasCount: 0,
    }) as unknown;
    if (!object(entryValue) || entryValue.kamishibai !== '4.0')
      fail(
        'K4-ROOT-ENTRY-SCHEMA',
        'The selected root file must explicitly declare kamishibai: 4.0 as a string and form a valid entry story.',
      );
  }
  const graph = await createEmbeddedYamlSourceGraphRecord({entryPath, files});
  const component = {
    ...(await composeGraphComponent(current.component, graph, frontend, {
      project,
    })),
  };
  current.parent[COMPONENT] = component;
  validateKamishibaiEmbeddedYamlRoot(project);
  return {
    project,
    component,
    entryChanged,
    previousEntryPath: current.graph.entryPath,
    entryPath,
    summary: entryChanged
      ? `開始ファイルを ${current.graph.entryPath} から ${entryPath} に変更し、すべての原文を保持して台本全体を再検証します。`
      : '原文を保持して台本全体を検証しました。',
  };
}

function documentSchema(entry: boolean) {
  const result = clone(editorSchema) as ObjectRecord;
  result.$id = `https://kubohiroya.github.io/turbowarp-kamishibai-app/schema/dsl-4-editor-${entry ? 'entry' : 'module'}-source.schema.json`;
  result.title = entry ? 'DSL 4.0 entry source document' : 'DSL 4.0 partial source module';
  result.required = entry ? ['kamishibai'] : [];
  (result.properties as ObjectRecord).include = {
    oneOf: [
      {type: 'string', minLength: 1},
      {type: 'array', items: {type: 'string', minLength: 1}},
    ],
  };
  return Object.freeze({id: String(result.$id), schema: result});
}
const entrySchema = documentSchema(true),
  moduleSchema = documentSchema(false);
const originalTargets = (runtime: Runtime) =>
  (runtime.targets ?? []).filter((target) => target.isOriginal !== false);
function createDocument(vm: Vm, frontend: Dsl4SourceFrontend, documentId: string) {
  const runtime = vm.runtime;
  let disposed = false,
    generation = 0;
  const invalidated = () => {
    generation++;
  };
  runtime.on?.('RUNTIME_DISPOSED', invalidated);
  runtime.on?.('PROJECT_LOADED', invalidated);
  const live = () => {
    const storage = Object.fromEntries(Object.entries(runtime.extensionStorage ?? {}));
    const current = document({extensionStorage: storage}, documentId);
    const actual = runtime.extensionStorage!;
    const bundle = current.channel === 'bundled' ? actual[BUNDLE] : undefined;
    const parent =
      current.channel === 'bundled' && object(bundle) && object(bundle.components)
        ? bundle.components
        : actual;
    const descriptor = Object.getOwnPropertyDescriptor(parent, COMPONENT);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.writable !== true)
      fail('COMPONENT_UNAVAILABLE', 'The runtime component cannot be saved safely.');
    return {
      ...current,
      storage: actual,
      bundle,
      parent,
      component: descriptor.value as ObjectRecord,
      descriptor,
    };
  };
  type Baseline = {
    fingerprint: string;
    generation: number;
    storage: unknown;
    bundle: unknown;
    parent: ObjectRecord;
    component: ObjectRecord;
    targets: Target[];
  };
  const snapshots = new WeakMap<SourceDocumentSnapshot, Baseline>(),
    candidates = new WeakMap<
      SourceDocumentPrepared,
      {
        snapshot: SourceDocumentSnapshot;
        component: ObjectRecord;
        changed: boolean;
      }
    >();
  const active = () => {
    if (disposed) fail('DOCUMENT_DISPOSED', 'This editing session has ended.');
    if (vm.runtime !== runtime)
      fail('PROJECT_CONFLICT', 'The project changed. Open the document again.');
  };
  const baseline = (snapshot: SourceDocumentSnapshot) => {
    active();
    const saved = snapshots.get(snapshot);
    if (!saved) fail('DOCUMENT_CONFLICT', 'Open this source document before editing.');
    const now = live(),
      targets = originalTargets(runtime);
    if (
      saved.generation !== generation ||
      saved.fingerprint !== vm.toJSON(undefined, {allowOptimization: false}) ||
      saved.storage !== now.storage ||
      saved.bundle !== now.bundle ||
      saved.parent !== now.parent ||
      saved.component !== now.component ||
      saved.targets.length !== targets.length ||
      saved.targets.some((target, index) => target !== targets[index])
    )
      fail('PROJECT_CONFLICT', 'The project changed. Open the source document again.');
    return {saved, now};
  };
  return Object.freeze({
    inspect() {
      try {
        active();
        const current = live();
        return {
          available: true,
          filename: current.path,
          activeRepresentation: activeKind(current.component, documentId),
        };
      } catch (error) {
        const exception = error as Error & {code?: string};
        return {
          available: false,
          reason: exception.message,
          ...(exception.code ? {code: exception.code} : {}),
        };
      }
    },
    capture() {
      active();
      const fingerprint = vm.toJSON(undefined, {allowOptimization: false}),
        project = JSON.parse(fingerprint) as ObjectRecord,
        current = document(project, documentId),
        now = live();
      validateKamishibaiEmbeddedYamlRoot(project, {allowEntryMismatch: true});
      if (JSON.stringify(current.component) !== JSON.stringify(now.component))
        fail('PROJECT_CONFLICT', 'The source graph changed while opening it.');
      const snapshot = Object.freeze({
        source: current.file.source,
        sourceName: current.path.split('/').at(-1)!,
      });
      snapshots.set(snapshot, {
        fingerprint,
        generation,
        storage: now.storage,
        bundle: now.bundle,
        parent: now.parent,
        component: now.component,
        targets: originalTargets(runtime),
      });
      return snapshot;
    },
    async prepare(snapshot: SourceDocumentSnapshot, source: string) {
      const {saved} = baseline(snapshot),
        project = JSON.parse(saved.fingerprint) as ObjectRecord;
      const built = await replaceGraphDocumentSource(project, documentId, source, frontend);
      baseline(snapshot);
      const prepared = Object.freeze({source, summary: built.summary});
      candidates.set(prepared, {
        snapshot,
        component: built.component,
        changed: source !== snapshot.source || built.entryChanged,
      });
      return prepared;
    },
    async commit(snapshot: SourceDocumentSnapshot, prepared: SourceDocumentPrepared) {
      const candidate = candidates.get(prepared);
      if (!candidate || candidate.snapshot !== snapshot)
        fail('DOCUMENT_CONFLICT', 'Validate this source document in the same session first.');
      const {now} = baseline(snapshot);
      if (!candidate.changed) {
        candidates.delete(prepared);
        return {source: prepared.source};
      }
      Object.defineProperty(now.parent, COMPONENT, {
        ...now.descriptor,
        value: {
          ...now.component,
          sourceDocuments: clone(candidate.component.sourceDocuments),
          source: clone(candidate.component.source),
          artifact: clone(candidate.component.artifact),
        },
      });
      candidates.delete(prepared);
      snapshots.delete(snapshot);
      try {
        runtime.emitProjectChanged();
      } catch {
        /* Observer failure cannot undo the committed graph. */
      }
      return {source: prepared.source};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      runtime.off?.('RUNTIME_DISPOSED', invalidated);
      runtime.off?.('PROJECT_LOADED', invalidated);
    },
  });
}

/** The persistent owner exposes each exact raw file while its execution source is derived. */
export function createKamishibaiGraphDocumentProvider(
  vmInput: unknown,
  {
    sourceFrontend: frontend,
    documentViewsEnabled: viewsEnabled,
  }: {sourceFrontend: Dsl4SourceFrontend; documentViewsEnabled: boolean},
): SourceDocumentProvider {
  const vm = vmInput as Vm;
  const runtime = vm.runtime,
    documents = new Set<SourceDocumentAdapter>(),
    listeners = new Set<() => void>();
  let disposed = false;
  let lastOwner: unknown,
    lastRecord: unknown,
    lastViews: unknown,
    lastIntegrity: unknown,
    lastActiveKinds: string | undefined;
  const current = () =>
    selected({
      extensionStorage: Object.fromEntries(Object.entries(runtime.extensionStorage ?? {})),
    });
  const changed = () => {
    let record: unknown, views: unknown;
    const storage = runtime.extensionStorage ?? {};
    const bundle = object(storage[BUNDLE]) ? storage[BUNDLE] : {};
    const components = object(bundle.components) ? bundle.components : {};
    const owner = components[COMPONENT] ?? storage[COMPONENT];
    if (object(owner)) {
      record = owner.sourceDocuments;
      views = owner.editorViews;
    }
    const integrity = object(record) ? record.integrity : undefined;
    const activeKinds = JSON.stringify(
      object(views) && object(views.views)
        ? Object.entries(views.views).map(([key, value]) => [
            key,
            object(value) ? value.activeKind : undefined,
          ])
        : [],
    );
    if (
      owner === lastOwner &&
      record === lastRecord &&
      views === lastViews &&
      integrity === lastIntegrity &&
      activeKinds === lastActiveKinds
    )
      return;
    lastOwner = owner;
    lastRecord = record;
    lastViews = views;
    lastIntegrity = integrity;
    lastActiveKinds = activeKinds;
    for (const listener of listeners)
      try {
        listener();
      } catch {
        /* Metadata observers cannot change source. */
      }
  };
  for (const event of ['PROJECT_CHANGED', 'PROJECT_LOADED', 'RUNTIME_DISPOSED'])
    runtime.on?.(event, changed);
  const canReplace = () => canPatchProjectRepresentations(vm);
  const provider: SourceDocumentProvider = {
    id: kamishibaiEmbeddedYamlProviderId,
    hatOpcodes: Object.freeze([
      dsl4EmbeddedYamlRootOpcode,
      dsl4BundledEmbeddedYamlRootOpcode,
      dsl4EmbeddedYamlHatOpcode,
      dsl4BundledEmbeddedYamlHatOpcode,
      dsl4EmbeddedYamlConfigHatOpcode,
      dsl4BundledEmbeddedYamlConfigHatOpcode,
      dsl4EmbeddedYamlIncludeOpcode,
      dsl4BundledEmbeddedYamlIncludeOpcode,
    ]),
    list() {
      if (disposed) return [];
      try {
        const value = current();
        return [
          value.graph.entryPath,
          ...Object.keys(value.graph.files)
            .filter((path) => path !== value.graph.entryPath)
            .sort(),
        ].map((path) => {
          const documentId = sourceGraphDocumentId(value.graph, path);
          return {
            documentId,
            filename: path,
            format: 'yaml' as const,
            activeRepresentation: activeKind(value.component, documentId),
            available: true,
            docsURL:
              'https://kubohiroya.github.io/turbowarp-kamishibai-docs/4.0/dsl-author-guides/dsl-4.0-author-guide/',
            schema: path === value.graph.entryPath ? entrySchema : moduleSchema,
            ...(viewsEnabled
              ? {
                  representations: [
                    {
                      kind: 'yaml-blocks',
                      label: '共通YAMLブロック',
                      fromSource: true,
                      fromRepresentations: ['schema-blocks', 'yaml-blocks'],
                      toSource: true,
                      available: canReplace(),
                    },
                    {
                      kind: 'schema-blocks',
                      label: '台本ブロック',
                      fromSource: true,
                      fromRepresentations: ['yaml-blocks', 'schema-blocks'],
                      toSource: true,
                      available: canReplace(),
                    },
                  ],
                }
              : {}),
          };
        });
      } catch (error) {
        return [
          {
            documentId: 'story',
            filename: 'story.k4.yml',
            format: 'yaml',
            available: false,
            reason: (error as Error).message,
          },
        ];
      }
    },
    open(documentId) {
      if (disposed) fail('DOCUMENT_DISPOSED', 'This source document provider has ended.');
      const value = current();
      sourceGraphDocumentPath(value.graph, documentId);
      const base = createDocument(vm, frontend, documentId);
      const options = {
        frontend,
        replaceSource: (project: ObjectRecord, id: string, source: string) =>
          replaceGraphDocumentSource(project, id, source, frontend),
      };
      const adapter =
        viewsEnabled && canReplace()
          ? createProjectRepresentationAdapter({
              vm,
              adapter: base,
              reference: {
                providerId: kamishibaiEmbeddedYamlProviderId,
                documentId,
              },
              buildPreviewArtifact: (input) =>
                buildKamishibaiGraphDocumentPreviewArtifact(input, options),
              buildCandidate: (input) => buildKamishibaiGraphDocumentViewCandidate(input, options),
              buildPreview: (input) => buildKamishibaiGraphDocumentPreview(input, options),
            })
          : base;
      const requireSource = () => {
        const selected = current();
        if (activeKind(selected.component, documentId) !== 'source')
          fail(
            'DOCUMENT_VIEW_ACTIVE',
            'Reflect this document block view into source before editing its raw file.',
          );
      };
      const owned = Object.freeze({
        ...adapter,
        async prepare(snapshot: SourceDocumentSnapshot, source: string) {
          requireSource();
          return adapter.prepare(snapshot, source);
        },
        async commit(snapshot: SourceDocumentSnapshot, candidate: SourceDocumentPrepared) {
          requireSource();
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
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const document of documents) document.dispose();
      documents.clear();
      listeners.clear();
      for (const event of ['PROJECT_CHANGED', 'PROJECT_LOADED', 'RUNTIME_DISPOSED'])
        runtime.off?.(event, changed);
    },
  };
  return Object.freeze(provider);
}
