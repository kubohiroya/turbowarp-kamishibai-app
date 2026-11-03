import {addSchemaLineCommentBlocks} from './embedded-yaml-schema-comments.js';
import {createYamlBlockOpcodes} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {buildKamishibaiGraphDocumentViewCandidate} from './embedded-yaml-graph-views.js';
import {replaceGraphDocumentSource} from './embedded-yaml-graph-provider.js';
import {patchKamishibaiSourceValue} from './embedded-yaml-syntax-patch.js';
import {parse, parseDocument} from 'yaml';
import {
  readReference,
  validateEmbeddedYamlRelativePath,
} from '@kubohiroya/turbowarp-document-source';
import {encodeSourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import {
  readDocumentViewMetadata,
  writeDocumentViewMetadata,
} from '@kubohiroya/turbowarp-document-data/view-metadata';
import {extractDsl4BlockSourcesFromProject} from './turbowarp-yaml-json-block-source.js';
import {
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4IncludeBlocksOpcode,
} from './structured-block-source.js';
import {
  createKamishibaiIncludeReferenceView,
  readKamishibaiIncludeReferenceView,
} from './embedded-yaml-include-views.js';
import {
  createEmbeddedYamlSourceGraphRecord,
  composeGraphComponent,
  validateGraphComponentProjection,
  sourceGraphDocumentId,
  readEmbeddedYamlSourceGraphRecord,
} from './embedded-yaml-source-graph.js';
import {createDsl4SourceGraph, resolveDsl4SourceRelativeAssetPath} from './source-graph.js';
import {createDsl4SourceGraphFrontend} from './source-graph-frontend.js';
import {dsl4StandardProductionFeatureFlags} from './feature-flags.js';
import {installDsl4EmbeddedYamlRoot} from './embedded-yaml-hat.js';
import {validateKamishibaiEmbeddedYamlRoot} from './embedded-yaml-root-validation.js';
import {
  kamishibaiEmbeddedYamlProviderId,
  dsl4EmbeddedYamlHatOpcode,
  dsl4BundledEmbeddedYamlHatOpcode,
  dsl4EmbeddedYamlRootOpcode,
  dsl4BundledEmbeddedYamlRootOpcode,
} from './embedded-yaml-identity.js';
import type {Dsl4SourceFrontend} from './source-frontend.js';
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => structuredClone(value);
function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), {code});
}
const legacy = new Set([
  dsl4LabeledBlockSourceHatOpcode,
  dsl4ConfigBlockSourceHatOpcode,
  dsl4IncludeBlocksOpcode,
]);
function targets(project: RecordValue) {
  if (
    !Array.isArray(project.targets) ||
    project.targets.some((t) => !object(t) || !object(t.blocks))
  )
    fail('K4-MIGRATION-PROJECT', 'A serialized Scratch project is required.');
  return project.targets as RecordValue[];
}
function owner(project: RecordValue) {
  const storage = object(project.extensionStorage) ? project.extensionStorage : {},
    bundle = object(storage.kubohiroyakamishibai4) ? storage.kubohiroyakamishibai4 : {},
    components = object(bundle.components) ? bundle.components : {};
  const bundled = components.kubohiroyakamishibairuntime4,
    direct = storage.kubohiroyakamishibairuntime4;
  if (bundled !== undefined && direct !== undefined)
    fail('K4-MIGRATION-OWNER', 'The project has ambiguous runtime component owners.');
  const component = bundled ?? direct;
  if (
    !object(component) ||
    !object(component.source) ||
    !object(component.artifact) ||
    !object(component.assets) ||
    component.compiled !== undefined
  )
    fail(
      'K4-MIGRATION-COMPONENT',
      'An editable official Kamishibai runtime component with existing assets is required.',
    );
  return {
    component,
    parent: bundled !== undefined ? components : storage,
    channel: bundled !== undefined ? ('bundled' as const) : ('unbundled' as const),
  };
}
function literal(blocks: RecordValue, block: RecordValue, name: string): string {
  const value = (block.inputs as RecordValue)?.[name];
  if (value === undefined && name === 'LABEL') return '';
  if (Array.isArray(value) && [1, 2, 3].includes(value[0])) {
    const item = value[1];
    if (Array.isArray(item) && item[0] === 10 && typeof item[1] === 'string') return item[1];
    if (typeof item === 'string' && object(blocks[item])) {
      const b = blocks[item] as RecordValue,
        f = (b.fields as RecordValue)?.TEXT;
      if (b.shadow === true && b.opcode === 'text' && Array.isArray(f) && typeof f[0] === 'string')
        return f[0];
    }
  }
  fail('K4-MIGRATION-LITERAL', 'Document labels and JSON definitions must be static text.');
}
function setLiteral(blocks: RecordValue, block: RecordValue, name: string, text: string) {
  const inputs = block.inputs as RecordValue,
    value = inputs[name];
  if (Array.isArray(value) && Array.isArray(value[1])) {
    inputs[name] = [1, [10, text]];
    return;
  }
  if (Array.isArray(value) && typeof value[1] === 'string' && object(blocks[value[1]])) {
    const shadow = blocks[value[1]] as RecordValue;
    shadow.fields = {...(shadow.fields as RecordValue), TEXT: [text, null]};
    return;
  }
  fail('K4-MIGRATION-LITERAL', 'A definition cannot be updated without evaluating a reporter.');
}
function relative(from: string, to: string) {
  const base = from.split('/').slice(0, -1),
    dest = to.split('/');
  while (base.length && dest.length && base[0] === dest[0]) {
    base.shift();
    dest.shift();
  }
  return [...base.map(() => '..'), ...dest].join('/');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(
        (key) =>
          !(value.kind === 'StoryDocument' && ['sourceMap', 'sourceOrigins'].includes(key)) &&
          !(value.kind === 'Action' && key === 'sourceRange'),
      )
      .map((key) => [
        key,
        value.kind === 'StoryDocument' && key === 'metadata' && object(value[key])
          ? canonical(
              Object.fromEntries(Object.entries(value[key]).filter(([k]) => k !== 'sourceId')),
            )
          : canonical(value[key]),
      ]),
  );
}
async function story(
  files: Readonly<Record<string, string>>,
  entryPath: string,
  frontend: Dsl4SourceFrontend,
  project: RecordValue,
  sourceId: string,
) {
  const graph = await createDsl4SourceGraph(entryPath, {
    readSource(path) {
      if (!Object.hasOwn(files, path))
        fail('K4-MIGRATION-INCLUDE', `Missing source module: ${path}`);
      return files[path]!;
    },
  });
  const result = createDsl4SourceGraphFrontend(frontend).parse(graph, {
    featureFlags: {
      ...dsl4StandardProductionFeatureFlags,
      dsl4Runtime: true,
      dsl4SourceIncludes: true,
    },
    project,
    sourceId,
    maxComposedSourceBytes: 4 * 1024 * 1024,
  });
  if (!result.ok)
    fail(
      'K4-MIGRATION-VALIDATION',
      result.diagnostics.map((d) => `${d.sourceId}: ${d.message}`).join('\n'),
    );
  return (result as unknown as {storyDocument: RecordValue}).storyDocument;
}
function exposeExistingSourceComments(
  project: RecordValue,
  documents: readonly {filename: string; reference: {providerId: string; documentId: string}}[],
) {
  const selected = owner(project),
    graph = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
  const descriptor = {
    version: 1 as const,
    kind: 'schema-include-references' as const,
    form: selected.channel,
    entryReference: documents.find((doc) => doc.filename === graph.entryPath)!.reference,
    documents: documents.map((doc) => ({
      reference: doc.reference,
      label: doc.filename === graph.entryPath ? '' : doc.filename,
    })),
    maxIncludeDepth: 32,
  };
  const extracted = readKamishibaiIncludeReferenceView(project, descriptor);
  for (const [index, doc] of documents.entries()) {
    const encoded = encodeSourceDocumentReference(doc.reference),
      matches = targets(project).flatMap((target) =>
        Object.entries(target.blocks as RecordValue)
          .filter(
            ([, b]) =>
              object(b) &&
              [dsl4EmbeddedYamlHatOpcode, dsl4BundledEmbeddedYamlHatOpcode].includes(
                String(b.opcode),
              ) &&
              object(b.fields) &&
              Array.isArray(b.fields.DOCUMENT) &&
              b.fields.DOCUMENT[0] === encoded,
          )
          .map(([id, block]) => ({target, id, block: block as RecordValue})),
      );
    if (matches.length !== 1)
      fail('K4-MIGRATION-COMMENTS', 'A raw document has no unique schema body for its comments.');
    const match = matches[0]!,
      virtual = Object.entries(extracted.sourceLocations).find(
        ([, location]) =>
          location.blockId === match.id && location.targetName === match.target.name,
      )?.[0];
    if (!virtual) fail('K4-MIGRATION-COMMENTS', 'A schema comment location cannot be identified.');
    const opcode = createYamlBlockOpcodes(
      String(match.block.opcode).slice(0, -'embeddedYaml'.length),
    ).lineComment;
    if (!opcode) fail('K4-MIGRATION-COMMENTS', 'The runtime has no line-comment declaration.');
    const lineComments = addSchemaLineCommentBlocks({
      source: graph.files[doc.filename]!.source,
      blocks: match.target.blocks as RecordValue,
      rootIds: [match.id],
      locations: extracted.blockLocations
        .filter((location) => location.sourcePath === virtual)
        .map((location) => ({path: location.path, blockId: location.blockId})),
      semanticValue: parse(graph.files[doc.filename]!.source),
      opcode,
      idPrefix: `migration-line-comment-${index}-`,
    });
    const current = readDocumentViewMetadata(selected.component, doc.reference);
    if (!current) fail('K4-MIGRATION-COMMENTS', 'A migrated schema descriptor is missing.');
    writeDocumentViewMetadata(selected.component, doc.reference, {
      ...current,
      descriptors: {
        ...current.descriptors,
        'schema-blocks': {...(current.descriptors['schema-blocks'] as RecordValue), lineComments},
      },
    });
  }
}

export interface EmbeddedYamlMigrationReport {
  readonly version: 1;
  readonly status: 'migrated' | 'already-migrated';
  readonly channel: 'bundled' | 'unbundled';
  readonly entryFile: string;
  readonly documents: readonly {
    label: string;
    filename: string;
    reference: {providerId: string; documentId: string};
  }[];
  readonly generatedYaml: boolean;
  readonly standardCommentsPreserved: number;
  readonly warnings: readonly string[];
}
/** Pure migration; preserves existing declaration bodies and standard Scratch comments. */
export async function migrateDsl4LegacyBlockProject(
  projectInput: RecordValue,
  {
    sourceFrontend,
    entryFile = 'story.k4.yml',
    documentPaths = {},
  }: {
    sourceFrontend: Dsl4SourceFrontend;
    entryFile?: string;
    documentPaths?: Readonly<Record<string, string>>;
  },
): Promise<{project: RecordValue; report: EmbeddedYamlMigrationReport}> {
  const originalTargets = targets(projectInput),
    selected = owner(projectInput);
  const hasLegacy = originalTargets.some((t) =>
    Object.values(t.blocks as RecordValue).some((b) => object(b) && legacy.has(String(b.opcode))),
  );
  if (selected.component.sourceDocuments !== undefined && hasLegacy) {
    validateKamishibaiEmbeddedYamlRoot(projectInput, {allowLegacySingle: false});
    const existing = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
    const views =
      object(selected.component.editorViews) && object(selected.component.editorViews.views)
        ? selected.component.editorViews.views
        : {};
    if (
      Object.values(views).some(
        (v) => object(v) && v.activeKind !== undefined && v.activeKind !== 'source',
      )
    )
      fail(
        'K4-MIGRATION-MIXED',
        'A mixed project contains active document edits. Reflect them before migration.',
      );
    const extracted = extractDsl4BlockSourcesFromProject(projectInput);
    if (Object.keys(existing.files).length !== Object.keys(extracted.sources).length)
      fail(
        'K4-MIGRATION-MIXED',
        'A mixed project has additional canonical files; they cannot be discarded implicitly.',
      );
    const clean = copy(projectInput),
      normal = new Set([dsl4EmbeddedYamlHatOpcode, dsl4BundledEmbeddedYamlHatOpcode]),
      roots = new Set([dsl4EmbeddedYamlRootOpcode, dsl4BundledEmbeddedYamlRootOpcode]);
    let previousRoot: {id: string; block: RecordValue; target: number} | undefined;
    for (const [index, target] of targets(clean).entries())
      for (const [id, b] of Object.entries(target.blocks as RecordValue)) {
        if (!object(b)) continue;
        if (normal.has(String(b.opcode))) {
          const ref = readReference(b, {blocks: target.blocks});
          if (
            ref.providerId !== kamishibaiEmbeddedYamlProviderId ||
            b.next !== null ||
            b.comment !== undefined ||
            Object.values(object(target.comments) ? target.comments : {}).some(
              (c) => object(c) && c.blockId === id,
            )
          )
            fail(
              'K4-MIGRATION-MIXED',
              'Existing document placeholders must be empty and unannotated before combining with legacy authoring.',
            );
          delete (target.blocks as RecordValue)[id];
        } else if (roots.has(String(b.opcode))) {
          previousRoot = {id, block: copy(b), target: index};
          delete (target.blocks as RecordValue)[id];
        }
      }
    const cleanOwner = owner(clean);
    delete cleanOwner.component.sourceDocuments;
    delete cleanOwner.component.editorViews;
    const converted = await migrateDsl4LegacyBlockProject(clean, {
      sourceFrontend,
      entryFile,
      documentPaths,
    });
    const expectedOldPaths = new Set(
      converted.report.documents.map((doc) =>
        doc.label === '' ? existing.entryPath : doc.filename,
      ),
    );
    if (Object.keys(existing.files).some((path) => !expectedOldPaths.has(path)))
      fail('K4-MIGRATION-MIXED', 'An existing raw module has no unambiguous migrated counterpart.');
    const latestOwner = owner(converted.project),
      latest = readEmbeddedYamlSourceGraphRecord(latestOwner.component.sourceDocuments),
      preserved: Record<string, string> = {};
    for (const doc of converted.report.documents) {
      const oldPath = doc.label === '' ? existing.entryPath : doc.filename,
        previous = existing.files[oldPath];
      if (!previous) fail('K4-MIGRATION-MIXED', 'A raw module cannot be identified safely.');
      const generated = latest.files[doc.filename]!.source;
      preserved[doc.filename] = patchKamishibaiSourceValue(
        previous.source,
        parse(previous.source),
        parse(generated),
      );
    }
    const preservedRecord = await createEmbeddedYamlSourceGraphRecord({
        entryPath: entryFile,
        files: preserved,
      }),
      preservedComponent = await composeGraphComponent(
        latestOwner.component,
        preservedRecord,
        sourceFrontend,
        {project: converted.project},
      );
    latestOwner.parent.kubohiroyakamishibairuntime4 = copy(preservedComponent);
    const persisted = latestOwner.parent.kubohiroyakamishibairuntime4 as RecordValue;
    for (const doc of converted.report.documents)
      writeDocumentViewMetadata(persisted, doc.reference, {
        activeKind: 'schema-blocks',
        descriptors: {
          'schema-blocks': {
            version: 1,
            kind: 'graph-schema-blocks',
            reference: doc.reference,
            form: selected.channel,
            baseSourceRevision: preservedRecord.files[doc.filename]!.integrity,
            sourceGraphIntegrity: preservedRecord.integrity,
          },
        },
      });

    if (previousRoot) {
      const target = targets(converted.project)[previousRoot.target]!,
        blocks = target.blocks as RecordValue,
        newRoot = Object.entries(blocks).find(([, b]) => object(b) && roots.has(String(b.opcode)));
      if (!newRoot) fail('K4-MIGRATION-ROOT', 'The migrated root was not created.');
      const [id, b] = newRoot;
      delete blocks[id];
      blocks[previousRoot.id] = {
        ...previousRoot.block,
        ...(b as RecordValue),
        ...(previousRoot.block.comment !== undefined ? {comment: previousRoot.block.comment} : {}),
      };
    }
    exposeExistingSourceComments(converted.project, converted.report.documents);
    validateKamishibaiEmbeddedYamlRoot(converted.project, {allowLegacySingle: false});
    return {
      ...converted,
      report: {
        ...converted.report,
        warnings: [
          ...converted.report.warnings,
          'Empty raw-file placeholders from an authoring base were reused; active or annotated placeholders are never discarded.',
        ],
      },
    };
  }
  if (selected.component.sourceDocuments !== undefined) {
    const graph = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
    validateKamishibaiEmbeddedYamlRoot(projectInput, {allowLegacySingle: false});
    await validateGraphComponentProjection(selected.component, sourceFrontend, {
      project: projectInput,
    });
    return {
      project: projectInput,
      report: {
        version: 1,
        status: 'already-migrated',
        channel: selected.channel,
        entryFile: graph.entryPath,
        documents: Object.keys(graph.files).map((filename) => ({
          label: filename === graph.entryPath ? '' : filename,
          filename,
          reference: {
            providerId: kamishibaiEmbeddedYamlProviderId,
            documentId: sourceGraphDocumentId(graph, filename),
          },
        })),
        generatedYaml: false,
        standardCommentsPreserved: originalTargets.reduce(
          (n, t) => n + Object.keys(object(t.comments) ? t.comments : {}).length,
          0,
        ),
        warnings: ['Already migrated; no block or raw-source conversion was performed.'],
      } satisfies EmbeddedYamlMigrationReport,
    };
  }
  validateEmbeddedYamlRelativePath(entryFile);
  const extracted = extractDsl4BlockSourcesFromProject(projectInput),
    labels = new Map<string, string>(),
    paths = new Map<string, string>();
  for (const [oldPath, location] of Object.entries(extracted.sourceLocations)) {
    const matches = originalTargets.filter((t) => t.name === location.targetName),
      target = matches.find((t) => Object.hasOwn(t.blocks as RecordValue, location.blockId));
    if (!target) fail('K4-MIGRATION-LOCATION', 'A declaration could not be located unambiguously.');
    const blocks = target.blocks as RecordValue,
      hat = blocks[location.blockId] as RecordValue,
      label = literal(blocks, hat, 'LABEL');
    const filename =
      oldPath === extracted.entryPath
        ? entryFile
        : (documentPaths[label] ??
          (/\.(?:k4\.ya?ml|kamishibai\.ya?ml)$/u.test(label) ? label : `${label}.k4.yml`));
    validateEmbeddedYamlRelativePath(filename);
    paths.set(oldPath, filename);
    labels.set(oldPath, label);
  }
  for (const label of Object.keys(documentPaths))
    if (![...labels.values()].includes(label))
      fail('K4-MIGRATION-MAPPING', `Unknown document label: ${label}`);
  const sources: Record<string, string> = {};
  for (const [oldPath, text] of Object.entries(extracted.sources)) {
    const filename = paths.get(oldPath)!;
    if (Object.hasOwn(sources, filename))
      fail('K4-MIGRATION-MAPPING', 'Two documents resolve to the same filename.');
    const doc = parseDocument(text),
      value = doc.toJS() as RecordValue;
    if (value.include !== undefined) {
      const refs = typeof value.include === 'string' ? [value.include] : value.include;
      if (!Array.isArray(refs) || refs.some((p) => typeof p !== 'string' || !paths.has(p)))
        fail('K4-MIGRATION-INCLUDE', 'A legacy include has no mapped document.');
      const mapped = refs.map((p) => relative(filename, paths.get(p)!));
      doc.set('include', typeof value.include === 'string' ? mapped[0] : mapped);
    }
    if (object(value.assets))
      for (const [id, asset] of Object.entries(value.assets))
        if (object(asset) && typeof asset.file === 'string')
          doc.setIn(
            ['assets', id, 'file'],
            relative(filename, resolveDsl4SourceRelativeAssetPath(oldPath, asset.file)),
          );
    sources[filename] = doc.toString({lineWidth: 0});
  }
  const record = await createEmbeddedYamlSourceGraphRecord({entryPath: entryFile, files: sources});
  const documents = [...paths].map(([oldPath, filename]) => ({
    label: labels.get(oldPath)!,
    filename,
    reference: {
      providerId: kamishibaiEmbeddedYamlProviderId,
      documentId: sourceGraphDocumentId(record, filename),
    },
  }));
  const beforeStory = await story(
    extracted.sources,
    extracted.entryPath,
    sourceFrontend,
    projectInput,
    String((selected.component.source as RecordValue).sourceId),
  );
  const projected = createKamishibaiIncludeReferenceView(projectInput, {
    entryReference: documents.find((d) => d.filename === entryFile)!.reference,
    documents: documents.map(({label, reference}) => ({label, reference})),
    form: selected.channel,
  });
  const project = projected.project as RecordValue;
  const current = owner(project),
    source = current.component.source as RecordValue,
    basename = entryFile.split('/').at(-1)!;
  const prior = {
    ...current.component,
    application: {mode: 'story'},
    source: {
      ...source,
      displayName: basename,
      ...(object(source.cacheIdentity)
        ? {cacheIdentity: {...source.cacheIdentity, label: basename}}
        : {}),
    },
  };
  const component = await composeGraphComponent(prior, record, sourceFrontend, {project});
  const afterStory = await story(
    sources,
    entryFile,
    sourceFrontend,
    project,
    String(source.sourceId),
  );
  if (JSON.stringify(canonical(beforeStory)) !== JSON.stringify(canonical(afterStory)))
    fail(
      'K4-MIGRATION-NOT-EQUIVALENT',
      'The generated documents change the composed story meaning.',
    );
  // Preserve schema bodies; only file-backed asset literals need rebasing after a path relocation.
  for (const item of documents) {
    const oldPath = [...paths].find(([, p]) => p === item.filename)![0];
    if (
      oldPath.split('/').slice(0, -1).join('/') === item.filename.split('/').slice(0, -1).join('/')
    )
      continue;
    const encoded = encodeSourceDocumentReference(item.reference);
    for (const target of targets(project)) {
      const blocks = target.blocks as RecordValue;
      for (const root of Object.values(blocks)) {
        if (
          !object(root) ||
          !object(root.fields) ||
          !Array.isArray(root.fields.DOCUMENT) ||
          root.fields.DOCUMENT[0] !== encoded
        )
          continue;
        const pending = typeof root.next === 'string' ? [root.next] : [],
          seen = new Set<string>();
        while (pending.length) {
          const id = pending.pop()!;
          if (seen.has(id)) continue;
          seen.add(id);
          const b = blocks[id];
          if (!object(b)) fail('K4-MIGRATION-GRAPH', 'A declaration body is incomplete.');
          if (b.opcode === 'kubohiroyakamishibaiauthoring4_asset') {
            const raw = literal(blocks, b, 'VALUE');
            let asset;
            try {
              asset = JSON.parse(raw);
            } catch {
              fail('K4-MIGRATION-LITERAL', 'An asset definition is not JSON.');
            }
            if (object(asset) && typeof asset.file === 'string')
              setLiteral(
                blocks,
                b,
                'VALUE',
                JSON.stringify({
                  ...asset,
                  file: relative(
                    item.filename,
                    resolveDsl4SourceRelativeAssetPath(oldPath, asset.file),
                  ),
                }),
              );
          }
          if (typeof b.next === 'string') pending.push(b.next);
          if (object(b.inputs))
            for (const input of Object.values(b.inputs))
              if (Array.isArray(input))
                for (const child of input.slice(1))
                  if (typeof child === 'string') pending.push(child);
        }
      }
    }
  }
  current.parent.kubohiroyakamishibairuntime4 = copy(component);
  const installed = current.parent.kubohiroyakamishibairuntime4 as RecordValue;
  for (const item of documents)
    writeDocumentViewMetadata(installed, item.reference, {
      activeKind: 'schema-blocks',
      descriptors: {
        'schema-blocks': {
          version: 1,
          kind: 'graph-schema-blocks',
          reference: item.reference,
          form: selected.channel,
          baseSourceRevision: record.files[item.filename]!.integrity,
          sourceGraphIntegrity: record.integrity,
        },
      },
    });
  installDsl4EmbeddedYamlRoot(project, {channel: selected.channel});
  validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false});
  // Verify the retained body graph before reporting success; no legacy entry/config/include opcode remains.
  const reread = readKamishibaiIncludeReferenceView(project, projected.descriptor);
  for (const [oldPath, text] of Object.entries(reread.sources)) {
    const filename = paths.get(oldPath);
    if (!filename)
      fail('K4-MIGRATION-NOT-EQUIVALENT', 'The retained body has an unmapped document.');
    const actual = parse(text) as RecordValue,
      expected = parse(sources[filename]!) as RecordValue;
    if (actual.include !== undefined) {
      const values = typeof actual.include === 'string' ? [actual.include] : actual.include;
      if (!Array.isArray(values) || values.some((p) => typeof p !== 'string' || !paths.has(p)))
        fail('K4-MIGRATION-NOT-EQUIVALENT', 'The retained body has an unknown include.');
      const resolved = values.map((p) => relative(filename, paths.get(p)!));
      actual.include = typeof actual.include === 'string' ? resolved[0] : resolved;
    }
    if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
      fail(
        'K4-MIGRATION-NOT-EQUIVALENT',
        `The retained schema body differs from its canonical file: ${filename}`,
      );
  }
  if (Object.keys(reread.sources).length !== documents.length)
    fail('K4-MIGRATION-NOT-EQUIVALENT', 'The retained schema graph lost a document.');
  if (
    targets(project).some((t) =>
      Object.values(t.blocks as RecordValue).some((b) => object(b) && legacy.has(String(b.opcode))),
    )
  )
    fail('K4-MIGRATION-LEGACY', 'A legacy source declaration remains.');
  const commentsBefore = originalTargets.reduce(
      (n, t) => n + Object.keys(object(t.comments) ? t.comments : {}).length,
      0,
    ),
    commentsAfter = targets(project).reduce(
      (n, t) => n + Object.keys(object(t.comments) ? t.comments : {}).length,
      0,
    );
  if (commentsBefore !== commentsAfter)
    fail('K4-MIGRATION-COMMENTS', 'Standard Scratch comments were not preserved.');
  return {
    project,
    report: {
      version: 1,
      status: 'migrated',
      channel: selected.channel,
      entryFile,
      documents,
      generatedYaml: true,
      standardCommentsPreserved: commentsAfter,
      warnings: [
        'YAML was generated from legacy blocks; original YAML whitespace, quoting and comments cannot be reconstructed. Standard Scratch comments remain attached to their preserved blocks.',
      ],
    } satisfies EmbeddedYamlMigrationReport,
  };
}

/** Read the latest source of every document in an isolated owner clone, including edited block views. */
export async function extractEmbeddedYamlDocumentSources(
  projectInput: RecordValue,
  sourceFrontend: Dsl4SourceFrontend,
) {
  let project = copy(projectInput);
  validateKamishibaiEmbeddedYamlRoot(project, {allowLegacySingle: false});
  let selected = owner(project),
    graph = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
  for (const filename of Object.keys(graph.files)) {
    selected = owner(project);
    graph = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
    const reference = {
        providerId: kamishibaiEmbeddedYamlProviderId,
        documentId: sourceGraphDocumentId(graph, filename),
      },
      view = readDocumentViewMetadata(selected.component, reference);
    if (!view || view.activeKind === 'source') continue;
    if (!['yaml-blocks', 'schema-blocks'].includes(view.activeKind))
      fail('K4-MIGRATION-VIEW', 'This stored document representation cannot be exported safely.');
    const result = await buildKamishibaiGraphDocumentViewCandidate(
      {
        project,
        source: graph.files[filename]!.source,
        reference,
        request: {kind: view.activeKind, direction: 'to-source'},
      },
      {
        frontend: sourceFrontend,
        replaceSource: (candidate, id, source) =>
          replaceGraphDocumentSource(candidate, id, source, sourceFrontend),
      },
    );
    project = result.project;
  }
  selected = owner(project);
  graph = readEmbeddedYamlSourceGraphRecord(selected.component.sourceDocuments);
  await validateGraphComponentProjection(selected.component, sourceFrontend, {project});
  return {
    formatVersion: 1,
    entryPath: graph.entryPath,
    sources: Object.fromEntries(
      Object.entries(graph.files).map(([filename, file]) => [filename, file.source]),
    ),
  };
}
